// The supervisor for every QR-tier WhatsApp session on this machine.
//
// This is the always-on process (docs/Architecture.md §6). It:
//
//   1. reads commands the web app puts on the queue — start, stop, send
//   2. starts a separate child process per customer, and keeps track of them
//   3. relays what those children report back into Redis and the database, so
//      the dashboard can show an honest connection status
//
// It never runs a customer's WhatsApp session itself. Every session lives in
// its own child process, so a crash takes down one customer's connection and
// nobody else's (docs/Architecture.md §5, docs/Rules.md §9).
//
// Run it with:  npm run whatsapp-worker
//
// That command reads .env if there is one and runs this file directly — Node
// executes TypeScript natively, so there is no build step and no extra tool to
// install. On a real worker host, set the environment variables properly and
// the .env is simply absent.

import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Queue, Worker } from "bullmq";

import { db } from "../../lib/db.ts";
import { createWorkerConnection } from "../../lib/redis.ts";
import { routeInboundMessage } from "../../message-router/router.ts";
import {
  startCampaignSender,
  stopCampaignSender,
} from "../../jobs/campaign-sender.ts";
import {
  COMMAND_QUEUE,
  EVENT_QUEUE,
  QR_TTL_SECONDS,
  liveStateKey,
  type ConnectionStatusValue,
  type LiveSessionState,
  type SessionCommand,
  type SessionEvent,
} from "./protocol.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const WORKER_SCRIPT = path.join(here, "worker.ts");

/** Every session running on this machine, by connection id. */
const running = new Map<string, ChildProcess>();

// The manager blocks on Redis waiting for work, so it needs the patient
// connection rather than the app's fail-fast one.
const redis = createWorkerConnection();

// ─── Telling the rest of the system what happened ───────────────────────────

/**
 * Writes the current state where the dashboard can poll it.
 *
 * Redis rather than the database, because this changes many times a minute
 * while somebody is scanning, and the QR code inside it is worthless after a
 * minute or so anyway.
 */
async function publishLiveState(
  connectionId: string,
  state: Omit<LiveSessionState, "updatedAt">,
) {
  const payload: LiveSessionState = {
    ...state,
    updatedAt: new Date().toISOString(),
  };

  await redis.set(
    liveStateKey(connectionId),
    JSON.stringify(payload),
    "EX",
    QR_TTL_SECONDS,
  );
}

/** Records the durable part of a status change, so it survives a restart. */
async function recordStatus(
  connectionId: string,
  status: ConnectionStatusValue,
  extra: { phoneNumber?: string; message?: string } = {},
) {
  await db.whatsAppConnection
    .update({
      where: { id: connectionId },
      data: {
        status,
        ...(extra.phoneNumber ? { phoneNumber: extra.phoneNumber } : {}),
        ...(status === "CONNECTED"
          ? { lastConnectedAt: new Date(), lastError: null }
          : {}),
        ...(status === "ERROR" && extra.message
          ? { lastError: extra.message }
          : {}),
      },
    })
    .catch((error: unknown) => {
      // The connection row was deleted while its worker was still running.
      console.error(`[manager] could not record status for ${connectionId}`, error);
    });
}

async function handleWorkerEvent(event: SessionEvent) {
  switch (event.type) {
    case "qr": {
      await publishLiveState(event.connectionId, {
        status: "CONNECTING",
        qr: event.qr,
        message: "Scan this with your phone.",
      });
      await recordStatus(event.connectionId, "CONNECTING");
      break;
    }

    case "status": {
      await publishLiveState(event.connectionId, {
        status: event.status,
        phoneNumber: event.phoneNumber,
        message: event.message,
      });
      await recordStatus(event.connectionId, event.status, {
        phoneNumber: event.phoneNumber,
        message: event.message,
      });
      break;
    }

    case "inbound": {
      // The QR tier's half of Phase 7. The API tier reaches the same router
      // from its webhook; this is the same message taking a different road.
      //
      // It runs here, in the always-on manager, rather than in the web app,
      // because this process is the only one that can actually talk to the
      // customer's session — the app is serverless and has no way to reach a
      // browser running on this machine.
      if (!event.from || !event.text) break;

      await routeInboundMessage(
        {
          connectionId: event.connectionId,
          from: event.from,
          text: event.text,
          answerable: event.answerable,
          contactName: event.contactName ?? null,
          externalId: event.externalId ?? null,
          at: new Date(event.at),
        },
        async (reply) => {
          try {
            sendMessage(event.connectionId, reply.to, reply.body);

            // Handed to the session process. Whether WhatsApp accepted it comes
            // back separately, as a "sent" event — claiming delivery here would
            // be the stale status docs/Rules.md §4 forbids.
            return { ok: true };
          } catch (error) {
            console.error(
              `[manager] could not hand a reply to ${event.connectionId}`,
              error,
            );

            return { ok: false, message: "The reply could not be sent." };
          }
        },
      );

      break;
    }

    case "sent": {
      await db.whatsAppConnection
        .update({
          where: { id: event.connectionId },
          data: {
            messagesSent: { increment: 1 },
            lastMessageAt: new Date(event.at),
          },
        })
        .catch(() => {});
      break;
    }
  }

  // Pass it on, so later phases can react to messages without changing this.
  //
  // What the customer said does NOT go on the shared queue. It has already been
  // dealt with above, and Redis is infrastructure every part of the system can
  // read — the contents belong in the owner's inbox and nowhere else
  // (docs/Rules.md §4).
  const relayed: SessionEvent =
    event.type === "inbound"
      ? { type: "inbound", connectionId: event.connectionId, at: event.at }
      : event;

  await eventQueue.add(relayed.type, relayed, {
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

const eventQueue = new Queue(EVENT_QUEUE, { connection: redis });

// ─── Starting and stopping one customer's session ───────────────────────────

function startSession(connectionId: string) {
  if (running.has(connectionId)) {
    console.log(`[manager] ${connectionId} is already running`);
    return;
  }

  console.log(`[manager] starting a session process for ${connectionId}`);

  const child = fork(WORKER_SCRIPT, [], {
    // Plain Node runs our TypeScript directly; the condition makes the
    // server-only marker package resolve to its no-op build.
    execArgv: ["--conditions=react-server"],
    env: {
      ...process.env,
      CONNECTION_ID: connectionId,
    },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });

  running.set(connectionId, child);

  child.on("message", (event) => {
    void handleWorkerEvent(event as SessionEvent);
  });

  child.on("exit", (code, signal) => {
    running.delete(connectionId);
    console.log(
      `[manager] session process for ${connectionId} exited (code=${code} signal=${signal})`,
    );

    // A worker that stopped on its own means the connection is down. Say so
    // rather than leaving a stale "connected" on the dashboard
    // (docs/Rules.md §4).
    if (code !== 0) {
      void publishLiveState(connectionId, {
        status: "DISCONNECTED",
        message: "The connection stopped unexpectedly. Try reconnecting.",
      });
      void recordStatus(connectionId, "DISCONNECTED");
    }
  });

  child.on("error", (error) => {
    console.error(`[manager] session process for ${connectionId} errored`, error);
  });
}

async function stopSession(connectionId: string, forget: boolean) {
  const child = running.get(connectionId);

  if (child) {
    console.log(`[manager] stopping ${connectionId}`);
    child.kill("SIGTERM");
    running.delete(connectionId);
  }

  if (forget) {
    // Unlinking on purpose: throw the saved session away so the next connection
    // starts with a fresh QR code rather than silently reusing the old login.
    await db.whatsAppSession.deleteMany({ where: { connectionId } });
  }

  await publishLiveState(connectionId, {
    status: "NOT_CONNECTED",
    message: forget ? "Disconnected." : "Stopped.",
  });
  await recordStatus(connectionId, "NOT_CONNECTED");
}

function sendMessage(connectionId: string, to: string, body: string) {
  const child = running.get(connectionId);

  if (!child) {
    throw new Error(`No running session for ${connectionId}`);
  }

  child.send({ type: "send", to, body });
}

// ─── Listening for what the web app asks for ────────────────────────────────

const commandWorker = new Worker<SessionCommand>(
  COMMAND_QUEUE,
  async (job) => {
    const command = job.data;

    switch (command.type) {
      case "start":
        startSession(command.connectionId);
        break;
      case "stop":
        await stopSession(command.connectionId, command.forget);
        break;
      case "send":
        sendMessage(command.connectionId, command.to, command.body);
        break;
    }
  },
  { connection: redis, concurrency: 20 },
);

commandWorker.on("failed", (job, error) => {
  console.error(`[manager] command ${job?.name} failed`, error);
});

console.log(
  `[manager] listening for WhatsApp commands. Sessions run as separate processes; ${running.size} active.`,
);

// Bulk sends are spaced over many minutes (docs/Rules.md §8), so they cannot
// run inside a web request. They run here, on the one host that is always up.
// Note this is not specific to the QR tier: an API-tier campaign needs a
// long-lived process just as much, it simply talks to Meta instead of to a
// browser session.
startCampaignSender();

// ─── Shutting down tidily ───────────────────────────────────────────────────

async function shutdown() {
  console.log(`[manager] shutting down ${running.size} session(s)`);

  for (const [connectionId, child] of running) {
    child.kill("SIGTERM");
    await publishLiveState(connectionId, {
      status: "DISCONNECTED",
      message: "The service restarted. Reconnecting shortly.",
    });
  }

  stopCampaignSender();

  await commandWorker.close();
  await eventQueue.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

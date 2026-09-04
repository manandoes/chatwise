// The supervisor for every free-tier WhatsApp session on this machine.
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
      // Count it, don't store it. The inbox is Phase 9.
      await db.whatsAppConnection
        .update({
          where: { id: event.connectionId },
          data: {
            messagesReceived: { increment: 1 },
            lastMessageAt: new Date(event.at),
          },
        })
        .catch(() => {});
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
  await eventQueue.add(event.type, event, {
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

  await commandWorker.close();
  await eventQueue.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

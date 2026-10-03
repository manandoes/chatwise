// The supervisor for every QR-tier WhatsApp session on this machine.
//
// This is the always-on process (docs/Architecture.md §6). It:
//
//   1. reads commands the web app enqueues — start, stop, send
//   2. starts a separate child process per customer, and keeps track of them
//   3. relays what those children report back into an in-memory state map, so
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
//
// IMPORTANT: In Option A (everything on one host), this file runs inside the
// same Node process as the Next.js app. Commands are enqueued directly into
// this module's channel and consumed by the loop below — no Redis, no BullMQ,
// no network round-trips for commands or live state.

import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "../../lib/db.ts";
import { routeInboundMessage } from "../../message-router/router.ts";
import {
  startCampaignSender,
  stopCampaignSender,
} from "../../jobs/campaign-sender.ts";
import {
  startPendingJobRunner,
  stopPendingJobRunner,
} from "../../jobs/pending-job-runner.ts";
import {
  QR_TTL_SECONDS,
  type ConnectionStatusValue,
  type LiveSessionState,
  type SessionCommand,
  type SessionEvent,
} from "./protocol.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const WORKER_SCRIPT = path.join(here, "worker.ts");

/** Every session running on this machine, by connection id. */
const running = new Map<string, ChildProcess>();

/**
 * Live connection state, keyed by connection id.
 *
 * The web app reads this directly via `readLiveState()` from session-commands
 * (which forwards here) — no Redis, no queue. The QR code inside expires
 * after QR_TTL_SECONDS and is replaced on every scan, so it stays fresh.
 */
const liveState = new Map<string, LiveSessionState>();

// ─── Telling the rest of the system what happened ───────────────────────────

/**
 * Writes the current state where the dashboard can read it.
 *
 * In-memory Map — no Redis, no queue. The dashboard polls the state on each
 * request (see app/api/whatsapp/qr-session/status/route.ts).
 */
function publishLiveState(
  connectionId: string,
  state: Omit<LiveSessionState, "updatedAt">,
) {
  const payload: LiveSessionState = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  liveState.set(connectionId, payload);
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
      publishLiveState(event.connectionId, {
        status: "CONNECTING",
        qr: event.qr,
        message: "Scan this with your phone.",
      });
      await recordStatus(event.connectionId, "CONNECTING");
      break;
    }

    case "status": {
      publishLiveState(event.connectionId, {
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
}

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

  publishLiveState(connectionId, {
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

// ─── Command channel ────────────────────────────────────────────────────────
//
// Commands come in through this channel. In Option A (single process) the web
// app pushes directly into the buffer; the consumer loop below drains it.
// Zero idle traffic — no polling, no BullMQ, no Redis.

/**
 * Enqueue a command for the session manager.
 *
 * Synchronous push into the in-memory buffer. The consumer loop wakes up and
 * processes it immediately. No Redis, no BullMQ.
 */
export function enqueueCommand(cmd: SessionCommand): void {
  // Use setImmediate to avoid blocking the caller (e.g., an API route)
  setImmediate(() => {
    switch (cmd.type) {
      case "start":
        startSession(cmd.connectionId);
        break;
      case "stop":
        stopSession(cmd.connectionId, cmd.forget).catch(console.error);
        break;
      case "send":
        sendMessage(cmd.connectionId, cmd.to, cmd.body);
        break;
    }
  });
}

// ─── Background tasks ───────────────────────────────────────────────────────

// Bulk sends are spaced over many minutes (docs/Rules.md §8), so they cannot
// run inside a web request. They run here, on the one host that is always up.
// Note this is not specific to the QR tier: an API-tier campaign needs a
// long-lived process just as much, it simply talks to Meta instead of to a
// browser session.
startCampaignSender();

// Integration work queued by webhooks — Shopify order messages, payment
// receipts, booking reminders, scheduled exports (jobs/pending-job-runner.ts).
// Here for the same reason: it needs a process that is always up.
startPendingJobRunner();

// ─── Shutting down tidily ───────────────────────────────────────────────────

async function shutdown() {
  console.log(`[manager] shutting down ${running.size} session(s)`);

  for (const [connectionId, child] of running) {
    child.kill("SIGTERM");
    publishLiveState(connectionId, {
      status: "DISCONNECTED",
      message: "The service restarted. Reconnecting shortly.",
    });
  }

  stopCampaignSender();
  stopPendingJobRunner();

  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// ─── Exports for the web app ────────────────────────────────────────────────
//
// These are called by session-commands.ts (and transitively by the API routes)
// to interact with the manager. When REDIS_URL is unset (Option A), the web
// app and manager share this process — these are direct function calls.

export { publishLiveState, liveState, running };

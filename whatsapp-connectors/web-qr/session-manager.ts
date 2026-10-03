// The supervisor for every QR-tier WhatsApp session on this machine.
//
// This is the always-on process (docs/Architecture.md §6). It:
//
//   1. listens on localhost:8080 for commands from the web app (HTTP)
//   2. reads commands from the HTTP handler and executes them
//   3. starts a separate child process per customer, and keeps track of them
//   4. serves live connection state via GET /state/:id
//
// It never runs a customer's WhatsApp session itself. Every session lives in
// its own child process, so a crash takes down one customer's connection and
// nobody else's (docs/Architecture.md §5, docs/Rules.md §9).
//
// Run it with:  npm run whatsapp-worker
//
// This file imports node:child_process and cannot be bundled by Next.js.
// It runs only when started directly via `npm run whatsapp-worker`.

import { fork, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { URL } from "node:url";

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
  type SessionCommand,
  type SessionEvent,
} from "./protocol.ts";
import { liveState, type LiveSessionState } from "./shared-state.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const WORKER_SCRIPT = path.join(here, "worker.ts");
const MANAGER_PORT = Number(process.env.WHATSAPP_MANAGER_PORT ?? 8080);

/** Every session running on this machine, by connection id. */
const running = new Map<string, ChildProcess>();

// ─── State writes ───────────────────────────────────────────────────────────

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

// ─── Session lifecycle ──────────────────────────────────────────────────────

function startSession(connectionId: string) {
  if (running.has(connectionId)) {
    console.log(`[manager] ${connectionId} is already running`);
    return;
  }

  console.log(`[manager] starting a session process for ${connectionId}`);

  const child = fork(WORKER_SCRIPT, [], {
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
  if (!child) throw new Error(`No running session for ${connectionId}`);
  child.send({ type: "send", to, body });
}

// ─── HTTP API server ────────────────────────────────────────────────────────
//
// The web app talks to us over this local HTTP server. Three endpoints:
//   POST /command     — enqueue a start/stop/send command
//   GET  /state/:id   — read live connection state
//   GET  /health      — liveness probe

function parseJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function jsonResponse(res: http.ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${MANAGER_PORT}`);
  const path = url.pathname;

  try {
    // POST /command
    if (req.method === "POST" && path === "/command") {
      const body = (await parseJsonBody(req)) as Record<string, unknown>;
      const command: SessionCommand = {
        type: body.type as SessionCommand["type"],
        connectionId: body.connectionId as string,
      } as SessionCommand;

      if (command.type === "start") {
        startSession(command.connectionId);
      } else if (command.type === "stop") {
        await stopSession(command.connectionId, Boolean(body.forget));
      } else if (command.type === "send") {
        command.to = body.to as string;
        command.body = body.body as string;
        sendMessage(command.connectionId, command.to, command.body);
      }

      jsonResponse(res, 202, { ok: true });
      return;
    }

    // GET /state/:connectionId
    if (req.method === "GET" && path.startsWith("/state/")) {
      const connectionId = decodeURIComponent(path.slice(7));
      const state = liveState.get(connectionId) ?? null;
      jsonResponse(res, 200, state);
      return;
    }

    // GET /health
    if (req.method === "GET" && path === "/health") {
      jsonResponse(res, 200, { ok: true, sessions: running.size });
      return;
    }

    jsonResponse(res, 404, { error: "not found" });
  } catch (error) {
    console.error("[manager] request handler error", error);
    jsonResponse(res, 500, { error: "internal server error" });
  }
});

server.listen(MANAGER_PORT, "127.0.0.1", () => {
  console.log(`[manager] listening for commands on http://127.0.0.1:${MANAGER_PORT}`);
});

server.on("error", (error) => {
  console.error("[manager] server error", error);
  process.exit(1);
});

// ─── Background tasks ───────────────────────────────────────────────────────
startCampaignSender();
startPendingJobRunner();

// ─── Shutdown ───────────────────────────────────────────────────────────────
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
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

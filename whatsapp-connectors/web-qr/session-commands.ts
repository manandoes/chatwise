// What the web app asks the WhatsApp workers to do.
//
// Option A (single host, no Redis): the session manager runs as a separate
// local process on the same VM. The app talks to it via a tiny HTTP API on
// localhost:8080. Zero Redis, zero BullMQ, zero idle traffic.
//
// This file is a pure HTTP client — it imports nothing from session-manager.ts
// so Next.js can bundle it without pulling in node:child_process.
//
// Everything here is server-side only.

import { QueueUnavailableError } from "../../lib/redis.ts";
import {
  type LiveSessionState,
  type SessionCommand,
} from "./protocol.ts";

import "server-only";

export { QueueUnavailableError };

/** Always true in Option A — the manager runs locally on the same host. */
export function isQueueConfigured(): boolean {
  return true;
}

/**
 * Check whether the session manager is alive.
 *
 * Quick local HTTP ping — fails open with false if the manager isn't up yet
 * (e.g. during a restart). The dashboard shows an honest "unavailable"
 * message instead of hanging (docs/Rules.md §4).
 */
export async function isQueueReachable(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:8080/health", {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const MANAGER_URL = process.env.WHATSAPP_MANAGER_URL ?? "http://localhost:8080";

/**
 * Send a command to the session manager.
 *
 * POST /command with JSON body. Returns void — the manager handles it
 * asynchronously. Errors become QueueUnavailableError so routes can return
 * a clean 503 instead of crashing the page.
 */
async function sendCommand(command: SessionCommand) {
  const res = await fetch(`${MANAGER_URL}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new QueueUnavailableError(
      `Manager returned ${res.status}: ${text.slice(0, 200)}`,
    );
  }
}

/** Asks for a session to be started, which is what produces a QR code. */
export async function requestSessionStart(
  connectionId: string,
  businessId: string,
) {
  await sendCommand({ type: "start", connectionId, businessId });
}

/**
 * Asks for one session to be stopped.
 *
 * `forget: true` means the customer is deliberately disconnecting, and the
 * saved session is thrown away so the next attempt starts fresh.
 */
export async function requestSessionStop(connectionId: string, forget: boolean) {
  await sendCommand({ type: "stop", connectionId, forget });
}

/** Asks for one message to be sent — used by the "send a test message" button. */
export async function requestSendMessage(
  connectionId: string,
  to: string,
  body: string,
) {
  await sendCommand({ type: "send", connectionId, to, body });
}

/**
 * The live state of a connection, including the QR code while one is waiting to
 * be scanned. Returns null when nothing is running — which is the normal state
 * before anyone presses Connect.
 */
export async function readLiveState(
  connectionId: string,
): Promise<LiveSessionState | null> {
  try {
    const res = await fetch(
      `${MANAGER_URL}/state/${encodeURIComponent(connectionId)}`,
      { signal: AbortSignal.timeout(2000) },
    );
    if (!res.ok) return null;
    return res.json() as Promise<LiveSessionState>;
  } catch {
    return null;
  }
}

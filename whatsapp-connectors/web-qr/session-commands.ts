// What the web app asks the WhatsApp workers to do.
//
// Option A (single host, no Redis): commands and live state go through
// in-memory channels exported by session-manager.ts. Zero Redis requests,
// zero BullMQ overhead, zero idle traffic.
//
// Everything here is server-side only.

import { QueueUnavailableError } from "../../lib/redis.ts";
import {
  type LiveSessionState,
  type SessionCommand,
} from "./protocol.ts";

import "server-only";

export { QueueUnavailableError };

/** Always true in Option A — the manager runs in the same process. */
export function isQueueConfigured(): boolean {
  return true;
}

/** Always true in Option A — no network call needed. */
export async function isQueueReachable(): Promise<boolean> {
  return true;
}

/**
 * Enqueue a command for the session manager.
 *
 * Direct function call — same process, no Redis, no BullMQ.
 */
async function send(command: SessionCommand) {
  const { enqueueCommand } = await import("./session-manager.ts");
  enqueueCommand(command);
}

/** Asks for a session to be started, which is what produces a QR code. */
export async function requestSessionStart(
  connectionId: string,
  businessId: string,
) {
  try {
    await send({ type: "start", connectionId, businessId });
  } catch (error) {
    throw new QueueUnavailableError(
      error instanceof Error ? error.message : "unknown reason",
    );
  }
}

/**
 * Asks for one session to be stopped.
 *
 * `forget: true` means the customer is deliberately disconnecting, and the
 * saved session is thrown away so the next attempt starts fresh.
 */
export async function requestSessionStop(connectionId: string, forget: boolean) {
  try {
    await send({ type: "stop", connectionId, forget });
  } catch (error) {
    throw new QueueUnavailableError(
      error instanceof Error ? error.message : "unknown reason",
    );
  }
}

/** Asks for one message to be sent — used by the "send a test message" button. */
export async function requestSendMessage(
  connectionId: string,
  to: string,
  body: string,
) {
  try {
    await send({ type: "send", connectionId, to, body });
  } catch (error) {
    throw new QueueUnavailableError(
      error instanceof Error ? error.message : "unknown reason",
    );
  }
}

/**
 * The live state of a connection, including the QR code while one is waiting to
 * be scanned. Returns null when nothing is running — which is the normal state
 * before anyone presses Connect.
 */
export function readLiveState(connectionId: string): LiveSessionState | null {
  // Synchronous read — same process, no network call.
  const { liveState } = require("./session-manager.ts");
  return liveState.get(connectionId) ?? null;
}

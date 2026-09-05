// What the web app asks the WhatsApp workers to do.
//
// The app never starts a browser or touches a session itself — it can't, it
// runs on serverless hosting. It puts a command on the queue and reads the
// state the session manager publishes back (docs/Architecture.md §5).
//
// Everything here is server-side only.

import { Queue } from "bullmq";

import {
  QueueUnavailableError,
  getRedis,
  isQueueConfigured,
  isQueueReachable,
} from "../../lib/redis.ts";
import {
  COMMAND_QUEUE,
  liveStateKey,
  type LiveSessionState,
  type SessionCommand,
} from "./protocol.ts";

import "server-only";

export { isQueueConfigured, isQueueReachable, QueueUnavailableError };

// One queue object reused across hot reloads, like the database client.
const globalForQueue = globalThis as unknown as {
  whatsappCommandQueue?: Queue<SessionCommand>;
};

function commandQueue(): Queue<SessionCommand> {
  if (!globalForQueue.whatsappCommandQueue) {
    globalForQueue.whatsappCommandQueue = new Queue<SessionCommand>(
      COMMAND_QUEUE,
      { connection: getRedis() },
    );
  }

  return globalForQueue.whatsappCommandQueue;
}

async function send(command: SessionCommand) {
  try {
    await commandQueue().add(command.type, command, {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
    });
  } catch (error) {
    // Redis being down is an expected operational state, not a surprise. Turn
    // it into something the routes can answer with a plain 503 rather than
    // letting a connection error reach the customer (docs/Rules.md §4).
    throw new QueueUnavailableError(
      error instanceof Error ? error.message : "unknown reason",
    );
  }
}

/** Asks for a session to be started, which is what produces a QR code. */
export async function requestSessionStart(
  connectionId: string,
  businessId: string,
) {
  await send({ type: "start", connectionId, businessId });
}

/**
 * Asks for a session to be stopped.
 *
 * `forget: true` means the customer is deliberately disconnecting, and the
 * saved session is thrown away so the next attempt starts fresh.
 */
export async function requestSessionStop(connectionId: string, forget: boolean) {
  await send({ type: "stop", connectionId, forget });
}

/** Asks for one message to be sent — used by the "send a test message" button. */
export async function requestSendMessage(
  connectionId: string,
  to: string,
  body: string,
) {
  await send({ type: "send", connectionId, to, body });
}

/**
 * The live state of a connection, including the QR code while one is waiting to
 * be scanned. Returns null when nothing is running — which is the normal state
 * before anyone presses Connect.
 */
export async function readLiveState(
  connectionId: string,
): Promise<LiveSessionState | null> {
  if (!isQueueConfigured()) return null;

  try {
    const raw = await getRedis().get(liveStateKey(connectionId));
    if (!raw) return null;

    return JSON.parse(raw) as LiveSessionState;
  } catch {
    // Redis unreachable, or a value we can't read. Either way there is no live
    // state to show, and the status endpoint reports the service as down.
    return null;
  }
}

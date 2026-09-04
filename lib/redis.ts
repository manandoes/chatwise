// The Redis connection, shared by the job queues.
//
// Redis does two jobs here (docs/Architecture.md §6):
//   1. carries commands and events between the web app and the WhatsApp
//      workers, which run on a different machine entirely
//   2. tracks which QR sessions are live right now
//
// An important distinction runs through this file: **having a REDIS_URL is not
// the same as Redis being reachable.** If the two are confused, a Redis outage
// makes the dashboard hang instead of saying something honest, which is exactly
// what docs/Rules.md §4 forbids. So the app connects lazily, gives up quickly,
// and asks before it assumes.

import IORedis from "ioredis";

import "server-only";

export const REDIS_URL = process.env.REDIS_URL;

/** True when a REDIS_URL is configured at all. Says nothing about reachability. */
export function isQueueConfigured(): boolean {
  return Boolean(REDIS_URL);
}

/** Thrown when something needs the queue and it cannot be reached. */
export class QueueUnavailableError extends Error {
  constructor(reason = "the WhatsApp service could not be reached") {
    super(`Queue unavailable: ${reason}`);
    this.name = "QueueUnavailableError";
  }
}

/** How long to wait before deciding Redis isn't there. */
const CONNECT_TIMEOUT_MS = 5_000;

/**
 * The connection the web app uses.
 *
 * Deliberately impatient: it gives up after a few tries rather than retrying
 * forever, and it refuses to queue commands while disconnected. A page that
 * fails in two seconds with "the service isn't available" is far better than
 * one that spins indefinitely.
 */
function createAppConnection(): IORedis {
  if (!REDIS_URL) throw new QueueUnavailableError("REDIS_URL is not set");

  const connection = new IORedis(REDIS_URL, {
    lazyConnect: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    // Fail the command instead of holding it until Redis comes back.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 2,
    retryStrategy(times) {
      // Stop after a few attempts. Returning null ends the connection rather
      // than reconnecting forever and filling the logs.
      if (times > 3) return null;
      return Math.min(times * 200, 1_000);
    },
  });

  // ioredis throws on an unhandled 'error' event. We expect connection errors
  // when Redis is down; they are reported through the status endpoint instead.
  connection.on("error", () => {});

  return connection;
}

/**
 * The connection the session manager uses.
 *
 * The opposite temperament: BullMQ's workers block on Redis waiting for jobs,
 * so this one must be patient and must never cap retries.
 */
export function createWorkerConnection(): IORedis {
  if (!REDIS_URL) throw new QueueUnavailableError("REDIS_URL is not set");

  return new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

// One connection reused across hot reloads in development, for the same reason
// the database client is (see lib/db.ts).
const globalForRedis = globalThis as unknown as {
  redis?: IORedis;
};

export function getRedis(): IORedis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = createAppConnection();
  }

  return globalForRedis.redis;
}

/**
 * Whether Redis is actually answering right now.
 *
 * Never throws — a false here means "tell the customer the service is
 * unavailable", not "crash the page".
 */
export async function isQueueReachable(): Promise<boolean> {
  if (!REDIS_URL) return false;

  try {
    const redis = getRedis();

    if (redis.status === "end" || redis.status === "close") {
      await redis.connect();
    }

    const pong = await Promise.race([
      redis.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("timed out")),
          CONNECT_TIMEOUT_MS,
        ),
      ),
    ]);

    return pong === "PONG";
  } catch {
    return false;
  }
}

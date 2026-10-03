// In-memory rate limiter — replaces the Redis-based one for single-host
// deployments. On a single VM every request hits the same process, so an
// in-memory map is accurate enough and costs zero external round-trips.
//
// When REDIS_URL is set (multi-host), the caller falls back to the Redis
// implementation in lib/rate-limit.ts. This file is the fallback path only.

import "server-only";

export type RateLimit = {
  /** How many attempts are allowed in the window. */
  limit: number;
  /** How long the window is, in seconds. */
  windowSeconds: number;
};

/**
 * The limits, in one place so they can be read at a glance.
 *
 * These are generous for a real person and stingy for a script. Anyone who
 * genuinely hits one of them is either in trouble or up to something, and the
 * message they get says what to do about it either way (docs/Rules.md §4).
 */
export const LIMITS = {
  /** Creating accounts. Keyed on the IP address, since there is no user yet. */
  signUp: { limit: 5, windowSeconds: 60 * 60 },
  /** Password attempts. Keyed on the email address being tried. */
  signIn: { limit: 10, windowSeconds: 15 * 60 },
  /** Asking Meta to verify credentials — a paid call to somebody else's API. */
  verifyCredentials: { limit: 10, windowSeconds: 60 * 60 },
  /** Starting a QR session, which spawns a browser on the worker host. */
  startSession: { limit: 10, windowSeconds: 10 * 60 },
  /** Starting or changing a subscription — every attempt reaches Razorpay. */
  billing: { limit: 15, windowSeconds: 60 * 60 },
  /** Writing a campaign. The send throttle is separate and unaffected. */
  campaign: { limit: 20, windowSeconds: 60 * 60 },
  /** Replying by hand in the inbox. High: somebody busy is answering people. */
  humanReply: { limit: 120, windowSeconds: 60 },
} satisfies Record<string, RateLimit>;

export type LimitName = keyof typeof LIMITS;

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number; message: string };

/**
 * Counts one attempt, and says whether it may go ahead.
 *
 * A fixed window rather than a sliding one: a counter increment plus a TTL is
 * two round-trips and no bookkeeping, and the worst a fixed window allows is
 * a double burst across a boundary — which for these limits is 20 sign-ups in
 * an hour instead of 10. That is not the difference between safe and unsafe.
 */
export async function takeFromBudget(
  name: LimitName,
  /** What is being counted: an IP address, an email, an account id. */
  subject: string,
): Promise<RateLimitResult> {
  const { limit, windowSeconds } = LIMITS[name];

  if (!subject) {
    return { allowed: true, remaining: limit };
  }

  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = `${name}:${subject}:${window}`;

  // In-memory store: keyed by (name, subject, window). Cleans up expired
  // entries on access so memory doesn't grow unboundedly.
  const store = (globalThis as unknown as { __rateLimitStore?: Map<string, number> }).__rateLimitStore ??= new Map();

  // Prune expired windows periodically — at most once per unique key per
  // second, so it doesn't add latency on the hot path.
  if (!store.has(`${key}:pruned`) || Date.now() - (store.get(`${key}:pruned`) ?? 0) > 1000) {
    const now = Date.now();
    for (const [k] of store) {
      if (!k.endsWith(":pruned")) {
        const [, , w] = k.split(":");
        if (Number(w) < window - 1) store.delete(k);
      }
    }
    store.set(`${key}:pruned`, now);
  }

  const count = (store.get(key) ?? 0) + 1;
  store.set(key, count);

  if (count <= limit) return { allowed: true, remaining: limit - count };

  // Calculate retry-after: seconds remaining in the current window.
  const retryAfterSeconds = windowSeconds - (Date.now() % 1000) / 1000;

  return {
    allowed: false,
    retryAfterSeconds: Math.ceil(retryAfterSeconds),
    message: waitMessage(Math.ceil(retryAfterSeconds)),
  };
}

/**
 * The caller's IP address, as best it can be known.
 *
 * Behind a proxy — which is everywhere this will run — the socket address is
 * the proxy's, and the real one is in a header. Headers can be forged, so this
 * is fine for slowing down abuse and would be wrong as an access check. It is
 * only ever used for the former.
 */
export function callerAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) return forwarded.split(",")[0]!.trim();

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** "in a few minutes" — never "retry after 847 seconds" (docs/Rules.md §7). */
function waitMessage(seconds: number): string {
  if (seconds <= 90) return "Too many attempts. Try again in a minute.";

  const minutes = Math.ceil(seconds / 60);

  if (minutes < 60) {
    return `Too many attempts. Try again in about ${minutes} minutes.`;
  }

  const hours = Math.ceil(minutes / 60);

  return `Too many attempts. Try again in about ${hours === 1 ? "an hour" : `${hours} hours`}.`;
}

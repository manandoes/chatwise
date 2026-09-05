// How often one person may do one thing.
//
// Added in Phase 14, before the app is opened to real paying customers. Until
// now nothing stopped somebody making ten thousand sign-up attempts, guessing
// passwords all night, or hammering the endpoint that asks Meta to verify
// credentials. None of those is a data-leak — every route already checks who
// owns what (docs/Rules.md §3) — but all of them cost money or reveal accounts
// by brute force.
//
// **The counters live in Redis**, because the web app is serverless: two
// requests a second apart can land on two different machines, and a counter in
// one machine's memory would be invisible to the other. Redis is already
// required for the WhatsApp workers (docs/Architecture.md §6), so this adds no
// new infrastructure.
//
// **It fails open, deliberately.** If Redis is unreachable, requests are
// allowed and the failure is logged. The alternative — refusing everything —
// would turn a Redis blip into "nobody can log in", which is a far worse
// outcome than a window with no limiting in it. This is a considered trade-off,
// not an oversight: the limiter is a brake on abuse, not an authorisation
// check, and nothing here is the only thing protecting anything.

import "server-only";

import { getRedis, isQueueConfigured } from "@/lib/redis";

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
 * A fixed window rather than a sliding one: `INCR` plus `EXPIRE` is two
 * round-trips and no bookkeeping, and the worst a fixed window allows is a
 * double burst across a boundary — which for these limits is 20 sign-ups in an
 * hour instead of 10. That is not the difference between safe and unsafe.
 */
export async function takeFromBudget(
  name: LimitName,
  /** What is being counted: an IP address, an email, an account id. */
  subject: string,
): Promise<RateLimitResult> {
  const { limit, windowSeconds } = LIMITS[name];

  if (!isQueueConfigured() || !subject) {
    return { allowed: true, remaining: limit };
  }

  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = `ratelimit:${name}:${subject}:${window}`;

  try {
    const redis = getRedis();
    const used = await redis.incr(key);

    // Only on the first one: the window is fixed, so its life is fixed too, and
    // re-setting it on every attempt would let a steady stream keep it alive
    // forever.
    if (used === 1) await redis.expire(key, windowSeconds);

    if (used <= limit) return { allowed: true, remaining: limit - used };

    const ttl = await redis.ttl(key);
    const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds;

    return {
      allowed: false,
      retryAfterSeconds,
      message: waitMessage(retryAfterSeconds),
    };
  } catch (error) {
    // Fails open — see the note at the top of this file.
    console.error(`[rate-limit] could not count "${name}"`, error);

    return { allowed: true, remaining: limit };
  }
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

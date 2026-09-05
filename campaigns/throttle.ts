// Spacing a bulk send out instead of firing it all at once.
//
// This is a safety feature, not a performance setting (docs/Rules.md §8). On
// the free tier a burst of identical messages from one number is the pattern
// that gets that number banned by WhatsApp, and the customer's own business
// phone is what pays for it. **Do not shorten these numbers to make a send
// finish faster.**
//
// Two honest caveats about the figures below:
//
//   * They are ours, not Meta's. WhatsApp publishes no "safe" rate for the
//     unofficial web connection, and inventing a compliance claim is exactly
//     what docs/Rules.md §9 forbids. These are a deliberately conservative
//     guess, and the product owner should expect to tune them against real
//     experience (docs/Memory.md open questions).
//   * The jitter is not decoration. Twenty-five messages at exactly forty-five
//     second intervals is a machine signature; a spread makes it look like
//     somebody typing.
//
// The schedule is worked out once, when the campaign is accepted, and written
// onto each recipient row as `sendAfter`. That means the spacing survives a
// restart of the sender and cannot be quietly undone by a retry loop.

/** The average gap between two free-tier messages. */
export const FREE_TIER_GAP_MS = 45_000;

/** How far either side of that gap a message may land. */
export const FREE_TIER_JITTER_MS = 15_000;

/** No spacing imposed on the paid tier — Meta's own rate limits apply. */
export const PAID_TIER_GAP_MS = 0;

export type Spacing = { gapMs: number; jitterMs: number };

export function spacingFor(tier: "QR" | "API"): Spacing {
  return tier === "QR"
    ? { gapMs: FREE_TIER_GAP_MS, jitterMs: FREE_TIER_JITTER_MS }
    : { gapMs: PAID_TIER_GAP_MS, jitterMs: 0 };
}

/**
 * When each of `count` messages may go out.
 *
 * The first one goes at `startAt`; each one after it waits roughly `gapMs`
 * longer than the last. Always strictly increasing, so two messages never
 * become due in the same tick and undo the spacing.
 */
export function planSendTimes(
  count: number,
  startAt: Date,
  { gapMs, jitterMs }: Spacing,
): Date[] {
  const times: Date[] = [];
  let at = startAt.getTime();

  for (let index = 0; index < count; index += 1) {
    times.push(new Date(at));

    // ± jitter, never enough to reverse the order or collapse the gap to zero.
    const wobble = jitterMs === 0 ? 0 : Math.round((Math.random() * 2 - 1) * jitterMs);

    at += Math.max(gapMs === 0 ? 0 : 1_000, gapMs + wobble);
  }

  return times;
}

/**
 * Roughly how long a send of this size will take, for the screen to say so
 * before somebody commits to it.
 *
 * A free-tier campaign to twenty-five people runs for the better part of
 * twenty minutes. Somebody should know that before they press send, not
 * afterwards when they wonder why only four have gone.
 */
export function estimatedDurationMs(count: number, { gapMs }: Spacing): number {
  return count <= 1 ? 0 : (count - 1) * gapMs;
}

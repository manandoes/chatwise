// Honouring somebody who asked not to be messaged again.
//
// docs/Rules.md §8 makes three demands, and all three live here:
//
//   1. A contact who replied STOP is excluded from every send, on every tier,
//      with no way to override it from the screens.
//   2. Every bulk message carries a line telling people how to stop.
//   3. Opt-outs are checked before every send — not once when the list was
//      built, because a campaign scheduled on Monday is still going out on
//      Tuesday and somebody may have said STOP in between.
//
// The matching below is deliberately strict: the whole message has to be the
// word, not contain it. "Please don't stop sending me these" must never
// unsubscribe somebody, and "YES" must never do anything at all — one of the
// starter templates asks people to reply YES to accept an offer.
//
// Relative .ts imports: this file is loaded by the Next.js app, by the message
// router, and by the campaign sender on the always-on host, which is plain Node.

import "server-only";

import { db } from "../lib/db.ts";

/** What gets appended to a bulk message that doesn't already say it. */
export const OPT_OUT_LINE = "Reply STOP to unsubscribe.";

/**
 * The words that unsubscribe somebody.
 *
 * The widely-understood ones only. "CANCEL" and "END" appear on some carriers'
 * lists and are left off on purpose — a customer cancelling an order should
 * not silently stop hearing from the business altogether.
 */
const STOP_WORDS = ["stop", "stopall", "stop all", "unsubscribe", "optout", "opt out"];

/** The words that undo it, so an accidental STOP is not permanent. */
const START_WORDS = ["start", "unstop", "subscribe", "resubscribe"];

export type OptOutIntent = "OPT_OUT" | "OPT_IN" | null;

/**
 * What a message is asking for, if anything.
 *
 * Punctuation and case are ignored ("STOP." and "stop" are the same request);
 * anything longer than the word itself is an ordinary message and returns null.
 */
export function readOptOutIntent(text: string): OptOutIntent {
  const said = text
    .trim()
    .toLowerCase()
    .replace(/[.!,;:'"]+$/g, "")
    .replace(/\s+/g, " ");

  if (STOP_WORDS.includes(said)) return "OPT_OUT";
  if (START_WORDS.includes(said)) return "OPT_IN";

  return null;
}

/** What we say back, so somebody knows the request landed. */
export const OPT_OUT_CONFIRMATION =
  "You're unsubscribed — we won't send you any more updates. Reply START if you change your mind.";

export const OPT_IN_CONFIRMATION =
  "You're subscribed again. You'll hear from us with updates from now on.";

/** Records that this contact does not want bulk messages. */
export async function recordOptOut(
  businessId: string,
  contactPhone: string,
  reason: string,
): Promise<void> {
  await db.optOut.upsert({
    where: { businessId_contactPhone: { businessId, contactPhone } },
    create: { businessId, contactPhone, reason },
    // Already opted out and saying so again changes nothing, but it should not
    // be an error either.
    update: {},
  });
}

/** Undoes it, at the contact's own request and never at anybody else's. */
export async function removeOptOut(
  businessId: string,
  contactPhone: string,
): Promise<void> {
  await db.optOut.deleteMany({ where: { businessId, contactPhone } });
}

/** Whether this one person has opted out. Checked as each message goes out. */
export async function isOptedOut(
  businessId: string,
  contactPhone: string,
): Promise<boolean> {
  const found = await db.optOut.count({
    where: { businessId, contactPhone },
  });

  return found > 0;
}

/**
 * Which of these numbers have opted out.
 *
 * One query for a whole list, because the campaign builder checks twenty-five
 * at a time and the send path checks the same list again later.
 */
export async function optedOutAmong(
  businessId: string,
  phones: string[],
): Promise<Set<string>> {
  if (phones.length === 0) return new Set();

  const rows = await db.optOut.findMany({
    where: { businessId, contactPhone: { in: phones } },
    select: { contactPhone: true },
  });

  return new Set(rows.map((row) => row.contactPhone));
}

/** Everyone this business may not message. Shown on the campaigns screen. */
export async function listOptOuts(businessId: string) {
  return await db.optOut.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, contactPhone: true, reason: true, createdAt: true },
  });
}

/** Whether a message already tells people how to stop. */
export function hasOptOutLine(body: string): boolean {
  const said = body.toLowerCase();

  return (
    said.includes("stop to unsubscribe") ||
    said.includes("reply stop") ||
    said.includes("unsubscribe")
  );
}

/**
 * The message as it will actually be sent, opt-out line included.
 *
 * Appending rather than refusing, because docs/Rules.md §8 asks for the line to
 * be there and the owner should not have to remember it. A message that already
 * says it is left alone rather than told twice.
 */
export function ensureOptOutLine(body: string): string {
  return hasOptOutLine(body) ? body : `${body.trimEnd()}\n\n${OPT_OUT_LINE}`;
}

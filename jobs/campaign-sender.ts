// The clock behind a bulk send.
//
// A free-tier campaign to twenty-five people is spaced out over the better part
// of twenty minutes (campaigns/throttle.ts), which is far longer than any web
// request lives. So the sending happens here instead: on the always-on host,
// which is the same process that already holds the free tier's WhatsApp
// sessions open (docs/Architecture.md §5).
//
// **All this does is ask.** Every decision — whose turn it is, whether they
// have unsubscribed since, whether a message has already gone — belongs to
// campaigns/send-campaign.ts and to the database rows it writes. That is
// deliberate: the schedule lives in a `sendAfter` column rather than in a timer
// here, so stopping and restarting this process loses nothing and, more
// importantly, cannot cause a message to go out twice.
//
// It also means this is not a queue. docs/Architecture.md §1 names BullMQ for
// background work, and it is used for the WhatsApp session commands next door —
// but a queue holding "this person still needs messaging" would be a second
// copy of a fact Postgres already owns, and the two disagreeing is how somebody
// gets the same broadcast twice.

import { sendDueMessages } from "../campaigns/send-campaign.ts";

/**
 * How often to look.
 *
 * Comfortably shorter than the gap between two messages, so a send goes out
 * close to the second it was scheduled for, and long enough that an idle
 * account costs one small query every quarter of a minute.
 */
const TICK_MS = 15_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

/** Starts looking for due messages. Safe to call twice. */
export function startCampaignSender(): void {
  if (running) return;

  running = true;
  schedule();

  console.log("[campaigns] sender started");
}

/** Stops looking. Anything already scheduled stays scheduled. */
export function stopCampaignSender(): void {
  running = false;

  if (timer) clearTimeout(timer);

  timer = null;
}

function schedule() {
  timer = setTimeout(async () => {
    await tick();

    if (running) schedule();
  }, TICK_MS);

  // Never let this keep the process alive on its own. If the host is shutting
  // down, a pending look-for-work should not be the reason it hangs about.
  timer.unref?.();
}

async function tick() {
  try {
    const done = await sendDueMessages();

    if (done.sent || done.failed || done.skipped) {
      // Counts only. What a campaign said is the business's, not the log's
      // (docs/Rules.md §4).
      console.log(
        `[campaigns] sent ${done.sent}, failed ${done.failed}, skipped ${done.skipped}`,
      );
    }
  } catch (error) {
    // A bad tick must never stop the clock: the next one may well succeed, and
    // a sender that quietly died would leave a campaign half-delivered with
    // nothing on screen to say why.
    console.error("[campaigns] a send tick failed", error);
  }
}

// How the Follow-up agent decides what to say.
//
// Two entry points, because this is the one agent that sometimes speaks first:
//
//   * `followUpHandler` — the ordinary one. Someone wrote back; the message
//     router calls this like it calls every other agent.
//   * `composeFollowUpNudge` — what to write when a quote has gone quiet. The
//     background job that watches the clock (jobs/follow-up-scheduler.ts,
//     docs/Phases.md Phase 12) will call this. Nothing calls it yet, and it is
//     exported rather than hidden so that job is a scheduler and nothing more:
//     the words stay here, in the agent's own folder (docs/Rules.md §2).
//
// `followUpSchedule` is the same story for the timings: the owner's answers say
// how long to wait and how often to try, and reading them belongs to this agent
// rather than to whatever ends up running the timer.

import type {
  BotHandler,
  BotRequest,
  BotResponse,
} from "../shared/handler-types.ts";
import { askAgent } from "../shared/run-agent.ts";
import { followUpNudgePrompt, followUpSystemPrompt } from "./prompt.ts";

export const followUpHandler: BotHandler = (request) =>
  askAgent({
    system: followUpSystemPrompt(request),
    request,
    handoffReason:
      "Someone has replied to a quote and it needs a person — either they are ready to go ahead, or they are asking about the quote itself.",
  });

/** A day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** The wait-before answers, as actual time. */
const WAIT_MS: Record<string, number> = {
  "1d": DAY_MS,
  "3d": 3 * DAY_MS,
  "7d": 7 * DAY_MS,
  "14d": 14 * DAY_MS,
};

/**
 * How long to leave a quiet quote, and how many times to try.
 *
 * The defaults are the cautious end of what the setup form offers: an answer
 * that is missing or unrecognised should mean one gentle nudge after three
 * days, never a stream of them.
 */
export function followUpSchedule(config: Record<string, string>): {
  waitMs: number;
  maxAttempts: number;
} {
  const waitMs = WAIT_MS[config.waitBefore] ?? 3 * DAY_MS;
  const attempts = Number(config.maxFollowUps);

  return {
    waitMs,
    maxAttempts: attempts >= 1 && attempts <= 3 ? Math.floor(attempts) : 1,
  };
}

/**
 * The nudge that goes to somebody who never replied to their quote.
 *
 * There is no incoming message here — nobody said anything, which is the whole
 * point — so the last turn is an instruction from us rather than from a
 * customer, and it says so plainly. Everything a customer ever wrote stays in
 * the history where it belongs.
 */
export function composeFollowUpNudge(
  request: Omit<BotRequest, "message">,
  attempt: number,
): Promise<BotResponse> {
  const full: BotRequest = { ...request, message: "" };

  return askAgent({
    system: followUpNudgePrompt(full, attempt),
    request: {
      ...full,
      message:
        "(Automatic instruction from the business's own system, not a message from the customer. Write the follow-up message now.)",
    },
    handoffReason:
      "The Follow-up agent decided this thread should not be chased automatically.",
  });
}

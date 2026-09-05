// How the Feedback agent decides what to say.
//
// Two entry points, because this agent sometimes speaks first:
//
//   * `feedbackHandler` — a customer has answered; the message router calls
//     this like it calls every other agent.
//   * `composeFeedbackRequest` — the after-purchase question itself. The
//     background job that waits the right number of days (docs/Phases.md
//     Phase 12) will call this. Nothing calls it yet; it lives here so that
//     job stays a timer and the words stay in the agent's folder
//     (docs/Rules.md §2).

import type {
  BotHandler,
  BotRequest,
  BotResponse,
} from "../shared/handler-types.ts";
import { askAgent } from "../shared/run-agent.ts";
import { feedbackRequestPrompt, feedbackSystemPrompt } from "./prompt.ts";

export const feedbackHandler: BotHandler = (request) =>
  askAgent({
    system: feedbackSystemPrompt(request),
    request,
    // This agent hands over for one reason far more often than any other, and
    // it is the reason the owner most needs to see at a glance.
    handoffReason:
      "Feedback that needs a person — most likely an unhappy customer, who should hear from somebody rather than from an agent.",
  });

/** A day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** How long after the purchase to ask, per the owner's answer. */
const ASK_AFTER_MS: Record<string, number> = {
  same_day: 4 * 60 * 60 * 1000,
  "1d": DAY_MS,
  "3d": 3 * DAY_MS,
  "7d": 7 * DAY_MS,
};

/**
 * How long to leave it before asking.
 *
 * Defaults to the next day when the answer is missing or unrecognised — soon
 * enough to be about the thing they bought, late enough that they have had it.
 */
export function feedbackDelayMs(config: Record<string, string>): number {
  return ASK_AFTER_MS[config.askAfter] ?? DAY_MS;
}

/**
 * The after-purchase question.
 *
 * Nobody has said anything, so the last turn is an instruction from us and says
 * so plainly — it is never mistaken for something the customer wrote.
 */
export function composeFeedbackRequest(
  request: Omit<BotRequest, "message">,
): Promise<BotResponse> {
  const full: BotRequest = { ...request, message: "" };

  return askAgent({
    system: feedbackRequestPrompt(full),
    request: {
      ...full,
      message:
        "(Automatic instruction from the business's own system, not a message from the customer. Write the after-purchase message now.)",
    },
    handoffReason:
      "The Feedback agent decided this customer should not be asked automatically.",
  });
}

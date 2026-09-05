// The part of "answering a message" that is the same for every agent.
//
// Nine agents, one way of asking the model and one way of coping when it can't
// answer. Written once here so that an agent's own folder holds only what makes
// it that agent — its instructions (docs/Rules.md §2 and §5).
//
// What it adds over calling the model directly is the thing a prompt cannot be
// trusted with: what happens when the model is slow, unavailable, or answers
// with nothing. In every one of those cases the customer gets a sentence and
// the business gets told a person is needed — never silence, and never a raw
// error (docs/Rules.md §4).
//
// Relative .ts imports: these files are loaded by the Next.js app and by the
// always-on WhatsApp session manager, which runs under plain Node and doesn't
// read the "@/..." shortcuts.

import type { BotRequest, BotResponse } from "./handler-types.ts";
import { historyAsMessages, interpretReply } from "./prompt-shared.ts";
import { generateReply } from "../../lib/ai-client.ts";

/** What the customer is told when the agent itself could not think. */
const CANNOT_ANSWER_NOW =
  "Sorry — I can't answer right now. Someone from the team will come back to you shortly.";

export async function askAgent({
  system,
  request,
  handoffReason,
}: {
  /** The agent's instructions, filled in with this business's details. */
  system: string;
  /** The conversation, as the router built it. */
  request: BotRequest;
  /**
   * Why this agent hands over, in words the business owner can act on. Each
   * agent gives its own, because "couldn't answer from the knowledge base" and
   * "the customer wants to change a booking" need different people.
   */
  handoffReason: string;
}): Promise<BotResponse> {
  const result = await generateReply({
    system,
    messages: historyAsMessages(request.history, request.message),
  });

  if (!result.ok) {
    // Say so honestly rather than inventing an answer, and flag the thread so
    // somebody picks it up.
    return { kind: "unavailable", text: CANNOT_ANSWER_NOW, reason: result.message };
  }

  const { handingOver, text } = interpretReply(result.text);

  if (handingOver) return { kind: "escalate", text, reason: handoffReason };

  return { kind: "reply", text };
}

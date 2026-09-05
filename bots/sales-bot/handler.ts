// How the Sales agent decides what to reply.
//
// Thin on purpose (docs/Rules.md §2). Everything that makes this agent safe to
// let near a price list is in its prompt.

import type { BotHandler } from "../shared/handler-types.ts";
import { askAgent } from "../shared/run-agent.ts";
import { salesSystemPrompt } from "./prompt.ts";

export const salesHandler: BotHandler = (request) =>
  askAgent({
    system: salesSystemPrompt(request),
    request,
    handoffReason:
      "A sales question the agent could not answer from the price list — someone is asking about a price, a discount or a deal that was not set out.",
  });

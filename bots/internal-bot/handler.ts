// How the Internal agent decides what to reply.
//
// Thin on purpose (docs/Rules.md §2).

import type { BotHandler } from "../shared/handler-types.ts";
import { askAgent } from "../shared/run-agent.ts";
import { internalSystemPrompt } from "./prompt.ts";

export const internalHandler: BotHandler = (request) =>
  askAgent({
    system: internalSystemPrompt(request),
    request,
    handoffReason:
      "An internal question for a person — outside what the agent was told, or the sort of thing a manager should answer.",
  });

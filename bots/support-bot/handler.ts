// How the Support agent decides what to reply.
//
// Thin on purpose (docs/Rules.md §2).

import type { BotHandler } from "../shared/handler-types.ts";
import { askAgent } from "../shared/run-agent.ts";
import { supportSystemPrompt } from "./prompt.ts";

export const supportHandler: BotHandler = (request) =>
  askAgent({
    system: supportSystemPrompt(request),
    request,
    handoffReason:
      "A support problem the agent cannot resolve on its own — it needs someone who can look the order up.",
  });

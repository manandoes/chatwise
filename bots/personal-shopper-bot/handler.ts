// How the Personal Shopper decides what to reply.
//
// Thin on purpose (docs/Rules.md §2).

import type { BotHandler } from "../shared/handler-types.ts";
import { askAgent } from "../shared/run-agent.ts";
import { personalShopperSystemPrompt } from "./prompt.ts";

export const personalShopperHandler: BotHandler = (request) =>
  askAgent({
    system: personalShopperSystemPrompt(request),
    request,
    handoffReason:
      "A shopper needs a person — they want to order, or they are asking about something the shop's list does not cover.",
  });

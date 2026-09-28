// How the Personal Shopper decides what to reply.
//
// Thin on purpose (docs/Rules.md §2): it looks up which of the store's
// products this conversation is about, then asks.

import type { BotHandler } from "../shared/handler-types.ts";
import { productsForConversation } from "../shared/catalogue.ts";
import { askAgent } from "../shared/run-agent.ts";
import { personalShopperSystemPrompt } from "./prompt.ts";

export const personalShopperHandler: BotHandler = async (request) =>
  askAgent({
    system: personalShopperSystemPrompt(request, await productsForConversation(request)),
    request,
    handoffReason:
      "A shopper needs a person — they want to order, or they are asking about something the shop's list does not cover.",
  });

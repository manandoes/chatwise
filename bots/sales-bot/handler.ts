// How the Sales agent decides what to reply.
//
// Thin on purpose (docs/Rules.md §2): it looks up which of the store's
// products this conversation is about, then asks. Everything that makes this
// agent safe to let near a price list is in its prompt.

import type { BotHandler } from "../shared/handler-types.ts";
import { productsForConversation } from "../shared/catalogue.ts";
import { askAgent } from "../shared/run-agent.ts";
import { salesSystemPrompt } from "./prompt.ts";

export const salesHandler: BotHandler = async (request) =>
  askAgent({
    system: salesSystemPrompt(request, await productsForConversation(request)),
    request,
    handoffReason:
      "A sale needs a person — a price, product or discount the agent wasn't given, a bulk or custom order, or a buyer ready to order with no link to send them to.",
  });

// Finding the products a conversation is about, in the store's live catalogue.
//
// Only the Sales and Personal Shopper agents call this: they are the two whose
// row in docs/PRD.md §5 lists the catalogue, and a bot only gets the tools
// listed for it (docs/Rules.md §5). Every other agent answers from its setup
// answers and the knowledge base alone.
//
// The search is by meaning (lib/catalog.ts), so what is searched is the last
// few turns of the thread and not only the newest message. "Send me the link
// for that one" means nothing on its own; next to the agent's last suggestion
// it finds the product the two of them were talking about.
//
// It never costs anybody their reply. Catalogue search switched off, nothing
// indexed yet, the AI provider down, even the database refusing the query —
// all of them come back as "no products", and the agent answers from the
// owner's typed list exactly as it did before the catalogue existed.
//
// Relative .ts imports: loaded by the always-on WhatsApp session manager too.

import type { BotRequest } from "./handler-types.ts";
import { searchProducts, type ProductMatch } from "../../lib/catalog.ts";

/** Enough to choose between, few enough to keep the instructions short. */
const PRODUCTS_SHOWN = 5;

/** How many of the latest turns are searched alongside the new message. */
const TURNS_SEARCHED = 3;

export async function productsForConversation(
  request: BotRequest,
): Promise<ProductMatch[]> {
  const query = [
    ...request.history.slice(-TURNS_SEARCHED).map((turn) => turn.text),
    request.message,
  ].join("\n");

  try {
    return await searchProducts(request.businessId, query, {
      limit: PRODUCTS_SHOWN,
      apiKey: request.apiKey,
    });
  } catch (error) {
    // Logged by kind only: the query is the customer's own words.
    console.error(
      "[catalogue] product search failed:",
      error instanceof Error ? error.name : "unknown error",
    );

    return [];
  }
}

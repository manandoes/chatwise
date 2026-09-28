// The Sales agent — setup questions.
//
// Uses the product catalogue, pricing and a checkout link (docs/PRD.md §5). The
// live catalogue needs no question here: it comes from the connected store.
//
// This file only describes what the agent needs to know about the business.
// Its instructions (prompt.ts) and its behaviour (handler.ts) are built in a
// later phase — see docs/Phases.md.

import type { BotConfigSchema } from "@/bots/shared/config-types";

export const salesBotConfigSchema: BotConfigSchema = {
  "type": "SALES",
  "name": "Sales",
  "tagline": "Takes a buyer from first question to checkout.",
  "trigger": "\"Which plan?\", \"how much is it?\", \"can I order this?\" and similar.",
  "icon": "Tag",
  "questions": [
    {
      "id": "productsAndPrices",
      "label": "What you sell, and what it costs",
      "hint": "The agent quotes only these prices — it will never guess one. If your Shopify store is connected, it can also read live prices and stock from there.",
      "type": "textarea",
      "placeholder": "Starter — ₹999/month, up to 3 users\nGrowth — ₹2,499/month, up to 10 users",
      "required": true
    },
    {
      "id": "whatToAsk",
      "label": "What should it find out before recommending something?",
      "hint": "It asks one thing at a time, and skips anything the customer has already said.",
      "type": "textarea",
      "placeholder": "How many people will use it\nWhen they need it by"
    },
    {
      "id": "checkoutLink",
      "label": "Where should it send people to buy?",
      "hint": "A payment or checkout link, for anything without its own product page. Leave blank if you'd rather it handed over to you.",
      "type": "text",
      "placeholder": "https://yourshop.com/checkout"
    },
    {
      "id": "discountPolicy",
      "label": "Are you willing to discount?",
      "hint": "Be specific. Vague answers here are how agents give away margin.",
      "type": "textarea",
      "placeholder": "10% off annual plans only. Never discount the Starter plan."
    },
    {
      "id": "commonObjections",
      "label": "What do people push back on, and what's your answer?",
      "type": "textarea",
      "placeholder": "\"Too expensive\" — point out it replaces two other tools."
    },
    {
      "id": "addOns",
      "label": "Anything it should offer alongside a purchase?",
      "hint": "Mentioned once, after someone has decided — never before.",
      "type": "textarea",
      "placeholder": "Annual plan: offer the onboarding call (₹2,000)."
    }
  ]
};

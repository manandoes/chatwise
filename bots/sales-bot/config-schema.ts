// The Sales agent — setup questions.
//
// Uses the product catalogue, pricing and a checkout link (docs/PRD.md §5).
//
// This file only describes what the agent needs to know about the business.
// Its instructions (prompt.ts) and its behaviour (handler.ts) are built in a
// later phase — see docs/Phases.md.

import type { BotConfigSchema } from "@/bots/shared/config-types";

export const salesBotConfigSchema: BotConfigSchema = {
  "type": "SALES",
  "name": "Sales",
  "tagline": "Answers pricing questions and points people to checkout.",
  "trigger": "\"Which plan?\", \"how much is it?\", and similar.",
  "icon": "Tag",
  "questions": [
    {
      "id": "productsAndPrices",
      "label": "What you sell, and what it costs",
      "hint": "The agent quotes only these prices — it will never guess one.",
      "type": "textarea",
      "placeholder": "Starter — ₹999/month, up to 3 users\nGrowth — ₹2,499/month, up to 10 users",
      "required": true
    },
    {
      "id": "checkoutLink",
      "label": "Where should it send people to buy?",
      "hint": "A payment or checkout link. Leave blank if you'd rather it handed over to you.",
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
    }
  ]
};

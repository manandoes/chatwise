// The Personal Shopper agent — setup questions.
//
// Uses the catalogue and checkout (docs/PRD.md §5).
//
// This file only describes what the agent needs to know about the business.
// Its instructions (prompt.ts) and its behaviour (handler.ts) are built in a
// later phase — see docs/Phases.md.

import type { BotConfigSchema } from "@/bots/shared/config-types";

export const personalShopperBotConfigSchema: BotConfigSchema = {
  "type": "PERSONAL_SHOPPER",
  "name": "Personal Shopper",
  "tagline": "Turns a vague brief into real suggestions.",
  "trigger": "\"A gift under ₹5,000\" and similar open-ended asks.",
  "icon": "ShoppingBag",
  "questions": [
    {
      "id": "catalogue",
      "label": "What's in your range?",
      "hint": "Categories and rough price bands are enough to start.",
      "type": "textarea",
      "placeholder": "Silver jewellery ₹1,500–₹8,000\nLeather bags ₹4,000–₹20,000",
      "required": true
    },
    {
      "id": "bestSellers",
      "label": "What would you recommend to almost anyone?",
      "hint": "Its fallback when someone gives it very little to go on.",
      "type": "textarea",
      "placeholder": "The engraved silver bangle — works as a gift for most people."
    },
    {
      "id": "checkoutLink",
      "label": "Where should it send people to buy?",
      "type": "text",
      "placeholder": "https://yourshop.com"
    },
    {
      "id": "questionsToAsk",
      "label": "What should it ask to narrow things down?",
      "type": "textarea",
      "placeholder": "Who it's for\nBudget\nAny styles they like or hate"
    }
  ]
};

// The Support agent — setup questions.
//
// Works against the orders or ticketing system (docs/PRD.md §5).
//
// This file only describes what the agent needs to know about the business.
// Its instructions (prompt.ts) and its behaviour (handler.ts) are built in a
// later phase — see docs/Phases.md.

import type { BotConfigSchema } from "@/bots/shared/config-types";

export const supportBotConfigSchema: BotConfigSchema = {
  "type": "SUPPORT",
  "name": "Support",
  "tagline": "Picks up order problems and raises what it can't fix.",
  "trigger": "A message about an order or something that's gone wrong.",
  "icon": "LifeBuoy",
  "questions": [
    {
      "id": "commonIssues",
      "label": "What goes wrong most often?",
      "hint": "One per line, with how you'd normally resolve each.",
      "type": "textarea",
      "placeholder": "Order hasn't arrived — check tracking, then reship if over 7 days\nWrong size — free exchange within 14 days",
      "required": true
    },
    {
      "id": "orderLookup",
      "label": "What does it need to look up an order?",
      "type": "text",
      "placeholder": "Order number, or the phone number used to buy",
      "required": true
    },
    {
      "id": "refundPolicy",
      "label": "Your returns and refunds policy",
      "hint": "The agent quotes this rather than making a judgement call.",
      "type": "textarea",
      "placeholder": "Returns within 14 days, unworn, with the tag on. Refund in 5 working days.",
      "required": true
    },
    {
      "id": "escalateImmediately",
      "label": "What should always come straight to a person?",
      "type": "textarea",
      "placeholder": "Anything about a damaged item, or a customer who's clearly upset."
    }
  ]
};

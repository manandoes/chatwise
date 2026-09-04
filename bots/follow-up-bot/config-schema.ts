// The Follow-up agent — setup questions.
//
// Uses approved message templates plus a scheduler (docs/PRD.md §5).
//
// This file only describes what the agent needs to know about the business.
// Its instructions (prompt.ts) and its behaviour (handler.ts) are built in a
// later phase — see docs/Phases.md.

import type { BotConfigSchema } from "@/bots/shared/config-types";

export const followUpBotConfigSchema: BotConfigSchema = {
  "type": "FOLLOW_UP",
  "name": "Follow-up",
  "tagline": "Chases the quotes that went quiet.",
  "trigger": "Silence after you sent someone a quote.",
  "icon": "Clock",
  "questions": [
    {
      "id": "whatYouQuote",
      "label": "What do you send quotes for?",
      "type": "textarea",
      "placeholder": "Kitchen fitting jobs, usually ₹80,000–₹4 lakh.",
      "required": true
    },
    {
      "id": "waitBefore",
      "label": "How long should it wait before following up?",
      "type": "select",
      "required": true,
      "options": [
        {
          "value": "1d",
          "label": "A day"
        },
        {
          "value": "3d",
          "label": "Three days"
        },
        {
          "value": "7d",
          "label": "A week"
        },
        {
          "value": "14d",
          "label": "Two weeks"
        }
      ]
    },
    {
      "id": "maxFollowUps",
      "label": "How many times should it try?",
      "hint": "Chasing too often is the fastest way to annoy someone into a no.",
      "type": "select",
      "required": true,
      "options": [
        {
          "value": "1",
          "label": "Once"
        },
        {
          "value": "2",
          "label": "Twice"
        },
        {
          "value": "3",
          "label": "Three times"
        }
      ]
    },
    {
      "id": "followUpTone",
      "label": "What should the nudge say?",
      "hint": "Roughly — it'll write in your tone, but this is the gist.",
      "type": "textarea",
      "placeholder": "Check if they had questions about the quote, offer a call."
    }
  ]
};

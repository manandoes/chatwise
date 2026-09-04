// The Internal agent — setup questions.
//
// Internal use only — not customer-facing (docs/PRD.md §5).
//
// This file only describes what the agent needs to know about the business.
// Its instructions (prompt.ts) and its behaviour (handler.ts) are built in a
// later phase — see docs/Phases.md.

import type { BotConfigSchema } from "@/bots/shared/config-types";

export const internalBotConfigSchema: BotConfigSchema = {
  "type": "INTERNAL",
  "name": "Internal",
  "tagline": "Answers your own team's questions, not customers'.",
  "trigger": "A question from someone who works for you.",
  "icon": "Users",
  "questions": [
    {
      "id": "whoUsesIt",
      "label": "Who will be asking it things?",
      "type": "text",
      "placeholder": "Shop floor staff and the two delivery drivers",
      "required": true
    },
    {
      "id": "whatItAnswers",
      "label": "What should it be able to answer?",
      "type": "textarea",
      "placeholder": "Shift timings, leave policy, how to process a return, who to call when the till jams.",
      "required": true
    },
    {
      "id": "neverShare",
      "label": "What must it never share?",
      "hint": "This one matters — everyone messaging it is inside your business.",
      "type": "textarea",
      "placeholder": "Anyone's salary, or the owner's personal number.",
      "required": true
    }
  ]
};

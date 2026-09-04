// The Feedback agent — setup questions.
//
// Writes to the CRM and raises a tag or alert (docs/PRD.md §5).
//
// This file only describes what the agent needs to know about the business.
// Its instructions (prompt.ts) and its behaviour (handler.ts) are built in a
// later phase — see docs/Phases.md.

import type { BotConfigSchema } from "@/bots/shared/config-types";

export const feedbackBotConfigSchema: BotConfigSchema = {
  "type": "FEEDBACK",
  "name": "Feedback",
  "tagline": "Asks how it went, and flags the unhappy replies.",
  "trigger": "A reply after someone has bought something.",
  "icon": "Star",
  "questions": [
    {
      "id": "whatToAsk",
      "label": "What do you want to know?",
      "hint": "Keep it to one or two things — long surveys go unanswered.",
      "type": "textarea",
      "placeholder": "How the fitting went, and whether the fitter was on time.",
      "required": true
    },
    {
      "id": "askAfter",
      "label": "When should it ask?",
      "type": "select",
      "required": true,
      "options": [
        {
          "value": "same_day",
          "label": "Same day"
        },
        {
          "value": "1d",
          "label": "The next day"
        },
        {
          "value": "3d",
          "label": "After three days"
        },
        {
          "value": "7d",
          "label": "After a week"
        }
      ]
    },
    {
      "id": "unhappyThreshold",
      "label": "What counts as an unhappy reply?",
      "hint": "Anything matching this comes to you rather than being filed away.",
      "type": "textarea",
      "placeholder": "Any rating of 3 or less, or any mention of a delay or damage.",
      "required": true
    }
  ]
};

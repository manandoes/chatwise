// The Receptionist agent — setup questions.
//
// Answers from the business's own knowledge base — hours, FAQs, policies (docs/PRD.md §5).
//
// This file only describes what the agent needs to know about the business.
// Its instructions (prompt.ts) and its behaviour (handler.ts) are built in a
// later phase — see docs/Phases.md.

import type { BotConfigSchema } from "@/bots/shared/config-types";

export const receptionistBotConfigSchema: BotConfigSchema = {
  "type": "RECEPTIONIST",
  "name": "Receptionist",
  "tagline": "Answers the everyday questions so you don't have to.",
  "trigger": "Any general question from a customer.",
  "icon": "ConciergeBell",
  "questions": [
    {
      "id": "openingHours",
      "label": "Your opening hours",
      "hint": "Write them however you'd say them out loud. The agent will quote these exactly.",
      "type": "textarea",
      "placeholder": "Mon–Sat 9am–7pm, Sunday 10am–4pm. Closed on public holidays.",
      "required": true
    },
    {
      "id": "commonQuestions",
      "label": "What do customers ask you most?",
      "hint": "List a few, one per line. These become the answers it reaches for first.",
      "type": "textarea",
      "placeholder": "Do you take card?\nIs there parking?\nDo I need an appointment?",
      "required": true
    },
    {
      "id": "location",
      "label": "Where are you based?",
      "hint": "Only what you're happy for the agent to share with a customer.",
      "type": "text",
      "placeholder": "14 MG Road, Bengaluru 560001"
    },
    {
      "id": "neverAnswer",
      "label": "Anything it should never answer?",
      "hint": "Topics it should hand to you instead of attempting.",
      "type": "textarea",
      "placeholder": "Complaints, refunds, anything about a specific bill."
    }
  ]
};

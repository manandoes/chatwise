// The Lead Qualifier agent — setup questions.
//
// Scores and stores the lead in the CRM (docs/PRD.md §5).
//
// This file only describes what the agent needs to know about the business.
// Its instructions (prompt.ts) and its behaviour (handler.ts) are built in a
// later phase — see docs/Phases.md.

import type { BotConfigSchema } from "@/bots/shared/config-types";

export const leadQualifierBotConfigSchema: BotConfigSchema = {
  "type": "LEAD_QUALIFIER",
  "name": "Lead Qualifier",
  "tagline": "Works out which enquiries are worth your time.",
  "trigger": "A new enquiry from someone who hasn't bought yet.",
  "icon": "Filter",
  "questions": [
    {
      "id": "whatYouSell",
      "label": "What are people enquiring about?",
      "hint": "The service or product an enquiry is usually about.",
      "type": "textarea",
      "placeholder": "Interior design for 2–4 BHK flats, typically ₹3–15 lakh projects.",
      "required": true
    },
    {
      "id": "goodLead",
      "label": "What makes an enquiry worth following up?",
      "hint": "How you'd tell a promising enquiry from a time-waster.",
      "type": "textarea",
      "placeholder": "Has a budget over ₹3 lakh, wants to start within 3 months, is in Bengaluru.",
      "required": true
    },
    {
      "id": "infoToCollect",
      "label": "What should it find out before handing the lead over?",
      "hint": "One per line. It'll ask for these naturally rather than as a form.",
      "type": "textarea",
      "placeholder": "Name\nWhich area they're in\nRough budget\nWhen they want to start",
      "required": true
    },
    {
      "id": "afterQualifying",
      "label": "What happens once someone qualifies?",
      "hint": "What the agent should tell them to expect next.",
      "type": "textarea",
      "placeholder": "Tell them a designer will call within one working day."
    }
  ]
};

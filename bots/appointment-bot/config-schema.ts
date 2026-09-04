// The Appointment agent — setup questions.
//
// Reads and writes the business's calendar (docs/PRD.md §5).
//
// This file only describes what the agent needs to know about the business.
// Its instructions (prompt.ts) and its behaviour (handler.ts) are built in a
// later phase — see docs/Phases.md.

import type { BotConfigSchema } from "@/bots/shared/config-types";

export const appointmentBotConfigSchema: BotConfigSchema = {
  "type": "APPOINTMENT",
  "name": "Appointment",
  "tagline": "Takes bookings without the back-and-forth.",
  "trigger": "\"Can I come at 4?\" and anything else about booking a time.",
  "icon": "CalendarClock",
  "questions": [
    {
      "id": "bookableServices",
      "label": "What can people book?",
      "hint": "One per line, with how long each takes if it varies.",
      "type": "textarea",
      "placeholder": "Haircut — 30 min\nColour — 2 hours\nConsultation — 15 min",
      "required": true
    },
    {
      "id": "bookingHours",
      "label": "When can people book?",
      "hint": "The hours you actually take appointments, if different from opening hours.",
      "type": "textarea",
      "placeholder": "Tue–Sat 10am–6pm. Last appointment 5pm.",
      "required": true
    },
    {
      "id": "noticeRequired",
      "label": "How much notice do you need?",
      "type": "select",
      "required": true,
      "options": [
        {
          "value": "none",
          "label": "None — same-day is fine"
        },
        {
          "value": "2h",
          "label": "At least 2 hours"
        },
        {
          "value": "24h",
          "label": "At least a day"
        },
        {
          "value": "48h",
          "label": "At least two days"
        }
      ]
    },
    {
      "id": "cancellationPolicy",
      "label": "Your cancellation or rescheduling policy",
      "hint": "What the agent should tell someone who wants to change a booking.",
      "type": "textarea",
      "placeholder": "Free to reschedule with 4 hours' notice. Later than that we charge 50%."
    }
  ]
};

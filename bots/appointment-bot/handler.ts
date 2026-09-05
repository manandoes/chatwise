// How the Appointment agent decides what to reply.
//
// Thin on purpose: what makes this agent safe is its prompt — specifically the
// part that stops it inventing a free slot (docs/Rules.md §2 and §5).

import type { BotHandler } from "../shared/handler-types.ts";
import { askAgent } from "../shared/run-agent.ts";
import { appointmentSystemPrompt } from "./prompt.ts";

export const appointmentHandler: BotHandler = (request) =>
  askAgent({
    system: appointmentSystemPrompt(request),
    request,
    // Every booking ends here until a calendar is connected: the agent has the
    // request, and a person confirms the time.
    handoffReason:
      "Someone wants a booking confirmed, changed or cancelled — the agent cannot see the diary, so a person needs to.",
  });

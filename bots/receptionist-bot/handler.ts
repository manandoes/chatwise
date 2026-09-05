// How the Receptionist decides what to reply.
//
// Deliberately thin. The interesting part of this agent is its prompt, not its
// code — which is the point of keeping every agent's instructions in a plain
// prompt.ts a non-developer can read (docs/Rules.md §2).
//
// Asking the model, and coping when it is slow or unavailable, is the same for
// every agent and lives in shared/run-agent.ts.

import type { BotHandler } from "../shared/handler-types.ts";
import { askAgent } from "../shared/run-agent.ts";
import { receptionistSystemPrompt } from "./prompt.ts";

export const receptionistHandler: BotHandler = (request) =>
  askAgent({
    system: receptionistSystemPrompt(request),
    request,
    handoffReason: "The agent could not answer this from the knowledge base.",
  });

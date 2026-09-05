// How the Lead Qualifier decides what to reply.
//
// Thin on purpose: what makes this agent good at its job is its prompt, not its
// code (docs/Rules.md §2). Asking the model and coping when it cannot answer is
// shared by every agent and lives in shared/run-agent.ts.

import type { BotHandler } from "../shared/handler-types.ts";
import { askAgent } from "../shared/run-agent.ts";
import { leadQualifierSystemPrompt } from "./prompt.ts";

export const leadQualifierHandler: BotHandler = (request) =>
  askAgent({
    system: leadQualifierSystemPrompt(request),
    request,
    // Handing over is usually the *good* ending for this agent: it means the
    // enquiry is ready for a person. It also covers the ordinary case of a
    // question it could not answer, so the wording says both.
    handoffReason:
      "The Lead Qualifier has taken this enquiry as far as it can — either it has what the team needs, or it hit something only a person can answer.",
  });

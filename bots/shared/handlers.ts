// Which agent handles which bot type.
//
// The message router looks an account's chosen agent up here rather than
// knowing any agent by name. Phase 8 filled the list in: all nine selectable
// agents are built, so every account gets its own agent's answers rather than a
// holding message.
//
// It stays a `Partial` record even now that nothing is missing. A new bot type
// added to the enum ahead of its folder is exactly the situation that used to
// exist, and the type makes every caller keep coping with it — the router
// hands the thread to a person rather than guessing at what that agent would
// have said.
//
// The CRM agent is deliberately absent: it is not something an account chooses,
// it runs alongside whichever agent is listed here (docs/PRD.md §3.1). The
// router calls it directly.

import type { BotType } from "./config-types.ts";
import type { BotHandler } from "./handler-types.ts";
import { appointmentHandler } from "../appointment-bot/handler.ts";
import { feedbackHandler } from "../feedback-bot/handler.ts";
import { followUpHandler } from "../follow-up-bot/handler.ts";
import { internalHandler } from "../internal-bot/handler.ts";
import { leadQualifierHandler } from "../lead-qualifier-bot/handler.ts";
import { personalShopperHandler } from "../personal-shopper-bot/handler.ts";
import { receptionistHandler } from "../receptionist-bot/handler.ts";
import { salesHandler } from "../sales-bot/handler.ts";
import { supportHandler } from "../support-bot/handler.ts";

const HANDLERS: Partial<Record<BotType, BotHandler>> = {
  RECEPTIONIST: receptionistHandler,
  LEAD_QUALIFIER: leadQualifierHandler,
  APPOINTMENT: appointmentHandler,
  SALES: salesHandler,
  SUPPORT: supportHandler,
  FOLLOW_UP: followUpHandler,
  PERSONAL_SHOPPER: personalShopperHandler,
  FEEDBACK: feedbackHandler,
  INTERNAL: internalHandler,
};

/** The handler for an agent, or null if that agent has not been built yet. */
export function handlerFor(type: BotType): BotHandler | null {
  return HANDLERS[type] ?? null;
}

/** Which agents can actually answer a message today. */
export function builtBotTypes(): BotType[] {
  return Object.keys(HANDLERS) as BotType[];
}

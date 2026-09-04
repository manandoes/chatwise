// The catalogue of agents a customer can choose from.
//
// This is the single source of truth. The setup wizard's picker reads it, the
// API validates against it, and the dashboard uses it to describe whichever
// agent an account settled on. Adding a bot means adding its folder and listing
// it here — nothing else needs to know.
//
// The CRM agent is deliberately absent: it runs in the background alongside
// whichever agent was chosen and is never selectable (docs/PRD.md §3.1).

import { appointmentBotConfigSchema } from "@/bots/appointment-bot/config-schema";
import { feedbackBotConfigSchema } from "@/bots/feedback-bot/config-schema";
import { followUpBotConfigSchema } from "@/bots/follow-up-bot/config-schema";
import { internalBotConfigSchema } from "@/bots/internal-bot/config-schema";
import { leadQualifierBotConfigSchema } from "@/bots/lead-qualifier-bot/config-schema";
import { personalShopperBotConfigSchema } from "@/bots/personal-shopper-bot/config-schema";
import { receptionistBotConfigSchema } from "@/bots/receptionist-bot/config-schema";
import { salesBotConfigSchema } from "@/bots/sales-bot/config-schema";
import type { BotConfigSchema, BotType } from "@/bots/shared/config-types";
import { supportBotConfigSchema } from "@/bots/support-bot/config-schema";

/** Every selectable agent, in the order the picker shows them. */
export const BOT_CATALOG: BotConfigSchema[] = [
  receptionistBotConfigSchema,
  leadQualifierBotConfigSchema,
  appointmentBotConfigSchema,
  salesBotConfigSchema,
  supportBotConfigSchema,
  followUpBotConfigSchema,
  personalShopperBotConfigSchema,
  feedbackBotConfigSchema,
  internalBotConfigSchema,
];

const BY_TYPE = new Map<string, BotConfigSchema>(
  BOT_CATALOG.map((bot) => [bot.type, bot]),
);

/** Looks up one agent. Returns undefined for anything not in the catalogue. */
export function getBot(type: string | null | undefined) {
  return type ? BY_TYPE.get(type) : undefined;
}

/**
 * True only for a string that names a real, selectable agent. Every API route
 * that accepts a bot type runs the incoming value through this rather than
 * trusting it (docs/Rules.md §3).
 */
export function isSelectableBotType(value: unknown): value is BotType {
  return typeof value === "string" && BY_TYPE.has(value);
}

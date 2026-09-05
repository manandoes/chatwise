// What an account has used this month, and whether it may use any more.
//
// Everything here is **counted from the real rows**, never from a running
// total. There is no counter column and no usage table: the number of messages
// an account sent is the number of outbound messages in its conversations, and
// a figure worked out that way cannot drift from what actually happened. Same
// reasoning as lib/analytics.ts.
//
// The limits themselves live in lib/plans.ts, which is the only file to edit
// when a plan changes.
//
// One rule governs the whole file: **when payments are not switched on for this
// installation, nothing is limited.** Holding an account to the free plan's
// numbers when there is no way to pay for a bigger one would be a bug wearing a
// business rule's clothes.

import "server-only";

import { db } from "./db.ts";
import { formatLimit, type Plan } from "./plans.ts";
import { readAccountPlan } from "./subscription.ts";

export type Allowance = {
  used: number;
  limit: number | null;
  /** Null when there is no limit. */
  remaining: number | null;
  isAtLimit: boolean;
};

export type Usage = {
  plan: Plan;
  /** The period everything below is counted over. */
  periodStart: Date;
  periodEnd: Date | null;
  /** True when the period is a calendar month rather than a paid one. */
  isCalendarMonth: boolean;
  messages: Allowance;
  campaigns: Allowance;
  templates: Allowance;
  knowledgeEntries: Allowance;
  /** False when payments aren't switched on, in which case nothing is limited. */
  limitsApply: boolean;
};

function allowance(used: number, limit: number | null): Allowance {
  return {
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    isAtLimit: limit !== null && used >= limit,
  };
}

/** Everything the billing screen shows, counted in one go. */
export async function readUsage(businessId: string): Promise<Usage> {
  const account = await readAccountPlan(businessId);
  const periodStart = account.periodStart;

  const [messages, campaigns, templates, knowledgeEntries] = await Promise.all([
    countMessagesSent(businessId, periodStart),
    countCampaignsStarted(businessId, periodStart),
    db.messageTemplate.count({ where: { businessId } }),
    db.knowledgeEntry.count({ where: { businessId } }),
  ]);

  const plan = account.plan;

  return {
    plan,
    periodStart,
    periodEnd: account.periodEnd,
    isCalendarMonth: !account.hasRazorpaySubscription,
    messages: allowance(messages, plan.monthlyMessageLimit),
    campaigns: allowance(campaigns, plan.monthlyCampaignLimit),
    templates: allowance(templates, plan.savedTemplateLimit),
    knowledgeEntries: allowance(knowledgeEntries, plan.knowledgeEntryLimit),
    limitsApply: account.billingIsLive,
  };
}

/**
 * Messages this account has **sent** in the period.
 *
 * Counts the agent's replies, replies a person typed in the inbox, and campaign
 * messages — everything that leaves the account. Inbound messages are never
 * counted: a business cannot control how many it receives, and charging for
 * them would mean the busiest day of the year is the one where the agent goes
 * quiet.
 */
export async function countMessagesSent(
  businessId: string,
  since: Date,
): Promise<number> {
  return db.message.count({
    where: {
      conversation: { businessId },
      direction: "OUTBOUND",
      createdAt: { gte: since },
    },
  });
}

export async function countCampaignsStarted(
  businessId: string,
  since: Date,
): Promise<number> {
  return db.campaign.count({
    where: { businessId, createdAt: { gte: since } },
  });
}

export type QuotaCheck = { ok: true } | { ok: false; message: string };

const WITHIN_LIMITS: QuotaCheck = { ok: true };

/**
 * May this account send `count` more messages?
 *
 * Called before the agent replies and before a campaign is scheduled. It costs
 * nothing at all on a plan with no message limit, and nothing when payments
 * aren't switched on — in both cases it returns before touching the database.
 */
export async function checkMessageQuota(
  businessId: string,
  count = 1,
): Promise<QuotaCheck> {
  const account = await readAccountPlan(businessId);

  if (!account.billingIsLive) return WITHIN_LIMITS;

  const limit = account.plan.monthlyMessageLimit;

  if (limit === null) return WITHIN_LIMITS;

  const used = await countMessagesSent(businessId, account.periodStart);

  if (used + count <= limit) return WITHIN_LIMITS;

  return {
    ok: false,
    message:
      count === 1
        ? `You've sent all ${formatLimit(limit)} messages included in ${account.plan.name} this month. Upgrade in Billing to carry on.`
        : `That would take you past the ${formatLimit(limit)} messages included in ${account.plan.name} this month — you have ${formatLimit(Math.max(0, limit - used))} left. Upgrade in Billing, or send to fewer people.`,
  };
}

/** May this account start another campaign this month? */
export async function checkCampaignQuota(
  businessId: string,
): Promise<QuotaCheck> {
  const account = await readAccountPlan(businessId);

  if (!account.billingIsLive) return WITHIN_LIMITS;

  const limit = account.plan.monthlyCampaignLimit;

  if (limit === null) return WITHIN_LIMITS;

  const used = await countCampaignsStarted(businessId, account.periodStart);

  if (used < limit) return WITHIN_LIMITS;

  return {
    ok: false,
    message:
      limit === 1
        ? `${account.plan.name} includes one campaign a month, and you've sent it. Upgrade in Billing to send another.`
        : `You've used all ${limit} campaigns included in ${account.plan.name} this month. Upgrade in Billing to send another.`,
  };
}

/** May this account save another template? */
export async function checkTemplateQuota(
  businessId: string,
  /** Null when adding a new one; the template's id when editing an existing one. */
  editingId: string | null = null,
): Promise<QuotaCheck> {
  const account = await readAccountPlan(businessId);

  if (!account.billingIsLive) return WITHIN_LIMITS;

  const limit = account.plan.savedTemplateLimit;

  if (limit === null || editingId) return WITHIN_LIMITS;

  const used = await db.messageTemplate.count({ where: { businessId } });

  if (used < limit) return WITHIN_LIMITS;

  return {
    ok: false,
    message: `${account.plan.name} keeps up to ${limit} saved templates. Delete one, or upgrade in Billing.`,
  };
}

/** May this account keep `count` knowledge-base answers? */
export async function checkKnowledgeQuota(
  businessId: string,
  count: number,
): Promise<QuotaCheck> {
  const account = await readAccountPlan(businessId);

  if (!account.billingIsLive) return WITHIN_LIMITS;

  const limit = account.plan.knowledgeEntryLimit;

  if (limit === null || count <= limit) return WITHIN_LIMITS;

  return {
    ok: false,
    message: `${account.plan.name} includes ${limit} knowledge-base answers, and you've written ${count}. Trim the list, or upgrade in Billing.`,
  };
}

/**
 * May this account connect through the official WhatsApp Business API?
 *
 * The one capability difference between the plans, rather than a matter of how
 * much (docs/PRD.md §7.1).
 */
export async function checkApiConnectionAllowed(
  businessId: string,
): Promise<QuotaCheck> {
  const account = await readAccountPlan(businessId);

  if (!account.billingIsLive) return WITHIN_LIMITS;
  if (account.plan.allowsApiConnection) return WITHIN_LIMITS;

  return {
    ok: false,
    message:
      "The official WhatsApp Business API is part of the Growth plan. Upgrade in Billing, or connect by scanning a QR code instead.",
  };
}

/**
 * How far back this account's plan lets it look.
 *
 * Analytics offers 7 days, 30 days and all time; a plan may allow fewer of
 * those. Returned as a list rather than a maximum so the screen can render the
 * choices it has without knowing the rule.
 */
export async function allowedHistoryWindows(
  businessId: string,
): Promise<("7d" | "30d" | "all")[]> {
  const account = await readAccountPlan(businessId);

  if (!account.billingIsLive) return ["7d", "30d", "all"];

  switch (account.plan.historyWindow) {
    case "7d":
      return ["7d"];
    case "30d":
      return ["7d", "30d"];
    default:
      return ["7d", "30d", "all"];
  }
}

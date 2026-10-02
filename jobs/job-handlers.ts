// Which code runs for which kind of queued job.
//
// A job row names its type ("shopify.webhook", "automation.send", …); this
// file maps each name to the function that does the work, and says whether
// that work may safely be repeated if the runner dies part-way through (see
// jobs/pending-job-runner.ts). Anything that sends a WhatsApp message is not.
//
// Relative .ts imports throughout: this runs on the always-on host.

import "server-only";

import type { AutomationKind } from "../lib/generated/prisma/client.ts";
import { sendAutomatedMessage } from "../lib/automations.ts";
import { embedProduct } from "../lib/catalog.ts";
import { businessesWithRules, evaluateAllRules } from "../lib/tag-rules.ts";
import {
  handleComplianceRequest,
  loadActiveShop,
  registerWebhooks,
  runBackfillPage,
} from "../integrations/shopify/connect.ts";
import { processShopifyWebhook, sendAbandonedCartReminder } from "../integrations/shopify/sync.ts";
import { applyPaymentEvent, readProviderEvent } from "../integrations/payments/links.ts";
import { runDueExports, runImport } from "../integrations/google/sheets.ts";
import { processCalendlyWebhook, sendDueBookingReminders } from "../integrations/calendly/sync.ts";
import { isFeatureEnabled } from "../lib/features.ts";
import { db } from "../lib/db.ts";
import { businessesToSync, syncTemplatesFromMeta } from "../campaigns/templates/meta-sync.ts";
import { composeFollowUpNudge } from "../bots/follow-up-bot/handler.ts";
import { followUpSchedule } from "../bots/follow-up-bot/handler.ts";
import { composeFeedbackRequest } from "../bots/feedback-bot/handler.ts";
import { feedbackDelayMs } from "../bots/feedback-bot/handler.ts";
import { connectorForConnection } from "../whatsapp-connectors/index.ts";
import type { BotRequest, ConversationTurn } from "../bots/shared/handler-types.ts";
import type { BotType } from "../bots/shared/config-types.ts";
import { HISTORY_LIMIT } from "../bots/shared/prompt-shared.ts";

export type JobContext = {
  id: string;
  businessId: string | null;
  shopId: string | null;
  payload: Record<string, unknown>;
  /** 1 on the first run. */
  attempt: number;
};

export type JobOutcome =
  | { status: "done"; note?: string }
  | { status: "retry"; error?: string; delayMs?: number }
  | { status: "failed"; error: string };

export type JobHandler = {
  run(job: JobContext): Promise<JobOutcome | void>;
  /** May this run again if it was interrupted? False for anything that sends. */
  safeToRepeat: boolean;
};

/**
 * Sends one automated message. Payload: { kind, contactId, variables, manual }.
 *
 * A message skipped for a good reason (opted out, switched off, outside the
 * 24-hour window) is a finished job, not a failure — the reason is kept on
 * the row so the owner can see why.
 */
export const automationSendHandler: JobHandler = {
  safeToRepeat: false,
  async run(job) {
    if (!job.businessId) return { status: "failed", error: "No business on this job." };

    const outcome = await sendAutomatedMessage({
      businessId: job.businessId,
      contactId: String(job.payload.contactId ?? ""),
      kind: job.payload.kind as AutomationKind,
      variables: (job.payload.variables ?? {}) as Record<string, string>,
      manual: job.payload.manual === true,
    });

    if (outcome.status === "sent") return { status: "done" };
    if (outcome.status === "retry") return { status: "retry", error: outcome.reason };
    if (outcome.status === "failed") return { status: "failed", error: outcome.reason };

    return { status: "done", note: outcome.reason };
  },
};

// ─── Shopify ────────────────────────────────────────────────────────────────
//
// Everything below is safe to repeat: writes are upserts on Shopify's own ids,
// and any message is itself a separate `automation.send` job queued under a
// dedupe key, so a re-run queues nothing new.

/** One webhook, queued by app/api/shopify/webhooks. Payload: { topic, body }. */
const shopifyWebhookHandler: JobHandler = {
  safeToRepeat: true,
  async run(job) {
    const shop = await loadActiveShop(job.shopId);

    if (!shop) return { status: "done", note: "The store is disconnected." };

    const note = await processShopifyWebhook(
      { id: shop.id, businessId: shop.businessId, shopDomain: shop.shopDomain, active: true },
      String(job.payload.topic ?? ""),
      (job.payload.body ?? {}) as Record<string, unknown>,
    );

    return { status: "done", note };
  },
};

/** Payload: { checkoutId }. */
const abandonedCartHandler: JobHandler = {
  safeToRepeat: true,
  async run(job) {
    if (!job.businessId) return { status: "failed", error: "No business on this job." };

    const result = await sendAbandonedCartReminder(job.businessId, String(job.payload.checkoutId ?? ""));

    return { status: "done", note: result.reason };
  },
};

const registerWebhooksHandler: JobHandler = {
  safeToRepeat: true,
  async run(job) {
    return { status: "done", note: await registerWebhooks(job.shopId) };
  },
};

const backfillHandler: JobHandler = {
  safeToRepeat: true,
  async run(job) {
    return { status: "done", note: await runBackfillPage(job.shopId, job.payload) };
  },
};

/** Payload: { requestId, customerId }. */
const complianceHandler: JobHandler = {
  safeToRepeat: true,
  async run(job) {
    const customerId = job.payload.customerId ? String(job.payload.customerId) : null;

    return { status: "done", note: await handleComplianceRequest(String(job.payload.requestId ?? ""), customerId) };
  },
};

// ─── Payment links ──────────────────────────────────────────────────────────

/**
 * One Razorpay or Stripe webhook. Payload: { accountId, body }. The account
 * fixes the business; status only moves forward and each message is its own
 * deduped job, so running this twice is harmless.
 */
const paymentsWebhookHandler: JobHandler = {
  safeToRepeat: true,
  async run(job) {
    const account = await db.paymentAccount.findUnique({
      where: { id: String(job.payload.accountId ?? "") },
      select: { businessId: true, provider: true },
    });

    if (!account) return { status: "done", note: "The payment account was removed." };

    const note = await applyPaymentEvent(account, readProviderEvent(account.provider, job.payload.body));

    return { status: "done", note };
  },
};

// ─── CRM ────────────────────────────────────────────────────────────────────

/** Indexes one product for search. Payload: { productId }. */
const catalogEmbedHandler: JobHandler = {
  safeToRepeat: true,
  async run(job) {
    if (!job.businessId) return { status: "failed", error: "No business on this job." };

    const result = await embedProduct(job.businessId, String(job.payload.productId ?? ""));

    if (result === "retry") return { status: "retry", error: "The AI provider is busy." };
    if (result === "failed") return { status: "failed", error: "The AI provider couldn't index this product." };

    return { status: "done" };
  },
};

/** Re-applies one business's auto-tag rules, after a rule was saved. */
const evaluateRulesHandler: JobHandler = {
  safeToRepeat: true,
  async run(job) {
    if (!job.businessId) return { status: "failed", error: "No business on this job." };

    await evaluateAllRules(job.businessId);

    return { status: "done" };
  },
};

/** The daily sweep: relative dates ("no order for 60 days") drift overnight. */
const evaluateAllRulesHandler: JobHandler = {
  safeToRepeat: true,
  async run() {
    const businessIds = await businessesWithRules();

    for (const businessId of businessIds) await evaluateAllRules(businessId);

    return { status: "done", note: `${businessIds.length} accounts` };
  },
};

// ─── Google Sheets ───────────────────────────────────────────────────────────

/**
 * Every fifteen minutes: whichever scheduled exports are due. Each claims its
 * next slot before running, so this is safe to repeat.
 */
const scheduledExportsHandler: JobHandler = {
  safeToRepeat: true,
  async run() {
    if (!isFeatureEnabled("googleSheets")) return { status: "done", note: "Google Sheets is switched off." };

    const { ran, failed } = await runDueExports();

    return { status: "done", note: `${ran} exported, ${failed} failed` };
  },
};

/**
 * One import batch. Every write is an upsert on the phone number, so a
 * re-run after an interruption changes nothing that was already imported.
 */
const sheetsImportHandler: JobHandler = {
  safeToRepeat: true,
  async run(job) {
    if (!job.businessId) return { status: "failed", error: "No business on this job." };

    const result = await runImport(job.businessId, job.payload);

    return result.status === "retry" ? { status: "retry", error: result.note } : { status: "done", note: result.note };
  },
};

// ─── Calendly ────────────────────────────────────────────────────────────────

/** One booking or cancellation. Payload: { body }. An upsert, so safe to repeat. */
const calendlyWebhookHandler: JobHandler = {
  safeToRepeat: true,
  async run(job) {
    if (!job.businessId) return { status: "failed", error: "No business on this job." };

    return { status: "done", note: await processCalendlyWebhook(job.businessId, job.payload.body) };
  },
};

/** Every five minutes. Each reminder is claimed on its booking before it's queued. */
const bookingRemindersHandler: JobHandler = {
  safeToRepeat: true,
  async run() {
    if (!isFeatureEnabled("calendly")) return { status: "done", note: "Calendly is switched off." };

    const { queued } = await sendDueBookingReminders();

    return { status: "done", note: `${queued} reminders queued` };
  },
};

/** Every six hours: each Business API account's template statuses from Meta. */
const syncAllTemplatesHandler: JobHandler = {
  safeToRepeat: true,
  async run() {
    const businessIds = await businessesToSync();
    let failed = 0;

    for (const businessId of businessIds) {
      const result = await syncTemplatesFromMeta(businessId);

      if (!result.ok) failed += 1;
    }

    return { status: "done", note: `${businessIds.length} accounts, ${failed} couldn't be checked` };
  },
};

export const JOB_HANDLERS: Record<string, JobHandler> = {
  "automation.send": automationSendHandler,
  "shopify.webhook": shopifyWebhookHandler,
  "shopify.abandoned_cart": abandonedCartHandler,
  "shopify.register_webhooks": registerWebhooksHandler,
  "shopify.backfill": backfillHandler,
  "shopify.compliance": complianceHandler,
  "payments.webhook": paymentsWebhookHandler,
  "catalog.embed": catalogEmbedHandler,
  "tags.evaluate_rules": evaluateRulesHandler,
  "tags.evaluate_all_rules": evaluateAllRulesHandler,
  "templates.sync_all": syncAllTemplatesHandler,
  "sheets.scheduled_exports": scheduledExportsHandler,
  "sheets.import": sheetsImportHandler,
  "calendly.webhook": calendlyWebhookHandler,
  "bookings.reminders": bookingRemindersHandler,
  // Follow-up and feedback are clock-driven agents (docs/Phases.md Phase 12).
  // Sending a message is not safe to repeat, but a missed nudge is only a
  // lost opportunity — not a duplication risk — so the runner retries them.
  "followup.check": {
    safeToRepeat: false,
    async run(job) {
      if (!job.businessId) return { status: "failed", error: "No business on this job." };
      const result = await checkFollowUpsForBusiness(job.businessId);
      return { status: "done", note: `${result.sent} nudges sent, ${result.skipped} skipped` };
    },
  },
  "feedback.send": {
    safeToRepeat: false,
    async run(job) {
      if (!job.businessId) return { status: "failed", error: "No business on this job." };
      const result = await sendFeedbackRequestsForBusiness(job.businessId);
      return { status: "done", note: `${result.sent} requests sent, ${result.skipped} skipped` };
    },
  },
};

// ─── Follow-up: chase quotes that went quiet ────────────────────────────────

/** One business's setup answers, fetched from the single AgentInstance. */
async function readBotConfig(businessId: string): Promise<{
  config: Record<string, string>;
  botType: string;
  tone: string | null;
  language: string | null;
  escalationRules: string | null;
  escalateTo: string | null;
  timezone: string;
  name: string | null;
  industry: string | null;
  about: string | null;
  connectionId: string;
  connectionType: string;
} | null> {
  const row = await db.agentInstance.findUnique({
    where: { businessId },
    select: {
      config: true,
      botType: true,
      tone: true,
      language: true,
      escalationRules: true,
      escalateTo: true,
      business: {
        select: { timezone: true, name: true, industry: true, about: true, connection: { select: { id: true, type: true } } },
      },
    },
  });

  if (!row || !row.business.connection) return null;

  const config: Record<string, string> = {};
  if (typeof row.config === "object" && row.config !== null) {
    for (const [k, v] of Object.entries(row.config as Record<string, unknown>)) {
      if (typeof v === "string") config[k] = v;
    }
  }

  return {
    config,
    botType: row.botType as string,
    tone: row.tone,
    language: row.language,
    escalationRules: row.escalationRules,
    escalateTo: row.escalateTo,
    timezone: row.business.timezone,
    name: row.business.name,
    industry: row.business.industry,
    about: row.business.about,
    connectionId: row.business.connection.id,
    connectionType: row.business.connection.type,
  };
}

type CheckResult = { sent: number; skipped: number };

async function buildBotRequest(
  businessId: string,
  agent: {
    config: Record<string, string>;
    botType: string;
    tone: string | null;
    language: string | null;
    escalationRules: string | null;
    escalateTo: string | null;
    timezone: string;
    name: string | null;
    industry: string | null;
    about: string | null;
  },
  conversationId: string,
  message: string,
): Promise<BotRequest> {
  const history = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT + 1,
    select: { direction: true, body: true },
  });

  const turns: ConversationTurn[] = history.slice(1).reverse().map((m) => ({
    who: m.direction === "INBOUND" ? ("customer" as const) : ("agent" as const),
    text: m.body,
  }));

  return {
    businessId,
    business: { name: agent.name, industry: agent.industry, about: agent.about, timezone: agent.timezone },
    agent: {
      botType: agent.botType as BotType,
      config: agent.config,
      tone: agent.tone,
      language: agent.language,
      escalationRules: agent.escalationRules,
      escalateTo: agent.escalateTo,
    },
    knowledge: [],
    history: turns,
    message,
    contactName: null,
    apiKey: null,
  };
}

async function sendProactiveMessage(connectionId: string, connectionType: string, to: string, body: string): Promise<boolean> {
  const connector = connectorForConnection({ type: connectionType as "QR" | "API" });
  const result = await connector.sendText({ connectionId, to, body });
  return result.status === "sent";
}

async function checkFollowUpsForBusiness(businessId: string): Promise<CheckResult> {
  const agent = await readBotConfig(businessId);
  if (!agent) return { sent: 0, skipped: 0 };
  if (agent.botType !== "FOLLOW_UP") return { sent: 0, skipped: 0 };

  const schedule = followUpSchedule(agent.config);
  const now = new Date();
  const cutoff = new Date(now.getTime() - schedule.waitMs);

  // Find conversations that are active (not escalated), have no recent customer reply,
  // and have unread messages — indicating they went quiet after a quote.
  const quietConversations = await db.conversation.findMany({
    where: {
      businessId,
      escalatedAt: null,
      lastMessageAt: { lt: cutoff },
      unreadCount: { gt: 0 },
    },
    select: { id: true, contactPhone: true, contactName: true },
    take: 20,
  });

  let sent = 0;
  let skipped = 0;

  for (const conv of quietConversations) {
    // Count how many nudge jobs already exist for this conversation in the past wait period.
    const existingNudges = await db.pendingJob.count({
      where: {
        businessId,
        jobType: "followup.nudge",
        payload: { path: ["conversationId"], equals: conv.id },
      },
    });

    if (existingNudges >= schedule.maxAttempts) {
      skipped++;
      continue;
    }

    const request = await buildBotRequest(businessId, agent, conv.id, "");
    // Signal that this is a proactive nudge, not a customer reply.
    const response = await composeFollowUpNudge(request, existingNudges + 1);

    if (response.kind !== "reply") {
      skipped++;
      continue;
    }

    const delivered = await sendProactiveMessage(agent.connectionId, agent.connectionType, conv.contactPhone, response.text);

    if (delivered) {
      // Record the nudge job for dedupe tracking.
      await db.pendingJob.create({
        data: {
          businessId,
          jobType: "followup.nudge",
          payload: { conversationId: conv.id, attempt: existingNudges + 1 },
          runAt: new Date(now.getTime() + schedule.waitMs),
        },
      });
      sent++;
    } else {
      skipped++;
    }
  }

  return { sent, skipped };
}

// ─── Feedback: ask how things went after a purchase ─────────────────────────

async function sendFeedbackRequestsForBusiness(businessId: string): Promise<CheckResult> {
  const agent = await readBotConfig(businessId);
  if (!agent) return { sent: 0, skipped: 0 };
  if (agent.botType !== "FEEDBACK") return { sent: 0, skipped: 0 };

  const delayMs = feedbackDelayMs(agent.config);
  const now = new Date();
  const eligibleBefore = new Date(now.getTime() - delayMs);

  // Find contacts with a fulfilled order that are old enough to receive a feedback request.
  const eligibleContacts = await db.$queryRaw<
    { id: string; phone: string; name: string | null }[]
  >`
    SELECT ct.id, ct.phone, ct.name
    FROM contacts ct
    WHERE ct."businessId" = ${businessId}
      AND ct."totalSpent" > 0
      AND ct."optInStatus" != 'OPTED_OUT'
      AND NOT EXISTS (
        SELECT 1 FROM "pending_jobs" j
        WHERE j."businessId" = ${businessId}
          AND j."jobType" = 'feedback.request'
          AND j."payload"->>'contactId' = ct.id
          AND j."status" IN ('PENDING', 'RUNNING')
      )
      AND EXISTS (
        SELECT 1 FROM "orders" o
        WHERE o."contactId" = ct.id
          AND o."businessId" = ${businessId}
          AND o."status" = 'FULFILLED'
          AND o."placedAt" < ${eligibleBefore}
      )
    LIMIT 20
  `;

  let sent = 0;
  let skipped = 0;

  for (const contact of eligibleContacts) {
    const conversation = await db.conversation.findFirst({
      where: { businessId, contactId: contact.id, escalatedAt: null },
      select: { id: true },
    });

    if (!conversation) {
      skipped++;
      continue;
    }

    const request = await buildBotRequest(businessId, agent, conversation.id, "");
    const response = await composeFeedbackRequest(request);

    if (response.kind !== "reply") {
      skipped++;
      continue;
    }

    const delivered = await sendProactiveMessage(agent.connectionId, agent.connectionType, contact.phone, response.text);

    if (delivered) {
      await db.pendingJob.create({
        data: {
          businessId,
          jobType: "feedback.request",
          payload: { contactId: contact.id, conversationId: conversation.id },
          runAt: now,
        },
      });
      sent++;
    } else {
      skipped++;
    }
  }

  return { sent, skipped };
}


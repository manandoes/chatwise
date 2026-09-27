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
};


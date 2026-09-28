// Payment links: what happens between "send this customer a link for ₹1,499"
// and "they paid, here's their receipt".
//
// The two providers (razorpay.ts, stripe.ts) are translated into one shape
// here, so nothing past this file cares which the business uses:
//
//   1. `createPaymentLink` writes our Payment row FIRST, then asks the
//      provider for a link carrying our row's id, then queues the WhatsApp
//      message. A provider that fails leaves no half-made row behind.
//   2. The provider's webhook (app/api/payments/webhook/[token]) is checked
//      and queued; `applyPaymentEvent` then moves the row forward. Status only
//      ever moves forward — a late "failed" never un-pays a paid link — so a
//      re-delivered or out-of-order event changes nothing.
//   3. Each outcome queues its message (receipt, try-again, refund) under a
//      dedupe key, so nobody is told twice.
//
// Amounts are integers in the currency's smallest unit (paise, cents), which
// is how both providers count.
//
// Relative .ts imports: the job runner on the always-on host uses this.

import "server-only";

import { randomBytes } from "node:crypto";

import type { PaymentProvider } from "../../lib/generated/prisma/client.ts";
import { db } from "../../lib/db.ts";
import { decryptText, encryptText } from "../../lib/encryption.ts";
import { enqueueJob } from "../../lib/jobs.ts";
import { publicAppUrl } from "../../lib/features.ts";
import { formatMoney } from "../../lib/format-money.ts";
import { refreshContactTotals } from "../../lib/contacts.ts";
import { evaluateRulesForContact } from "../../lib/tag-rules.ts";
import { createRazorpayLink, readRazorpayEvent, verifyRazorpayKeys } from "./razorpay.ts";
import { createStripeLink, readStripeEvent, verifyStripeKey } from "./stripe.ts";
import type { PaymentEvent, ProviderResult } from "./types.ts";

/** How long a Razorpay link stays payable. Stripe's own cap is 24 hours. */
const RAZORPAY_LINK_DAYS = 7;

export const PROVIDER_NAME: Record<PaymentProvider, string> = {
  RAZORPAY: "Razorpay",
  STRIPE: "Stripe",
};

// ─── Money ──────────────────────────────────────────────────────────────────

/** 100 for INR/USD, 1 for JPY — how many smallest units make one. */
export function minorUnitFactor(currency: string): number {
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;

    return 10 ** digits;
  } catch {
    return 100;
  }
}

/** "1,499.50" in INR → 149950. Null for anything that isn't a positive amount. */
export function toMinorUnits(raw: string | number, currency: string): number | null {
  const value = typeof raw === "number" ? raw : Number(String(raw).replace(/[,\s]/g, ""));

  if (!Number.isFinite(value) || value <= 0) return null;

  const minor = Math.round(value * minorUnitFactor(currency));

  // Nobody sends a WhatsApp payment link for fifty million.
  return minor > 0 && minor <= 50_000_000 * minorUnitFactor(currency) ? minor : null;
}

export function formatMinor(amount: number, currency: string): string {
  return formatMoney(amount / minorUnitFactor(currency), currency);
}

export function isCurrencyCode(value: string): boolean {
  if (!/^[A-Z]{3}$/.test(value)) return false;

  try {
    new Intl.NumberFormat("en", { style: "currency", currency: value });
    return true;
  } catch {
    return false;
  }
}

// ─── The business's provider accounts ───────────────────────────────────────

export function paymentWebhookAddress(pathToken: string): string {
  return `${publicAppUrl()}/api/payments/webhook/${pathToken}`;
}

/**
 * Saves a business's Razorpay or Stripe keys, after checking with the
 * provider that they work. The webhook secret may be added later; until it
 * is, links can be sent but nothing learns that they were paid.
 */
export async function savePaymentAccount(input: {
  businessId: string;
  provider: PaymentProvider;
  keyId: string | null;
  secretKey: string;
  webhookSecret: string | null;
  currency: string;
}): Promise<ProviderResult<{ webhookUrl: string }>> {
  const check =
    input.provider === "RAZORPAY"
      ? await verifyRazorpayKeys({ keyId: input.keyId ?? "", keySecret: input.secretKey })
      : await verifyStripeKey(input.secretKey);

  if (!check.ok) return check;

  const data = {
    keyId: input.provider === "RAZORPAY" ? input.keyId : null,
    secretKey: new Uint8Array(encryptText(input.secretKey)),
    ...(input.webhookSecret ? { webhookSecret: new Uint8Array(encryptText(input.webhookSecret)) } : {}),
    currency: input.currency,
  };

  const account = await db.paymentAccount.upsert({
    where: { businessId_provider: { businessId: input.businessId, provider: input.provider } },
    create: {
      businessId: input.businessId,
      provider: input.provider,
      webhookPathToken: randomBytes(18).toString("base64url"),
      ...data,
    },
    update: data,
    select: { webhookPathToken: true },
  });

  return { ok: true, value: { webhookUrl: paymentWebhookAddress(account.webhookPathToken) } };
}

/** Only the webhook secret — it is often copied after the keys are saved. */
export async function saveWebhookSecret(businessId: string, provider: PaymentProvider, secret: string) {
  const updated = await db.paymentAccount.updateMany({
    where: { businessId, provider },
    data: { webhookSecret: new Uint8Array(encryptText(secret)) },
  });

  return updated.count > 0;
}

/** What the Integrations screen may show: never a key, only whether one is set. */
export async function listPaymentAccounts(businessId: string) {
  const accounts = await db.paymentAccount.findMany({
    where: { businessId },
    orderBy: { provider: "asc" },
    select: { provider: true, keyId: true, webhookSecret: true, webhookPathToken: true, currency: true },
  });

  return accounts.map((account) => ({
    provider: account.provider,
    keyId: account.keyId,
    currency: account.currency,
    hasWebhookSecret: Boolean(account.webhookSecret?.length),
    webhookUrl: paymentWebhookAddress(account.webhookPathToken),
  }));
}

// ─── Creating and sending a link ────────────────────────────────────────────

export type CreateLinkInput = {
  businessId: string;
  contactId: string;
  provider: PaymentProvider;
  amount: number;
  currency: string;
  description: string;
  reference?: string | null;
  createdById?: string | null;
  retryOfId?: string | null;
  orderId?: string | null;
};

/**
 * Creates a link with the provider and queues it to the contact on WhatsApp.
 * Returns the new payment, or the provider's reason in plain words.
 */
export async function createPaymentLink(
  input: CreateLinkInput,
): Promise<ProviderResult<{ id: string; linkUrl: string }>> {
  const [account, contact] = await Promise.all([
    db.paymentAccount.findUnique({
      where: { businessId_provider: { businessId: input.businessId, provider: input.provider } },
      select: { keyId: true, secretKey: true },
    }),
    db.contact.findFirst({
      where: { id: input.contactId, businessId: input.businessId },
      select: { id: true, phone: true, name: true, email: true, optInStatus: true },
    }),
  ]);

  if (!account) return { ok: false, message: `${PROVIDER_NAME[input.provider]} isn't connected.` };
  if (!contact) return { ok: false, message: "That contact doesn't exist." };

  if (contact.optInStatus === "OPTED_OUT") {
    return { ok: false, message: "This person has opted out of WhatsApp messages from you." };
  }

  const payment = await db.payment.create({
    data: {
      businessId: input.businessId,
      contactId: contact.id,
      provider: input.provider,
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      reference: input.reference ?? null,
      receiptToken: randomBytes(18).toString("base64url"),
      createdById: input.createdById ?? null,
      retryOfId: input.retryOfId ?? null,
      orderId: input.orderId ?? null,
    },
    select: { id: true, receiptToken: true },
  });

  const secret = decryptText(Buffer.from(account.secretKey));
  const receiptUrl = `${publicAppUrl()}/receipts/${payment.receiptToken}`;

  const link =
    input.provider === "RAZORPAY"
      ? await createRazorpayLink(
          { keyId: account.keyId ?? "", keySecret: secret },
          {
            amount: input.amount,
            currency: input.currency,
            description: input.description,
            reference: payment.id,
            customer: { name: contact.name, phone: contact.phone, email: contact.email },
            callbackUrl: receiptUrl,
            expiresAt: new Date(Date.now() + RAZORPAY_LINK_DAYS * 24 * 60 * 60_000),
          },
        )
      : await createStripeLink(secret, {
          amount: input.amount,
          currency: input.currency,
          description: input.description,
          reference: payment.id,
          customerEmail: contact.email,
          successUrl: receiptUrl,
        });

  if (!link.ok) {
    await db.payment.delete({ where: { id: payment.id } });
    return link;
  }

  await db.payment.update({
    where: { id: payment.id },
    data: { providerLinkId: link.value.id, linkUrl: link.value.url },
  });

  await queueLinkMessage(input.businessId, payment.id, `payments:PAYMENT_LINK:${payment.id}`);

  return { ok: true, value: { id: payment.id, linkUrl: link.value.url } };
}

async function queueLinkMessage(businessId: string, paymentId: string, dedupeKey: string) {
  const payment = await db.payment.findUniqueOrThrow({
    where: { id: paymentId },
    select: { contactId: true, amount: true, currency: true, description: true, linkUrl: true },
  });

  if (!payment.contactId || !payment.linkUrl) return;

  await enqueueJob({
    businessId,
    jobType: "automation.send",
    dedupeKey,
    payload: {
      kind: "PAYMENT_LINK",
      contactId: payment.contactId,
      // A person pressed Send, so it goes even if the owner hasn't switched
      // the automated version on.
      manual: true,
      variables: {
        description: payment.description,
        amount: formatMinor(payment.amount, payment.currency),
        payment_link: payment.linkUrl,
      },
    },
  });
}

/**
 * "Send it again". A link that can still be paid is re-sent as it is; one
 * that expired, failed or was cancelled is replaced by a fresh link for the
 * same amount, remembering which it replaced.
 */
export async function resendPayment(
  businessId: string,
  paymentId: string,
  userId: string | null,
): Promise<ProviderResult<{ id: string; fresh: boolean }>> {
  const payment = await db.payment.findFirst({
    where: { id: paymentId, businessId },
    select: {
      id: true,
      status: true,
      provider: true,
      contactId: true,
      amount: true,
      currency: true,
      description: true,
      reference: true,
      orderId: true,
      createdAt: true,
    },
  });

  if (!payment) return { ok: false, message: "That payment doesn't exist." };
  if (!payment.contactId) return { ok: false, message: "That payment's contact was deleted." };

  if (payment.status === "PAID" || payment.status === "REFUNDED" || payment.status === "PARTIALLY_REFUNDED") {
    return { ok: false, message: "That's already been paid." };
  }

  // Stripe links die after 24 hours whether or not the webhook said so.
  const stale = payment.provider === "STRIPE" && Date.now() - payment.createdAt.getTime() > 23 * 60 * 60_000;

  if (payment.status === "CREATED" && !stale) {
    await queueLinkMessage(businessId, payment.id, `payments:PAYMENT_LINK:${payment.id}:${Date.now()}`);

    return { ok: true, value: { id: payment.id, fresh: false } };
  }

  const created = await createPaymentLink({
    businessId,
    contactId: payment.contactId,
    provider: payment.provider,
    amount: payment.amount,
    currency: payment.currency,
    description: payment.description,
    reference: payment.reference,
    orderId: payment.orderId,
    createdById: userId,
    retryOfId: payment.id,
  });

  if (!created.ok) return created;

  if (payment.status === "CREATED") {
    await db.payment.updateMany({ where: { id: payment.id, status: "CREATED" }, data: { status: "EXPIRED" } });
  }

  return { ok: true, value: { id: created.value.id, fresh: true } };
}

// ─── What the provider told us ──────────────────────────────────────────────

export function readProviderEvent(provider: PaymentProvider, body: unknown): PaymentEvent {
  return provider === "RAZORPAY" ? readRazorpayEvent(body) : readStripeEvent(body);
}

/**
 * Moves one payment forward from a provider's event. The `payments.webhook`
 * job calls this with the account the webhook arrived on, which fixes the
 * business — nothing in the event body can point it elsewhere.
 */
export async function applyPaymentEvent(
  account: { businessId: string; provider: PaymentProvider },
  event: PaymentEvent,
): Promise<string> {
  if (event.kind === "ignored") return event.reason;

  const { businessId, provider } = account;

  if (event.kind === "refunded") {
    const payment = await db.payment.findFirst({
      where: { businessId, provider, providerPaymentId: event.providerPaymentId },
      select: { id: true, amount: true, refundedAmount: true, currency: true, description: true, contactId: true },
    });

    if (!payment) return "refund for a payment we didn't create";

    const total = Math.min(payment.amount, event.refundedTotal ?? payment.refundedAmount + event.refundAmount);

    if (total <= payment.refundedAmount) return "refund already recorded";

    await db.payment.update({
      where: { id: payment.id },
      data: {
        refundedAmount: total,
        refundedAt: new Date(),
        status: total >= payment.amount ? "REFUNDED" : "PARTIALLY_REFUNDED",
      },
    });

    if (payment.contactId) {
      await refreshContactTotals(payment.contactId);
      await queueOutcome(businessId, payment.contactId, "REFUND_CONFIRMED", `${payment.id}:${total}`, {
        description: payment.description,
        amount: formatMinor(total - payment.refundedAmount, payment.currency),
      });
    }

    return "refund recorded";
  }

  const payment = await findPayment(businessId, provider, event.linkId, event.reference);

  if (!payment) return "event for a link we didn't create";

  const variables = {
    description: payment.description,
    amount: formatMinor(payment.amount, payment.currency),
  };

  if (event.kind === "paid") {
    const now = new Date();
    const moved = await db.payment.updateMany({
      where: { id: payment.id, status: { in: ["CREATED", "FAILED", "EXPIRED"] } },
      data: {
        status: "PAID",
        paidAt: now,
        ...(event.providerPaymentId ? { providerPaymentId: event.providerPaymentId } : {}),
      },
    });

    if (moved.count === 0) return "already paid";

    if (payment.orderId) {
      await db.order.updateMany({
        where: { id: payment.orderId, businessId, status: "PENDING" },
        data: { status: "PAID", paidAt: now },
      });
    }

    if (payment.contactId) {
      await refreshContactTotals(payment.contactId);
      await evaluateRulesForContact(businessId, payment.contactId);
      await queueOutcome(businessId, payment.contactId, "PAYMENT_RECEIPT", payment.id, {
        ...variables,
        receipt_url: `${publicAppUrl()}/receipts/${payment.receiptToken}`,
      });
    }

    return "marked paid";
  }

  if (event.kind === "failed") {
    // The link stays payable after a failed attempt, so the same link is
    // offered again — once, however many attempts fail.
    await db.payment.updateMany({
      where: { id: payment.id, status: "CREATED" },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        ...(event.providerPaymentId ? { providerPaymentId: event.providerPaymentId } : {}),
      },
    });

    if (payment.contactId && payment.linkUrl && (payment.status === "CREATED" || payment.status === "FAILED")) {
      await queueOutcome(businessId, payment.contactId, "PAYMENT_RETRY", payment.id, {
        ...variables,
        payment_link: payment.linkUrl,
      });
    }

    return "marked failed";
  }

  const moved = await db.payment.updateMany({
    where: { id: payment.id, status: { in: ["CREATED", "FAILED"] } },
    data: { status: event.kind === "expired" ? "EXPIRED" : "CANCELLED" },
  });

  return moved.count ? `marked ${event.kind}` : "no change";
}

async function findPayment(
  businessId: string,
  provider: PaymentProvider,
  linkId: string | null,
  reference: string | null,
) {
  const select = {
    id: true,
    status: true,
    amount: true,
    currency: true,
    description: true,
    contactId: true,
    orderId: true,
    linkUrl: true,
    receiptToken: true,
  } as const;

  if (reference) {
    const byReference = await db.payment.findFirst({ where: { id: reference, businessId, provider }, select });

    if (byReference) return byReference;
  }

  if (linkId) return db.payment.findFirst({ where: { businessId, provider, providerLinkId: linkId }, select });

  return null;
}

async function queueOutcome(
  businessId: string,
  contactId: string,
  kind: "PAYMENT_RECEIPT" | "PAYMENT_RETRY" | "REFUND_CONFIRMED",
  key: string,
  variables: Record<string, string>,
) {
  await enqueueJob({
    businessId,
    jobType: "automation.send",
    dedupeKey: `payments:${kind}:${key}`,
    payload: { kind, contactId, variables },
  });
}

// A business's OWN Razorpay account: payment links for its customers.
//
// Not ChatWise's subscription billing — that is lib/razorpay.ts, on the
// platform's account, and the two never share keys or code paths
// (docs/Rules.md §1). Everything here uses keys the business pasted into
// Integrations, decrypted only for the length of one call and never logged.
//
// Plain HTTPS with basic auth, no SDK, same as every other provider here.
//
// Relative .ts imports: the job runner on the always-on host uses this.

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { PaymentEvent, ProviderResult } from "./types.ts";

const BASE = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 15_000;

export type RazorpayKeys = { keyId: string; keySecret: string };


async function call<T>(keys: RazorpayKeys, path: string, init: { method?: string; body?: unknown } = {}): Promise<ProviderResult<T>> {
  let response: Response;

  try {
    response = await fetch(`${BASE}/${path}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, message: "Razorpay didn't answer. Please try again." };
  }

  if (response.status === 401) {
    return { ok: false, message: "Razorpay didn't accept those keys. Check the Key ID and Key Secret." };
  }

  const body = (await response.json().catch(() => null)) as (T & { error?: { description?: string } }) | null;

  if (!response.ok || !body) {
    console.error(`[payments/razorpay] ${path.split("?")[0]} returned ${response.status}`);

    // Razorpay's description is written for a merchant ("amount must be at
    // least INR 1.00"), and says nothing about the customer.
    return { ok: false, message: body?.error?.description ?? "Razorpay couldn't do that right now." };
  }

  return { ok: true, value: body };
}

/** Checks a pair of keys works before we store them. */
export async function verifyRazorpayKeys(keys: RazorpayKeys): Promise<ProviderResult<true>> {
  const result = await call<unknown>(keys, "payment_links?count=1");

  return result.ok ? { ok: true, value: true } : result;
}

export async function createRazorpayLink(
  keys: RazorpayKeys,
  input: {
    amount: number;
    currency: string;
    description: string;
    reference: string;
    customer: { name: string | null; phone: string; email: string | null };
    callbackUrl: string;
    expiresAt: Date;
  },
): Promise<ProviderResult<{ id: string; url: string }>> {
  const result = await call<{ id: string; short_url: string }>(keys, "payment_links", {
    method: "POST",
    body: {
      amount: input.amount,
      currency: input.currency,
      description: input.description.slice(0, 2048),
      // Our own payment id, so an event can be matched even without the link id.
      reference_id: input.reference.slice(0, 40),
      expire_by: Math.floor(input.expiresAt.getTime() / 1000),
      customer: {
        ...(input.customer.name ? { name: input.customer.name } : {}),
        contact: `+${input.customer.phone}`,
        ...(input.customer.email ? { email: input.customer.email } : {}),
      },
      // We send the link on WhatsApp ourselves.
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: { chatwise_payment_id: input.reference },
      callback_url: input.callbackUrl,
      callback_method: "get",
    },
  });

  if (!result.ok) return result;

  return { ok: true, value: { id: result.value.id, url: result.value.short_url } };
}

/** Razorpay signs the raw body with the webhook secret the business chose. */
export function verifyRazorpayWebhook(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;

  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const given = Buffer.from(signature);

  return expected.length === given.length && timingSafeEqual(expected, given);
}

type RazorpayWebhook = {
  event?: string;
  payload?: {
    payment_link?: { entity?: { id?: string; reference_id?: string; notes?: Record<string, string> } };
    payment?: { entity?: { id?: string; notes?: Record<string, string> | unknown[]; amount_refunded?: number } };
    refund?: { entity?: { payment_id?: string; amount?: number } };
  };
};

export function readRazorpayEvent(body: unknown): PaymentEvent {
  const event = body as RazorpayWebhook;
  const link = event.payload?.payment_link?.entity;
  const payment = event.payload?.payment?.entity;
  const linkId = link?.id ?? null;
  // Notes arrive as {} when set and [] when empty.
  const paymentNotes = payment?.notes && !Array.isArray(payment.notes) ? (payment.notes as Record<string, string>) : {};
  const reference = link?.reference_id ?? link?.notes?.chatwise_payment_id ?? paymentNotes.chatwise_payment_id ?? null;

  switch (event.event) {
    case "payment_link.paid":
      return { kind: "paid", linkId, reference, providerPaymentId: payment?.id ?? null };
    case "payment_link.expired":
      return { kind: "expired", linkId, reference };
    case "payment_link.cancelled":
      return { kind: "cancelled", linkId, reference };
    case "payment.failed":
      return { kind: "failed", linkId, reference, providerPaymentId: payment?.id ?? null };
    case "refund.processed": {
      const refund = event.payload?.refund?.entity;

      if (!refund?.payment_id || !refund.amount) return { kind: "ignored", reason: "refund without a payment" };

      return {
        kind: "refunded",
        providerPaymentId: refund.payment_id,
        refundedTotal: payment?.amount_refunded ?? null,
        refundAmount: refund.amount,
      };
    }
    default:
      return { kind: "ignored", reason: `event ${event.event ?? "unknown"}` };
  }
}

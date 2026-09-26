// A business's OWN Stripe account: payment links for its customers.
//
// Stripe is allowed here and only here — for merchants taking payment from
// their customers. ChatWise's own billing is Razorpay (docs/Rules.md §1).
//
// Each link is a Stripe Checkout Session: a hosted page, so no card details
// ever reach ChatWise. Stripe caps a session at 24 hours; an expired one is
// re-sent from the Payments screen as a fresh link.
//
// Plain HTTPS, form-encoded as Stripe's API expects, no SDK.
//
// Relative .ts imports: the job runner on the always-on host uses this.

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { PaymentEvent, ProviderResult } from "./types.ts";

const BASE = "https://api.stripe.com/v1";
const TIMEOUT_MS = 15_000;
/** How old a signed webhook may be before it is treated as a replay. */
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

async function call<T>(
  secretKey: string,
  path: string,
  init: { method?: string; form?: Record<string, string> } = {},
): Promise<ProviderResult<T>> {
  let response: Response;

  try {
    response = await fetch(`${BASE}/${path}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${secretKey}`,
        ...(init.form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      body: init.form ? new URLSearchParams(init.form).toString() : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, message: "Stripe didn't answer. Please try again." };
  }

  if (response.status === 401) {
    return { ok: false, message: "Stripe didn't accept that secret key." };
  }

  const body = (await response.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;

  if (!response.ok || !body) {
    console.error(`[payments/stripe] ${path.split("?")[0]} returned ${response.status}`);

    return { ok: false, message: body?.error?.message ?? "Stripe couldn't do that right now." };
  }

  return { ok: true, value: body };
}

export async function verifyStripeKey(secretKey: string): Promise<ProviderResult<true>> {
  if (!/^(sk|rk)_(test|live)_/.test(secretKey)) {
    return { ok: false, message: "That doesn't look like a Stripe secret key (it starts sk_live_ or sk_test_)." };
  }

  const result = await call<unknown>(secretKey, "balance");

  return result.ok ? { ok: true, value: true } : result;
}

export async function createStripeLink(
  secretKey: string,
  input: {
    amount: number;
    currency: string;
    description: string;
    reference: string;
    customerEmail: string | null;
    successUrl: string;
  },
): Promise<ProviderResult<{ id: string; url: string }>> {
  const result = await call<{ id: string; url: string }>(secretKey, "checkout/sessions", {
    method: "POST",
    form: {
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": input.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(input.amount),
      "line_items[0][price_data][product_data][name]": input.description.slice(0, 250),
      client_reference_id: input.reference,
      "metadata[chatwise_payment_id]": input.reference,
      // Copied onto the payment itself, so a failed attempt can be matched.
      "payment_intent_data[metadata][chatwise_payment_id]": input.reference,
      success_url: input.successUrl,
      cancel_url: input.successUrl,
      // As long as Stripe allows.
      expires_at: String(Math.floor(Date.now() / 1000) + 24 * 60 * 60 - 60),
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
    },
  });

  if (!result.ok) return result;

  return { ok: true, value: { id: result.value.id, url: result.value.url } };
}

/**
 * Checks the Stripe-Signature header: "t=<time>,v1=<hmac>", where the HMAC
 * covers "<time>.<raw body>". Old timestamps are refused so a captured
 * request can't be replayed later.
 */
export function verifyStripeWebhook(
  rawBody: string,
  header: string | null,
  secret: string,
  now: number = Date.now(),
): boolean {
  if (!header) return false;

  const parts = header.split(",").map((part) => part.split("=") as [string, string]);
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);

  if (!Number.isFinite(timestamp) || signatures.length === 0) return false;
  if (Math.abs(now / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex"));

  return signatures.some((signature) => {
    const given = Buffer.from(signature);

    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

type StripeEvent = {
  id?: string;
  type?: string;
  data?: {
    object?: {
      id?: string;
      payment_status?: string;
      payment_intent?: string | null;
      client_reference_id?: string | null;
      metadata?: Record<string, string>;
      amount_refunded?: number;
    };
  };
};

export function readStripeEvent(body: unknown): PaymentEvent {
  const event = body as StripeEvent;
  const object = event.data?.object;
  const reference = object?.metadata?.chatwise_payment_id ?? object?.client_reference_id ?? null;

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      // "completed" also fires for bank payments still clearing; those arrive
      // later as async_payment_succeeded.
      if (object?.payment_status !== "paid") return { kind: "ignored", reason: "not paid yet" };

      return { kind: "paid", linkId: object.id ?? null, reference, providerPaymentId: object.payment_intent ?? null };
    case "checkout.session.async_payment_failed":
      return { kind: "failed", linkId: object?.id ?? null, reference, providerPaymentId: object?.payment_intent ?? null };
    case "payment_intent.payment_failed":
      return { kind: "failed", linkId: null, reference, providerPaymentId: object?.id ?? null };
    case "checkout.session.expired":
      return { kind: "expired", linkId: object?.id ?? null, reference };
    case "charge.refunded":
      if (!object?.payment_intent) return { kind: "ignored", reason: "refund without a payment" };

      return {
        kind: "refunded",
        providerPaymentId: object.payment_intent,
        refundedTotal: object.amount_refunded ?? null,
        refundAmount: object.amount_refunded ?? 0,
      };
    default:
      return { kind: "ignored", reason: `event ${event.type ?? "unknown"}` };
  }
}

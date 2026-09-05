// The only file in ChatWise that talks to Razorpay.
//
// Everything else asks this file. Razorpay was chosen by the product owner on
// 2026-09-05, resolving the open question in docs/PRD.md §10 (the earlier plan
// documents said Stripe). Keeping every call in one place is what made that
// switch cheap, and it is what would make another one cheap.
//
// There is no Razorpay SDK here, on purpose. Their API is ordinary HTTPS with
// JSON bodies and basic authentication, and the app already calls Meta's Graph
// API the same way (whatsapp-connectors/business-api/graph-api.ts). A
// dependency is something the non-technical owner has to trust, so it has to
// buy more than a hundred lines (docs/Rules.md §1).
//
// Nothing here may ever run in the browser: the key secret is the key to the
// money (docs/Rules.md §3). Card details never reach ChatWise at all — the
// customer pays on Razorpay's own hosted page and comes back afterwards.

import { createHmac, timingSafeEqual } from "node:crypto";

import "server-only";

const RAZORPAY_BASE = "https://api.razorpay.com";

/** How long to wait on Razorpay before giving up. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Whether payments are switched on at all.
 *
 * Everything billing-related asks this first, and says so plainly when the
 * answer is no. An app with no Razorpay keys is not broken — it is an app whose
 * owner hasn't set up payments yet, and it should keep working (docs/Rules.md
 * §4). Nothing is gated by plan while this is false, because gating people out
 * of features they have no way to pay for would just be a bug.
 */
export function isBillingConfigured(): boolean {
  return Boolean(
    process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET,
  );
}

/** Whether incoming webhooks can be verified. Without this we refuse them. */
export function isWebhookConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);
}

/**
 * The Razorpay plan id for one of our plans, or null if it isn't set up yet.
 *
 * The ids live in the environment because they differ between the test and
 * live Razorpay accounts, and a test plan id shipped to production would take
 * real money for the wrong thing.
 */
export function razorpayPlanId(envVar: string | null): string | null {
  if (!envVar) return null;

  return process.env[envVar]?.trim() || null;
}

export type RazorpayResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/**
 * Calls Razorpay and turns whatever comes back into something the rest of the
 * app can act on.
 *
 * Razorpay's own error messages are written for developers and sometimes name
 * internal fields. The `message` returned here is shown to a customer, so it is
 * short and safe; the full response goes to the server log (docs/Rules.md §4).
 */
export async function razorpayRequest<T>(
  path: string,
  {
    method = "GET",
    body,
    query,
  }: {
    method?: "GET" | "POST" | "PATCH";
    body?: Record<string, unknown>;
    query?: Record<string, string | number>;
  } = {},
): Promise<RazorpayResult<T>> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return { ok: false, message: "Payments aren't set up on this account yet." };
  }

  const search = query
    ? `?${new URLSearchParams(
        Object.entries(query).map(([key, value]) => [key, String(value)]),
      )}`
    : "";

  // Basic authentication: the key id is the username, the secret the password.
  const authorization = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

  try {
    const response = await fetch(`${RAZORPAY_BASE}/${path}${search}`, {
      method,
      headers: {
        Authorization: authorization,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as
      | (T & { error?: { code?: string; description?: string } })
      | null;

    if (!response.ok) {
      console.error("[billing] Razorpay rejected a request", {
        path,
        status: response.status,
        code: payload?.error?.code,
      });

      return { ok: false, message: friendlyError(response.status) };
    }

    return { ok: true, data: payload as T };
  } catch (error) {
    console.error("[billing] could not reach Razorpay", error);

    return {
      ok: false,
      message:
        "We couldn't reach our payment provider just now. This is usually temporary — try again shortly.",
    };
  }
}

function friendlyError(status: number): string {
  if (status === 401) {
    return "Our payment settings were rejected. Please contact support — this is our end, not yours.";
  }

  if (status === 400) {
    return "That payment couldn't be set up. Check your details and try again, or contact support.";
  }

  if (status === 429) {
    return "Too many attempts just now. Wait a moment and try again.";
  }

  if (status >= 500) {
    return "Our payment provider is having trouble. Try again shortly.";
  }

  return "We couldn't complete that just now. Try again, or contact support if it keeps happening.";
}

// ─── The calls we actually make ─────────────────────────────────────────────

type RazorpayCustomer = { id: string };

export type RazorpaySubscription = {
  id: string;
  /** created | authenticated | active | pending | halted | cancelled | completed | expired */
  status: string;
  plan_id: string;
  /** Seconds since 1970 — Razorpay deals in Unix time throughout. */
  current_start: number | null;
  current_end: number | null;
  charge_at: number | null;
  /** The hosted page where the customer actually pays. */
  short_url: string | null;
  notes?: Record<string, string>;
};

/**
 * Creates the Razorpay customer that a business's payments hang off.
 *
 * `fail_existing: "0"` tells Razorpay to hand back the existing customer rather
 * than erroring if this email is already known — two customers for one business
 * would mean invoices split across two records.
 */
export async function createCustomer({
  businessId,
  email,
  name,
}: {
  businessId: string;
  email?: string | null;
  name?: string | null;
}): Promise<RazorpayResult<RazorpayCustomer>> {
  return razorpayRequest<RazorpayCustomer>("v1/customers", {
    method: "POST",
    body: {
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      fail_existing: "0",
      notes: { businessId },
    },
  });
}

/**
 * Starts a subscription and gets back the link where it is paid for.
 *
 * `total_count` is how many billing cycles Razorpay should charge before the
 * subscription simply ends. There is no "forever" — so this is set to a long
 * run of monthly cycles rather than to something that quietly stops in a year.
 */
export async function createSubscription({
  planId,
  customerId,
  businessId,
  totalCount = 120,
}: {
  planId: string;
  customerId: string;
  businessId: string;
  totalCount?: number;
}): Promise<RazorpayResult<RazorpaySubscription>> {
  return razorpayRequest<RazorpaySubscription>("v1/subscriptions", {
    method: "POST",
    body: {
      plan_id: planId,
      customer_id: customerId,
      total_count: totalCount,
      // Let Razorpay send its own payment reminders — it knows when a card
      // failed before we do.
      customer_notify: 1,
      // Stamped on the subscription so a webhook can always be traced back to
      // an account, even if our own id lookup ever misses.
      notes: { businessId },
    },
  });
}

/** One subscription, read fresh from Razorpay. */
export async function readSubscription(
  subscriptionId: string,
): Promise<RazorpayResult<RazorpaySubscription>> {
  return razorpayRequest<RazorpaySubscription>(
    `v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
}

/**
 * Moves a subscription onto a different plan.
 *
 * Upgrades take effect straight away; downgrades wait for the end of the period
 * already paid for, which is why `schedule_change_at` is a parameter rather
 * than a constant. Razorpay handles the proration.
 *
 * ⚠️ Worth verifying against Razorpay's current documentation the first time
 * this runs for real: their subscription-update endpoint is the one call here
 * whose exact shape has changed between API versions. A rejection surfaces as a
 * plain error rather than a silent no-op, so a mistake here is visible.
 */
export async function changeSubscriptionPlan({
  subscriptionId,
  planId,
  applyImmediately,
}: {
  subscriptionId: string;
  planId: string;
  applyImmediately: boolean;
}): Promise<RazorpayResult<RazorpaySubscription>> {
  return razorpayRequest<RazorpaySubscription>(
    `v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "PATCH",
      body: {
        plan_id: planId,
        schedule_change_at: applyImmediately ? "now" : "cycle_end",
        customer_notify: 1,
      },
    },
  );
}

/**
 * Cancels a subscription.
 *
 * Defaults to the end of the period already paid for. Somebody who cancels on
 * the 3rd has paid for the month, and taking the product away that afternoon
 * would be taking something they bought.
 */
export async function cancelSubscription({
  subscriptionId,
  atCycleEnd = true,
}: {
  subscriptionId: string;
  atCycleEnd?: boolean;
}): Promise<RazorpayResult<RazorpaySubscription>> {
  return razorpayRequest<RazorpaySubscription>(
    `v1/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    { method: "POST", body: { cancel_at_cycle_end: atCycleEnd ? 1 : 0 } },
  );
}

export type RazorpayInvoice = {
  id: string;
  status: string | null;
  /** Paise, not rupees. Razorpay deals in the smallest unit throughout. */
  amount: number;
  amount_paid: number;
  currency: string;
  /** Seconds since 1970. */
  issued_at: number | null;
  created_at: number;
  /** Where the customer can view and download it. */
  short_url: string | null;
};

/** The account's recent invoices, read live from Razorpay rather than copied. */
export async function listInvoices(
  subscriptionId: string,
  count = 12,
): Promise<RazorpayResult<{ items: RazorpayInvoice[] }>> {
  return razorpayRequest<{ items: RazorpayInvoice[] }>("v1/invoices", {
    query: { subscription_id: subscriptionId, count },
  });
}

// ─── Checking that a webhook really came from Razorpay ──────────────────────

/**
 * Verifies the signature Razorpay puts on every webhook.
 *
 * `X-Razorpay-Signature` is an HMAC-SHA256 of the **raw request body**, keyed
 * with the webhook secret. The exact bytes have to be hashed — a re-serialised
 * copy of the parsed JSON can differ in whitespace or key order and would fail
 * an otherwise valid signature.
 *
 * This is the same shape of check as the Meta webhook in
 * whatsapp-connectors/business-api/webhook-handler.ts, for the same reason: the
 * endpoint is public, so it has to defend itself.
 */
export function isWebhookSignatureValid(
  rawBody: string,
  header: string | null,
  secret: string,
): boolean {
  if (!secret || !header) return false;

  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  return constantTimeEquals(header.trim(), expected);
}

/** Compares without leaking, through timing, how much of a value was right. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}

/** Razorpay's Unix seconds as a Date, or null when it isn't there. */
export function fromUnixSeconds(value: number | null | undefined): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  return new Date(value * 1000);
}

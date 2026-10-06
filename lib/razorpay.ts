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
//
// Billing model: Each month is a separate Razorpay Order, not a recurring
// subscription. The app creates an order for the plan price plus any add-ons,
// sends the customer to Razorpay's hosted page, and updates the database when
// the order.paid webhook arrives. This gives us full control over pricing,
// add-ons, and billing cycles without needing Razorpay Plans.

import { createHmac, timingSafeEqual } from "node:crypto";

import "server-only";

const RAZORPAY_BASE = "https://api.razorpay.com";

/** How long to wait on Razorpay before giving up. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Whether payments are switched on at all.
 */
export function isBillingConfigured(): boolean {
  return Boolean(
    process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET,
  );
}

/** Whether incoming webhooks can be verified. */
export function isWebhookConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);
}

export type RazorpayResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/**
 * Calls Razorpay and turns whatever comes back into something the rest of the
 * app can act on.
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

// ─── Order API ───────────────────────────────────────────────────────────────

export type RazorpayOrder = {
  id: string;
  amount: number; // in paise
  currency: string;
  receipt: string;
  short_url: string | null;
  status: string;
};

/**
 * Creates a Razorpay Order for one billing cycle.
 *
 * The order is for a fixed amount (plan price + active add-ons) and is paid
 * once per month. We create a new order each cycle rather than using
 * Razorpay's native subscription/recurring billing because that requires
 * Plan objects in the Razorpay dashboard, and we want the pricing to live
 * entirely in our code (lib/plans.ts).
 */
export async function createBillingOrder({
  amountInRupees,
  receipt,
  businessId,
}: {
  amountInRupees: number;
  receipt: string;
  businessId: string;
}): Promise<RazorpayResult<RazorpayOrder>> {
  return razorpayRequest<RazorpayOrder>("v1/orders", {
    method: "POST",
    body: {
      amount: amountInRupees * 100, // Convert rupees to paise
      currency: "INR",
      receipt,
      notes: { businessId },
    },
  });
}

// ─── Customer API ────────────────────────────────────────────────────────────

type RazorpayCustomer = {
  id: string;
};

/**
 * Creates or finds a Razorpay customer for this business.
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

// ─── Webhook Verification ───────────────────────────────────────────────────

/**
 * Verifies the signature Razorpay puts on every webhook.
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

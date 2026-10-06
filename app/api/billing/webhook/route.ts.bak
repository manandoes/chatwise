// What Razorpay tells us about money.
//
// This is the second part of ChatWise the public internet can reach without
// logging in (the first is each customer's WhatsApp webhook), which makes it
// the second part that has to be most careful. Anyone can POST here; only
// somebody holding the webhook secret can sign a request correctly.
//
// It is also the only path by which an account becomes entitled to a paid plan.
// Nothing else grants anything — not the checkout page, not the button that
// opens it — because the only trustworthy news that money arrived comes from
// the company that took it.

import {
  isWebhookConfigured,
  isWebhookSignatureValid,
  type RazorpaySubscription,
} from "@/lib/razorpay";
import {
  applySubscriptionEvent,
  claimBillingEvent,
} from "@/lib/subscription";
import { db } from "@/lib/db";

/**
 * The same answer for every refusal.
 *
 * Somebody probing this shouldn't be able to tell a bad signature from a
 * missing one, or learn how close a guess was.
 */
function refuse() {
  return new Response("Forbidden", { status: 403 });
}

type WebhookBody = {
  event?: string;
  payload?: { subscription?: { entity?: RazorpaySubscription } };
};

export async function POST(request: Request) {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!isWebhookConfigured() || !secret) {
      // No secret means no way to tell a real event from a made-up one, and an
      // unverifiable event about money is refused rather than trusted.
      console.error("[billing] RAZORPAY_WEBHOOK_SECRET is not set");

      return refuse();
    }

    // The raw bytes, before any parsing: the signature covers exactly what was
    // sent, and re-serialising parsed JSON would change them.
    const rawBody = await request.text();

    if (
      !isWebhookSignatureValid(
        rawBody,
        request.headers.get("x-razorpay-signature"),
        secret,
      )
    ) {
      return refuse();
    }

    let body: WebhookBody;

    try {
      body = JSON.parse(rawBody) as WebhookBody;
    } catch {
      // Signed but unreadable. Accept it so Razorpay stops retrying, and log it
      // — a signed payload we cannot parse is our bug, not theirs.
      console.error("[billing] a signed webhook could not be read");

      return ok();
    }

    const eventType = body.event ?? "unknown";
    const eventId = request.headers.get("x-razorpay-event-id");

    // Already dealt with. Razorpay re-sends until it gets a 200, and can send
    // the same event twice regardless.
    if (eventId) {
      const seen = await db.billingEvent.findUnique({ where: { id: eventId } });

      if (seen) return ok();
    }

    // Only subscription events change what an account may do. Payment and
    // invoice events are Razorpay's own record-keeping, and the subscription
    // event that follows them is what actually matters here.
    if (!eventType.startsWith("subscription.")) return ok();

    const entity = body.payload?.subscription?.entity;

    if (!entity?.id || !entity.status) {
      console.warn(`[billing] ${eventType} arrived with no subscription in it`);

      return ok();
    }

    const applied = await applySubscriptionEvent(entity);

    if (!applied.applied) {
      // Not an error: Razorpay test mode and a shared account both produce
      // events about subscriptions this installation has never heard of.
      console.warn(`[billing] ignored ${eventType} — ${applied.reason}`);
    } else {
      console.info(
        `[billing] ${eventType} → ${applied.status} for business ${applied.businessId}`,
      );
    }

    if (eventId) {
      await claimBillingEvent({
        id: eventId,
        type: eventType,
        businessId: applied.applied ? applied.businessId : null,
      });
    }

    return ok();
  } catch (error) {
    console.error("[billing] webhook failed", error);

    // Answered 200 on purpose. A retry storm from Razorpay would not fix a bug
    // at our end, and the failure is in the log where it belongs. The account's
    // real state is still readable from Razorpay whenever the bug is fixed.
    return ok();
  }
}

function ok() {
  return new Response("OK", { status: 200 });
}

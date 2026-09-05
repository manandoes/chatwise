// Starting, changing and cancelling the account's subscription.
//
// The screens never talk to Razorpay directly — they ask here, and this route
// asks lib/subscription.ts. The key secret stays on the server, and so does
// every decision about what a plan entitles somebody to (docs/Rules.md §3).

import { apiError, unexpectedError } from "@/lib/api-response";
import { getApiUser, requireApiBusiness } from "@/lib/auth";
import { isPlanId } from "@/lib/plans";
import { takeFromBudget } from "@/lib/rate-limit";
import { isBillingConfigured } from "@/lib/razorpay";
import { cancelPlan, startSubscription } from "@/lib/subscription";

/** Start a plan, or move to a different one. */
export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    if (!isBillingConfigured()) {
      return apiError(
        "Payments aren't switched on yet, so there's nothing to buy. Everything you already have keeps working.",
        "NOT_AUTHORIZED",
        503,
      );
    }

    // Every attempt reaches Razorpay, and a subscription is created there
    // before anybody pays for it (lib/rate-limit.ts).
    const budget = await takeFromBudget("billing", found.businessId);

    if (!budget.allowed) {
      return apiError(budget.message, "RATE_LIMITED", 429);
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    const plan = body?.plan;

    if (!isPlanId(plan)) {
      return apiError("Choose a plan first.", "VALIDATION_FAILED", 400, {
        plan: "Pick one of the plans.",
      });
    }

    // Razorpay likes a name and email on the customer it creates, and this is
    // the only place we have them. Read from the session, never from the
    // request — a caller could otherwise put somebody else's address on their
    // own receipts (docs/Rules.md §3).
    const user = await getApiUser();

    const started = await startSubscription({
      businessId: found.businessId,
      planId: plan,
      email: user?.email,
      name: user?.name,
    });

    if (!started.ok) {
      return apiError(started.message, "VALIDATION_FAILED", 400);
    }

    // An empty pay link means there was nothing to pay right now — a plan
    // change Razorpay settles on the next invoice. The screen refreshes instead
    // of sending the customer to a payment page.
    return Response.json({
      payUrl: started.payUrl || null,
      changed: !started.payUrl,
    });
  } catch (error) {
    return unexpectedError("billing/subscription", error);
  }
}

/** Cancel, at the end of the period already paid for. */
export async function DELETE() {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    if (!isBillingConfigured()) {
      return apiError(
        "Payments aren't switched on yet, so there's nothing to cancel.",
        "NOT_AUTHORIZED",
        503,
      );
    }

    const cancelled = await cancelPlan(found.businessId);

    if (!cancelled.ok) {
      return apiError(cancelled.message, "VALIDATION_FAILED", 400);
    }

    return Response.json({
      cancelled: true,
      endsAt: cancelled.endsAt?.toISOString() ?? null,
    });
  } catch (error) {
    return unexpectedError("billing/subscription/cancel", error);
  }
}

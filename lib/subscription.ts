// Which plan an account is on, and how that changes.
//
// One row per business (prisma/schema.prisma → Subscription). This file is the
// only thing that writes it: the billing screen, the API routes and the webhook
// all come through here, so there is exactly one place where "what plan is this
// account on?" is answered.
//
// The important idea: **Razorpay owns the truth about money, we own the truth
// about entitlement.** Razorpay says whether a payment went through; this file
// turns that into "may this account use the official WhatsApp API, and how many
// messages may it send". Those are our rules, and they live in lib/plans.ts.

import "server-only";

import { db } from "./db.ts";
import {
  FREE_PLAN,
  PLANS,
  planFor,
  type Plan,
  type PlanIdValue,
} from "./plans.ts";
import {
  cancelSubscription as cancelAtRazorpay,
  changeSubscriptionPlan,
  createCustomer,
  createSubscription,
  fromUnixSeconds,
  isBillingConfigured,
  listInvoices,
  razorpayPlanId,
  type RazorpaySubscription,
} from "./razorpay.ts";

/** Mirrors the SubscriptionStatus enum in prisma/schema.prisma. */
export type SubscriptionStatusValue =
  | "NONE"
  | "INCOMPLETE"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED";

export type AccountPlan = {
  /** What the account may actually do right now. */
  plan: Plan;
  status: SubscriptionStatusValue;
  /** The plan they are paying for, which is not always the one in force. */
  subscribedPlan: Plan;
  /** True once a cancellation is waiting for the paid period to run out. */
  cancelAtPeriodEnd: boolean;
  /** Set when a downgrade takes effect at the end of the period. */
  pendingPlan: Plan | null;
  periodStart: Date;
  periodEnd: Date | null;
  hasRazorpaySubscription: boolean;
  /**
   * Whether payments are switched on for this installation at all.
   *
   * When false, **nothing is gated**. Holding someone to the free plan's limits
   * when there is no way to pay for a bigger one would just be a bug wearing a
   * business rule's clothes.
   */
  billingIsLive: boolean;
};

/**
 * A failed payment does not take the product away on the spot.
 *
 * Razorpay retries a card for days before giving up, and a business whose card
 * expired should get a warning in the dashboard, not a silently disabled agent
 * mid-conversation. `CANCELED` is where the plan actually reverts.
 */
const STATUSES_THAT_ENTITLE: SubscriptionStatusValue[] = ["ACTIVE", "PAST_DUE"];

/** The account's plan, and everything the billing screen needs to explain it. */
export async function readAccountPlan(
  businessId: string,
): Promise<AccountPlan> {
  const row = await db.subscription.findUnique({ where: { businessId } });

  const billingIsLive = isBillingConfigured();
  const subscribedPlan = planFor(row?.plan);
  const status = (row?.status ?? "NONE") as SubscriptionStatusValue;

  // Everything above this line is a fact. This is the judgement: an account is
  // on the plan it is paying for, and on the free plan otherwise.
  const inForce =
    !billingIsLive || STATUSES_THAT_ENTITLE.includes(status)
      ? subscribedPlan
      : FREE_PLAN;

  return {
    plan: billingIsLive ? inForce : subscribedPlan,
    status,
    subscribedPlan,
    cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
    pendingPlan: row?.pendingPlan ? planFor(row.pendingPlan) : null,
    periodStart: row?.currentPeriodStart ?? startOfThisMonth(),
    periodEnd: row?.currentPeriodEnd ?? null,
    hasRazorpaySubscription: Boolean(row?.razorpaySubscriptionId),
    billingIsLive,
  };
}

/**
 * The first day of the current calendar month, in UTC.
 *
 * Used to count usage for accounts with no paid period to count against — a
 * free account still needs a month to measure against, and "since the 1st" is
 * what anybody would assume.
 */
export function startOfThisMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Makes sure the account has a subscription row, and hands it back. */
export async function ensureSubscription(businessId: string) {
  const existing = await db.subscription.findUnique({ where: { businessId } });

  if (existing) return existing;

  try {
    return await db.subscription.create({ data: { businessId } });
  } catch {
    // Two tabs opening billing at once both try this; the unique index on
    // businessId means only one wins and the loser reads the winner's row.
    return db.subscription.findUniqueOrThrow({ where: { businessId } });
  }
}

export type StartResult =
  | { ok: true; payUrl: string }
  | { ok: false; message: string };

/**
 * Starts a paid subscription and returns the link where it is paid for.
 *
 * Nothing is granted here. The account keeps whatever plan it had until
 * Razorpay tells us — by webhook — that the money actually arrived. Granting on
 * the way *into* a payment page is how accounts end up entitled to things
 * nobody paid for.
 */
export async function startSubscription({
  businessId,
  planId,
  email,
  name,
}: {
  businessId: string;
  planId: PlanIdValue;
  email?: string | null;
  name?: string | null;
}): Promise<StartResult> {
  const plan = planFor(planId);

  if (plan.id === "FREE") {
    return {
      ok: false,
      message: "The free plan doesn't need paying for — you're already on it.",
    };
  }

  const razorpayPlan = razorpayPlanId(plan.razorpayPlanIdEnvVar);

  if (!razorpayPlan) {
    console.error(
      `[billing] ${plan.razorpayPlanIdEnvVar} is not set, so ${plan.name} cannot be bought`,
    );

    return {
      ok: false,
      message:
        "That plan isn't available to buy just yet. Please contact support.",
    };
  }

  const current = await ensureSubscription(businessId);

  // Already paying for something: move the existing subscription rather than
  // starting a second one, which would charge the card twice.
  if (current.razorpaySubscriptionId && current.status === "ACTIVE") {
    return changePlan({ businessId, planId });
  }

  let customerId = current.razorpayCustomerId;

  if (!customerId) {
    const customer = await createCustomer({ businessId, email, name });

    if (!customer.ok) return { ok: false, message: customer.message };

    customerId = customer.data.id;

    await db.subscription.update({
      where: { businessId },
      data: { razorpayCustomerId: customerId },
    });
  }

  const created = await createSubscription({
    planId: razorpayPlan,
    customerId,
    businessId,
  });

  if (!created.ok) return { ok: false, message: created.message };

  if (!created.data.short_url) {
    console.error("[billing] Razorpay returned a subscription with no pay link");

    return {
      ok: false,
      message: "We couldn't open the payment page. Try again in a moment.",
    };
  }

  await db.subscription.update({
    where: { businessId },
    data: {
      razorpaySubscriptionId: created.data.id,
      // Recorded as "waiting for payment", not as bought.
      status: "INCOMPLETE",
      pendingPlan: plan.id,
    },
  });

  return { ok: true, payUrl: created.data.short_url };
}

/**
 * Moves an existing subscription to another plan.
 *
 * An upgrade takes effect straight away — somebody who pays more expects the
 * bigger limits now. A downgrade waits for the end of the period they have
 * already paid for, because taking capacity away from a month they bought would
 * be taking something they own.
 */
export async function changePlan({
  businessId,
  planId,
}: {
  businessId: string;
  planId: PlanIdValue;
}): Promise<StartResult> {
  const current = await ensureSubscription(businessId);
  const plan = planFor(planId);

  if (!current.razorpaySubscriptionId) {
    return {
      ok: false,
      message: "There's no subscription to change yet.",
    };
  }

  if (plan.id === current.plan) {
    return { ok: false, message: `You're already on ${plan.name}.` };
  }

  const razorpayPlan = razorpayPlanId(plan.razorpayPlanIdEnvVar);

  if (!razorpayPlan) {
    return {
      ok: false,
      message:
        "That plan isn't available to switch to just yet. Please contact support.",
    };
  }

  const isUpgrade =
    plan.monthlyPriceInRupees > planFor(current.plan).monthlyPriceInRupees;

  const changed = await changeSubscriptionPlan({
    subscriptionId: current.razorpaySubscriptionId,
    planId: razorpayPlan,
    applyImmediately: isUpgrade,
  });

  if (!changed.ok) return { ok: false, message: changed.message };

  await db.subscription.update({
    where: { businessId },
    data: isUpgrade
      ? { plan: plan.id, pendingPlan: null }
      : { pendingPlan: plan.id },
  });

  // Nothing to pay right now — Razorpay adjusts the next invoice — so the
  // customer goes back to the billing screen rather than to a payment page.
  return { ok: true, payUrl: "" };
}

export type CancelResult = { ok: true; endsAt: Date | null } | { ok: false; message: string };

/** Cancels at the end of the period already paid for. */
export async function cancelPlan(businessId: string): Promise<CancelResult> {
  const current = await ensureSubscription(businessId);

  if (!current.razorpaySubscriptionId) {
    return { ok: false, message: "There's no subscription to cancel." };
  }

  const cancelled = await cancelAtRazorpay({
    subscriptionId: current.razorpaySubscriptionId,
    atCycleEnd: true,
  });

  if (!cancelled.ok) return { ok: false, message: cancelled.message };

  const updated = await db.subscription.update({
    where: { businessId },
    data: { cancelAtPeriodEnd: true, pendingPlan: "FREE" },
  });

  return { ok: true, endsAt: updated.currentPeriodEnd };
}

// ─── What Razorpay tells us ─────────────────────────────────────────────────

/**
 * Turns Razorpay's subscription state into ours.
 *
 * Anything unrecognised counts as "not paid up". Razorpay can add a state at
 * any time, and the cautious direction to be wrong in is the one that asks
 * somebody to check their card, not the one that gives away a paid plan.
 */
export function toOurStatus(razorpayStatus: string): SubscriptionStatusValue {
  switch (razorpayStatus) {
    case "active":
      return "ACTIVE";
    case "created":
    case "authenticated":
      return "INCOMPLETE";
    case "pending":
    case "halted":
      return "PAST_DUE";
    case "cancelled":
    case "completed":
    case "expired":
      return "CANCELED";
    default:
      console.warn(`[billing] unknown Razorpay status "${razorpayStatus}"`);
      return "INCOMPLETE";
  }
}

/** Which of our plans a Razorpay plan id belongs to, if any. */
export function planForRazorpayPlanId(planId: string | null): Plan | null {
  if (!planId) return null;

  return (
    PLANS.find(
      (plan) =>
        plan.razorpayPlanIdEnvVar !== null &&
        razorpayPlanId(plan.razorpayPlanIdEnvVar) === planId,
    ) ?? null
  );
}

export type AppliedEvent =
  | { applied: true; businessId: string; status: SubscriptionStatusValue }
  | { applied: false; reason: string };

/**
 * Writes down what a Razorpay subscription event means for an account.
 *
 * Called only from the webhook, and only after the signature has been checked.
 * It is deliberately tolerant: an event about a subscription we have never
 * heard of is ignored rather than treated as an error, because Razorpay's test
 * mode and a shared account can both produce those.
 */
export async function applySubscriptionEvent(
  entity: RazorpaySubscription,
): Promise<AppliedEvent> {
  const existing = await db.subscription.findFirst({
    where: { razorpaySubscriptionId: entity.id },
  });

  // Fall back to the business id we stamped on the subscription when we created
  // it, for the window between creating it at Razorpay and saving its id here.
  const businessId = existing?.businessId ?? entity.notes?.businessId ?? null;

  if (!businessId) {
    return { applied: false, reason: "no account matches this subscription" };
  }

  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  });

  if (!business) {
    return { applied: false, reason: "that account no longer exists" };
  }

  const status = toOurStatus(entity.status);
  const plan = planForRazorpayPlanId(entity.plan_id);
  const periodStart = fromUnixSeconds(entity.current_start);
  const periodEnd = fromUnixSeconds(entity.current_end);

  // A cancelled or finished subscription drops the account back to free. Any
  // other state keeps whichever plan Razorpay says is being charged for.
  const planId: PlanIdValue =
    status === "CANCELED" ? "FREE" : (plan?.id ?? existing?.plan ?? "FREE");

  await db.subscription.upsert({
    where: { businessId },
    create: {
      businessId,
      plan: planId,
      status,
      razorpaySubscriptionId: entity.id,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
    update: {
      plan: planId,
      status,
      razorpaySubscriptionId: entity.id,
      ...(periodStart ? { currentPeriodStart: periodStart } : {}),
      ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
      // Whatever was pending has now happened, one way or the other.
      pendingPlan: null,
      ...(status === "CANCELED" ? { cancelAtPeriodEnd: false } : {}),
    },
  });

  return { applied: true, businessId, status };
}

/**
 * Records that an event has been dealt with, and says whether it is new.
 *
 * Razorpay re-sends an event until it gets a 200, and can send the same one
 * twice regardless. The id is the primary key, so the second insert fails and
 * the repeat is dropped — the same trick that stops a re-sent WhatsApp message
 * becoming a second reply.
 */
export async function claimBillingEvent({
  id,
  type,
  businessId,
}: {
  id: string;
  type: string;
  businessId?: string | null;
}): Promise<boolean> {
  try {
    await db.billingEvent.create({
      data: { id, type, businessId: businessId ?? null },
    });

    return true;
  } catch {
    return false;
  }
}

export type InvoiceLine = {
  id: string;
  /** Rupees, converted from the paise Razorpay deals in. */
  amountInRupees: number;
  status: string | null;
  issuedAt: Date | null;
  /** Where the customer can view and download it, on Razorpay's own site. */
  url: string | null;
};

/**
 * The account's invoices, read live from Razorpay each time.
 *
 * Deliberately not copied into our database. Razorpay is the one that issued
 * them, and a local copy could only ever be a second version of the same fact —
 * one that goes stale the moment a refund or a correction happens.
 *
 * An empty list is returned when there is nothing to fetch or Razorpay cannot
 * be reached: a billing screen that fails to load because an invoice list
 * timed out would be worse than one that quietly shows no invoices.
 */
export async function readInvoices(businessId: string): Promise<InvoiceLine[]> {
  if (!isBillingConfigured()) return [];

  const row = await db.subscription.findUnique({
    where: { businessId },
    select: { razorpaySubscriptionId: true },
  });

  if (!row?.razorpaySubscriptionId) return [];

  const result = await listInvoices(row.razorpaySubscriptionId);

  if (!result.ok) return [];

  return (result.data.items ?? []).map((invoice) => ({
    id: invoice.id,
    amountInRupees: Math.round((invoice.amount_paid || invoice.amount) / 100),
    status: invoice.status,
    issuedAt: fromUnixSeconds(invoice.issued_at ?? invoice.created_at),
    url: invoice.short_url,
  }));
}

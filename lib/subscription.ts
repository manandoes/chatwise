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
  NO_SUBSCRIPTION_PLAN,
  PLANS,
  planFor,
  type Plan,
  type PlanIdValue,
  ADDON_IDS,
  ADDON_PRICES,
  hasAddon,
} from "./plans.ts";
import {
  createBillingOrder,
  createCustomer,
  isBillingConfigured,
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
  /** Set when a downgrade is waiting for the current period to end. */
  pendingPlan: Plan | null;
  periodStart: Date;
  periodEnd: Date | null;
  hasRazorpaySubscription: boolean;
  billingIsLive: boolean;
  addons: Record<string, unknown>;
};

const STATUSES_THAT_ENTITLE: SubscriptionStatusValue[] = ["ACTIVE", "PAST_DUE"];

export async function readAccountPlan(businessId: string): Promise<AccountPlan> {
  const row = await db.subscription.findUnique({ where: { businessId } });
  const billingIsLive = isBillingConfigured();
  const subscribedPlan = planFor(row?.plan);
  const status = (row?.status ?? "NONE") as SubscriptionStatusValue;
  const inForce = !billingIsLive || STATUSES_THAT_ENTITLE.includes(status) ? subscribedPlan : NO_SUBSCRIPTION_PLAN;

  return {
    plan: billingIsLive ? inForce : subscribedPlan,
    status,
    subscribedPlan,
    cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
    pendingPlan: row?.pendingPlan ? planFor(row.pendingPlan) : null,
    periodStart: row?.currentPeriodStart ?? startOfThisMonth(),
    periodEnd: row?.currentPeriodEnd ?? null,
    hasRazorpaySubscription: Boolean(row?.razorpayOrderId),
    billingIsLive,
    addons: (row?.addons as Record<string, unknown> | null) ?? {},
  };
}

export function startOfThisMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function endOfThisMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

export async function ensureSubscription(businessId: string) {
  const existing = await db.subscription.findUnique({ where: { businessId } });
  if (existing) return existing;
  try {
    return await db.subscription.create({ data: { businessId } });
  } catch {
    return db.subscription.findUniqueOrThrow({ where: { businessId } });
  }
}

export type StartResult = { ok: true; payUrl: string } | { ok: false; message: string };

export async function startSubscription({ businessId, planId, email, name }: {
  businessId: string;
  planId: PlanIdValue;
  email?: string | null;
  name?: string | null;
}): Promise<StartResult> {
  const plan = planFor(planId);
  if (plan.id === "NONE") {
    return { ok: false, message: "That isn't a plan you can buy — pick Small Business or Enterprise." };
  }

  const current = await ensureSubscription(businessId);
  const addonTotal = (current.addons as Record<string, unknown> | null | undefined)
    ? ADDON_IDS.reduce((sum, id) => sum + (hasAddon(current.addons as Record<string, unknown>, id) ? ADDON_PRICES[id] : 0), 0)
    : 0;
  const totalAmount = plan.monthlyPriceInRupees + addonTotal;

  let customerId = current.razorpayCustomerId;
  if (!customerId) {
    const customer = await createCustomer({ businessId, email, name });
    if (!customer.ok) return { ok: false, message: customer.message };
    customerId = customer.data.id;
    await db.subscription.update({ where: { businessId }, data: { razorpayCustomerId: customerId } });
  }

  const receipt = `${businessId}-order-${Date.now()}`;
  const created = await createBillingOrder({ amountInRupees: totalAmount, receipt, businessId });
  if (!created.ok) return { ok: false, message: created.message };
  if (!created.data.short_url) {
    console.error("[billing] Razorpay returned an order with no pay link");
    return { ok: false, message: "We couldn't open the payment page. Try again in a moment." };
  }

  await db.subscription.upsert({
    where: { businessId },
    create: {
      businessId,
      plan: plan.id,
      status: "INCOMPLETE",
      razorpayCustomerId: customerId,
      razorpayOrderId: created.data.id,
      currentPeriodStart: startOfThisMonth(),
      currentPeriodEnd: endOfThisMonth(),
      pendingPlan: plan.id,
    },
    update: {
      razorpayOrderId: created.data.id,
      status: "INCOMPLETE",
      currentPeriodStart: startOfThisMonth(),
      currentPeriodEnd: endOfThisMonth(),
      pendingPlan: plan.id,
    },
  });

  return { ok: true, payUrl: created.data.short_url };
}

export async function changePlan({ businessId, planId }: {
  businessId: string;
  planId: PlanIdValue;
}): Promise<StartResult> {
  const current = await ensureSubscription(businessId);
  const plan = planFor(planId);

  if (!current.razorpayOrderId) return { ok: false, message: "There's no subscription to change yet." };
  if (plan.id === current.plan) return { ok: false, message: `You're already on ${plan.name}.` };

  const isUpgrade = plan.monthlyPriceInRupees > planFor(current.plan).monthlyPriceInRupees;
  const addonTotal = (current.addons as Record<string, unknown> | null | undefined)
    ? ADDON_IDS.reduce((sum, id) => sum + (hasAddon(current.addons as Record<string, unknown>, id) ? ADDON_PRICES[id] : 0), 0)
    : 0;
  const totalAmount = plan.monthlyPriceInRupees + addonTotal;

  const receipt = `${businessId}-order-${Date.now()}`;
  const created = await createBillingOrder({ amountInRupees: totalAmount, receipt, businessId });
  if (!created.ok) return { ok: false, message: created.message };

  await db.subscription.update({
    where: { businessId },
    data: {
      razorpayOrderId: created.data.id,
      plan: plan.id,
      ...(isUpgrade ? { pendingPlan: null, currentPeriodStart: new Date(), currentPeriodEnd: endOfThisMonth() } : { pendingPlan: plan.id }),
    },
  });

  if (isUpgrade) return { ok: true, payUrl: created.data.short_url ?? "" };
  return { ok: true, payUrl: "" };
}

export type CancelResult = { ok: true; endsAt: Date | null } | { ok: false; message: string };

export async function cancelPlan(businessId: string): Promise<CancelResult> {
  const current = await ensureSubscription(businessId);
  if (!current.razorpayOrderId) return { ok: false, message: "There's no subscription to cancel." };

  const updated = await db.subscription.update({
    where: { businessId },
    data: { cancelAtPeriodEnd: true, pendingPlan: "NONE" },
  });
  return { ok: true, endsAt: updated.currentPeriodEnd };
}

export async function applyOrderPaidEvent(orderId: string): Promise<{ applied: true; businessId: string; status: SubscriptionStatusValue } | { applied: false; reason: string }> {
  const existing = await db.subscription.findFirst({ where: { razorpayOrderId: orderId } });
  const businessId = existing?.businessId ?? null;

  if (!businessId) return { applied: false, reason: "no account matches this order" };

  const business = await db.business.findUnique({ where: { id: businessId }, select: { id: true } });
  if (!business) return { applied: false, reason: "that account no longer exists" };

  await db.subscription.update({
    where: { businessId },
    data: { status: "ACTIVE", pendingPlan: null, cancelAtPeriodEnd: false },
  });

  return { applied: true, businessId, status: "ACTIVE" };
}

export async function claimBillingEvent({ id, type, businessId }: { id: string; type: string; businessId?: string | null }): Promise<boolean> {
  try {
    await db.billingEvent.create({ data: { id, type, businessId: businessId ?? null } });
    return true;
  } catch {
    return false;
  }
}

export type InvoiceLine = { id: string; amountInRupees: number; status: string | null; issuedAt: Date | null; url: string | null };

export async function readInvoices(businessId: string): Promise<InvoiceLine[]> {
  if (!isBillingConfigured()) return [];
  const row = await db.subscription.findUnique({ where: { businessId }, select: { razorpayOrderId: true } });
  if (!row?.razorpayOrderId) return [];
  return [];
}

export function isActiveAddon(addons: Record<string, unknown>, id: string): boolean {
  return Boolean(addons[id]);
}
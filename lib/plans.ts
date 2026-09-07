// The two plans, as data.
//
// ⚠️ THE ONE FILE TO EDIT WHEN A PLAN CHANGES. ⚠️
//
// **There is one plan per connection tier, and nothing else.** No ladder of
// sizes, no upsell within a tier: a business is either a small one on the QR
// connection or a larger one on the official Business API, and that single
// choice is both its plan and the way its messages travel. Prices set by the
// product owner on 2026-09-05: ₹999 and ₹1,499 a month. **Both are paid — there
// is no free plan.** What each one *includes* was left to this codebase to
// decide, and the limits below are that decision: they are not something Meta,
// Razorpay or anyone else imposes. Every one of them is enforced by real code
// (see lib/usage.ts), so changing a number here changes the product,
// immediately and everywhere. Nothing else needs editing.
//
// **What the monthly price buys, and what it does not.** Both connections cost
// money, and they cost it in two different ways
// (whatsapp-connectors/capabilities.ts):
//
//   * On **Small Business** — the QR connection — the price below is the whole
//     bill. Nobody charges per message.
//   * On **Enterprise** — the WhatsApp Business API — the price below is *our*
//     share only. Meta bills per conversation, on top, directly to the
//     customer's own Meta account. We never see that money and we must never
//     quote it: the rates are Meta's, they differ by country and conversation
//     type, and putting a number on them here would be inventing a price
//     (docs/Rules.md §9). Say the charge exists, say who bills it, link to Meta,
//     and stop there.
//
// Two things worth understanding before changing anything:
//
//   * **`null` means no limit**, not "not decided". Every limit below is a
//     deliberate number.
//   * **The prices here are for display only.** What actually gets charged is
//     the plan set up in Razorpay and named by the environment variables below.
//     If the two ever disagree, Razorpay wins — it is the one taking the money.
//     Keep them in step.
//
// There is nothing server-only here on purpose: the pricing page and the
// billing screen render this list in the browser, and the API routes check the
// same values on the server. Same split as lib/onboarding-steps.ts and
// whatsapp-connectors/capabilities.ts.

/**
 * Mirrors the PlanId enum in prisma/schema.prisma.
 *
 * One value per connection tier, plus `NONE`. `NONE` is **not a plan anybody
 * can buy** — it is what the database calls an account with no live
 * subscription, and what a cancellation reverts to. Nothing sells it and
 * nothing shows it; `NO_SUBSCRIPTION_PLAN` below is what it grants, which is
 * nothing.
 */
export type PlanIdValue = "NONE" | "SMALL_BUSINESS" | "ENTERPRISE";

export const PLAN_IDS: PlanIdValue[] = [
  "NONE",
  "SMALL_BUSINESS",
  "ENTERPRISE",
];

export function isPlanId(value: unknown): value is PlanIdValue {
  return typeof value === "string" && (PLAN_IDS as string[]).includes(value);
}

/** How far back the dashboard will show, per plan. Matches lib/analytics.ts. */
export type HistoryWindow = "7d" | "30d" | "all";

export type Plan = {
  id: PlanIdValue;
  /** What the plan is called on screen. */
  name: string;
  /** One line on who it is for. */
  summary: string;

  /**
   * Rupees a month, paid to us.
   *
   * On the API plans this is not the customer's whole bill — Meta's
   * per-conversation charges sit on top of it and are billed by Meta. Use
   * `billingNote` rather than printing this figure bare, so that never gets
   * lost. Display only; see the note at the top of this file.
   */
  monthlyPriceInRupees: number;

  /**
   * The name of the environment variable holding this plan's Razorpay plan id.
   *
   * The id itself is never in the repo: it differs between the test and live
   * Razorpay accounts, so it belongs in the environment (docs/Rules.md §3).
   * Null only on the not-subscribed state, which is never bought.
   */
  razorpayPlanIdEnvVar: string | null;

  /**
   * How many messages the account may **send** in a billing period.
   *
   * Counts the agent's replies, a person's replies typed in the inbox, and
   * campaign messages — everything that leaves the account. Inbound messages
   * are never counted: a business cannot control how many it receives, and
   * charging for them would mean the busiest day of the year is the one where
   * the agent goes quiet.
   *
   * This is our own allowance and has nothing to do with Meta's per-conversation
   * charge on the API plans. A business can be well inside this number and still
   * owe Meta money; the two are counted by different people, for different
   * things.
   */
  monthlyMessageLimit: number | null;

  /** How many campaigns may be started in a billing period. */
  monthlyCampaignLimit: number | null;

  /** How many message templates may be saved at once. */
  savedTemplateLimit: number | null;

  /**
   * How many knowledge-base questions the agent may be given.
   *
   * There is a ceiling above this that is technical rather than commercial:
   * the agent reads every entry on every message, so `lib/knowledge-base.ts`
   * refuses more than MAX_ENTRIES whatever the plan says.
   */
  knowledgeEntryLimit: number | null;

  /** How far back Analytics and the Overview will look. */
  historyWindow: HistoryWindow;

  /**
   * Whether this plan is the official WhatsApp Business API one.
   *
   * True on Enterprise, false on Small Business — the plans *are* the tiers, so
   * this is not a feature toggle so much as which of the two a customer bought.
   * It decides which connection they may set up (lib/usage.ts) and whether they
   * get a bill from Meta as well as from us.
   */
  allowsApiConnection: boolean;

  /** Support promise. Not enforced in code; it is a promise, not a feature. */
  support: string;

  /** What it includes, in the customer's own words (docs/Rules.md §7). */
  includes: string[];
};

export const PLANS: Plan[] = [
  {
    id: "SMALL_BUSINESS",
    name: "Small Business",
    summary:
      "For a small business running WhatsApp from its own number, with nothing charged per message.",
    monthlyPriceInRupees: 999,
    razorpayPlanIdEnvVar: "RAZORPAY_PLAN_ID_SMALL_BUSINESS",
    monthlyMessageLimit: 2_000,
    monthlyCampaignLimit: 4,
    savedTemplateLimit: 10,
    knowledgeEntryLimit: 50,
    historyWindow: "30d",
    allowsApiConnection: false,
    support: "Email support",
    includes: [
      "One agent of your choice",
      "Connect your own number by scanning a QR code",
      "No per-message charges — this price is your whole bill",
      "2,000 messages sent a month",
      "Live inbox — take any conversation over yourself",
      "Leads captured automatically while your agent works",
      "50 knowledge-base answers",
      "Four campaigns a month, up to 25 people each, spaced out",
      "Last 30 days of analytics",
      "Email support",
    ],
  },
  {
    id: "ENTERPRISE",
    name: "Enterprise",
    summary:
      "For a larger business that wants the official WhatsApp channel and its reliability.",
    monthlyPriceInRupees: 1_499,
    razorpayPlanIdEnvVar: "RAZORPAY_PLAN_ID_ENTERPRISE",
    monthlyMessageLimit: 10_000,
    monthlyCampaignLimit: null,
    savedTemplateLimit: null,
    knowledgeEntryLimit: 100,
    historyWindow: "all",
    allowsApiConnection: true,
    support: "Priority support",
    includes: [
      "Everything in Small Business",
      "The official WhatsApp Business API",
      "Meta charges you per conversation on top of this, at their own rates",
      "10,000 messages sent a month",
      "Large campaigns with Meta-approved templates, no 25-person cap",
      "Delivery, read and reply tracking",
      "As many campaigns as you need",
      "Unlimited saved templates",
      "100 knowledge-base answers",
      "All of your history in analytics",
      "Priority support",
    ],
  },
];

/**
 * What an account with no live subscription may do: nothing.
 *
 * This is the `NONE` enum value. It is where a new account sits before it pays,
 * and where a cancellation lands once the period already paid for runs out. The
 * zeroes are deliberate — both plans are paid, so an account that is not paying
 * has no allowance to spend. Nothing is deleted: conversations, leads and the
 * knowledge base are all still there to read, and come back the moment a plan is
 * bought.
 */
export const NO_SUBSCRIPTION_PLAN: Plan = {
  id: "NONE",
  name: "No plan",
  summary: "Nothing is being paid for, so nothing can be sent.",
  monthlyPriceInRupees: 0,
  razorpayPlanIdEnvVar: null,
  monthlyMessageLimit: 0,
  monthlyCampaignLimit: 0,
  savedTemplateLimit: 0,
  knowledgeEntryLimit: 0,
  historyWindow: "7d",
  allowsApiConnection: false,
  support: "Pick a plan to get support",
  includes: [],
};

export function planFor(id: PlanIdValue | null | undefined): Plan {
  return PLANS.find((plan) => plan.id === id) ?? NO_SUBSCRIPTION_PLAN;
}

/**
 * Is this a plan somebody is actually paying for?
 *
 * False only for `NO_SUBSCRIPTION_PLAN`. Worth asking before showing a usage
 * figure "out of" a limit: an account with no plan has a limit of zero, and
 * "you've used all 0 of your messages" reads as a fault rather than as "you
 * haven't picked a plan yet".
 */
export function isPaidPlan(plan: Plan): boolean {
  return plan.id !== NO_SUBSCRIPTION_PLAN.id;
}

/** The plan that comes with the official WhatsApp Business API. */
export const API_PLAN =
  PLANS.find((plan) => plan.allowsApiConnection) ?? NO_SUBSCRIPTION_PLAN;

/** The plan that comes with the QR connection. */
export const QR_PLAN =
  PLANS.find((plan) => !plan.allowsApiConnection) ?? NO_SUBSCRIPTION_PLAN;

/**
 * The plan that goes with a connection tier.
 *
 * The plans *are* the tiers, so this is a lookup rather than a rule. Use it
 * anywhere a screen knows which connection somebody wants and needs to name the
 * plan that comes with it.
 */
export function planForConnectionType(type: "QR" | "API"): Plan {
  return type === "API" ? API_PLAN : QR_PLAN;
}

/**
 * "₹999" — the price as a person writes it.
 *
 * Whole rupees, because that is what the plans cost. If a plan ever has paise
 * in it, this is where that shows up.
 */
export function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

/**
 * What goes next to the price, so nobody reads it as the whole bill.
 *
 * On the API plans the honest answer is "this, plus whatever Meta charges you",
 * and that belongs beside the number rather than in small print further down.
 * No figure is given for Meta's side on purpose — see the note at the top of
 * this file.
 */
export function billingNote(plan: Plan): string {
  return plan.allowsApiConnection
    ? "a month, plus Meta's per-conversation charges billed by Meta"
    : "a month, and nothing per message";
}

/** A limit as a person reads it: "2,000" or "Unlimited". */
export function formatLimit(limit: number | null): string {
  return limit === null ? "Unlimited" : limit.toLocaleString("en-IN");
}

/**
 * What to call a subscription's state on screen.
 *
 * Plain words, never the raw status (docs/Rules.md §7). "Cancelled" deliberately
 * does not say "expired": somebody who cancels keeps everything until the paid
 * period runs out, and telling them otherwise would be wrong as well as unkind.
 */
export function subscriptionStatusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "PAST_DUE":
      return "Payment failed";
    case "INCOMPLETE":
      return "Waiting for payment";
    case "CANCELED":
      return "Cancelled";
    default:
      return "Not subscribed";
  }
}

/**
 * What to call an invoice's state on screen.
 *
 * Razorpay's own words are `issued`, `partially_paid`, `expired` and so on.
 * They are perfectly clear to a developer and mean nothing to a shop owner
 * looking at a list of receipts (docs/Rules.md §7). Anything unrecognised is
 * passed through rather than hidden — a state we have not seen before is still
 * better shown than swallowed.
 */
export function invoiceStatusLabel(status: string | null): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "partially_paid":
      return "Partly paid";
    case "issued":
      return "Due";
    case "draft":
      return "Not sent yet";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    default:
      return status ?? "";
  }
}

// The four plans, as data.
//
// ⚠️ THE ONE FILE TO EDIT WHEN A PLAN CHANGES. ⚠️
//
// The prices were set by the product owner on 2026-09-05: ₹999, ₹1,499 and
// ₹2,499 a month, plus a free plan. What each of those *includes* was left to
// this codebase to decide, and the limits below are that decision — they are
// not something Meta, Razorpay or anyone else imposes. Every one of them is
// enforced by real code (see lib/usage.ts), so changing a number here changes
// the product, immediately and everywhere. Nothing else needs editing.
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

/** Mirrors the PlanId enum in prisma/schema.prisma. */
export type PlanIdValue = "FREE" | "STARTER" | "GROWTH" | "PRO";

export const PLAN_IDS: PlanIdValue[] = ["FREE", "STARTER", "GROWTH", "PRO"];

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

  /** Rupees a month. 0 on the free plan. Display only — see the note above. */
  monthlyPriceInRupees: number;

  /**
   * The name of the environment variable holding this plan's Razorpay plan id.
   *
   * The id itself is never in the repo: it differs between the test and live
   * Razorpay accounts, so it belongs in the environment (docs/Rules.md §3).
   * Null on the free plan, which is never bought.
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
   * Whether this plan may connect through the official WhatsApp Business API.
   *
   * The two lower plans use the free QR connection. This is the one real
   * capability difference between plans — everything else is a matter of how
   * much (docs/PRD.md §7.1).
   */
  allowsApiConnection: boolean;

  /** Support promise. Not enforced in code; it is a promise, not a feature. */
  support: string;

  /** What it includes, in the customer's own words (docs/Rules.md §7). */
  includes: string[];
};

export const PLANS: Plan[] = [
  {
    id: "FREE",
    name: "Free",
    summary:
      "Enough to see whether an agent answering your WhatsApp actually helps.",
    monthlyPriceInRupees: 0,
    razorpayPlanIdEnvVar: null,
    monthlyMessageLimit: 300,
    monthlyCampaignLimit: 1,
    savedTemplateLimit: 3,
    knowledgeEntryLimit: 20,
    historyWindow: "7d",
    allowsApiConnection: false,
    support: "Community support",
    includes: [
      "One agent of your choice",
      "Connect your own number by scanning a QR code",
      "300 messages sent a month",
      "Live inbox — take any conversation over yourself",
      "Leads captured automatically while your agent works",
      "20 knowledge-base answers",
      "One campaign a month, up to 25 people, throttled",
      "Last 7 days of analytics",
    ],
  },
  {
    id: "STARTER",
    name: "Starter",
    summary: "For a small business whose WhatsApp is genuinely busy.",
    monthlyPriceInRupees: 999,
    razorpayPlanIdEnvVar: "RAZORPAY_PLAN_ID_STARTER",
    monthlyMessageLimit: 2_000,
    monthlyCampaignLimit: 4,
    savedTemplateLimit: 10,
    knowledgeEntryLimit: 50,
    historyWindow: "30d",
    allowsApiConnection: false,
    support: "Email support",
    includes: [
      "Everything in Free",
      "2,000 messages sent a month",
      "50 knowledge-base answers",
      "Four campaigns a month",
      "10 saved templates",
      "Last 30 days of analytics",
      "Email support",
    ],
  },
  {
    id: "GROWTH",
    name: "Growth",
    summary:
      "For a business that wants the official WhatsApp channel and its reliability.",
    monthlyPriceInRupees: 1_499,
    razorpayPlanIdEnvVar: "RAZORPAY_PLAN_ID_GROWTH",
    monthlyMessageLimit: 10_000,
    monthlyCampaignLimit: 20,
    savedTemplateLimit: 50,
    knowledgeEntryLimit: 100,
    historyWindow: "all",
    allowsApiConnection: true,
    support: "Email support",
    includes: [
      "Everything in Starter",
      "The official WhatsApp Business API, if you want it",
      "10,000 messages sent a month",
      "Large campaigns with Meta-approved templates",
      "Delivery, read and reply tracking",
      "Twenty campaigns a month",
      "All of your history in analytics",
    ],
  },
  {
    id: "PRO",
    name: "Pro",
    summary: "For high volume, where the WhatsApp number is the front door.",
    monthlyPriceInRupees: 2_499,
    razorpayPlanIdEnvVar: "RAZORPAY_PLAN_ID_PRO",
    monthlyMessageLimit: 30_000,
    monthlyCampaignLimit: null,
    savedTemplateLimit: null,
    knowledgeEntryLimit: 100,
    historyWindow: "all",
    allowsApiConnection: true,
    support: "Priority support",
    includes: [
      "Everything in Growth",
      "30,000 messages sent a month",
      "As many campaigns as you need",
      "Unlimited saved templates",
      "Priority support",
    ],
  },
];

export const FREE_PLAN = PLANS[0];

/** The plans somebody can actually buy, cheapest first. */
export const PAID_PLANS = PLANS.filter((plan) => plan.monthlyPriceInRupees > 0);

export function planFor(id: PlanIdValue | null | undefined): Plan {
  return PLANS.find((plan) => plan.id === id) ?? FREE_PLAN;
}

/** The cheapest plan that allows the official WhatsApp Business API. */
export const FIRST_API_PLAN =
  PLANS.find((plan) => plan.allowsApiConnection) ?? FREE_PLAN;

/**
 * "₹999" — the price as a person writes it.
 *
 * Whole rupees, because that is what the plans cost. If a plan ever has paise
 * in it, this is where that shows up.
 */
export function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
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

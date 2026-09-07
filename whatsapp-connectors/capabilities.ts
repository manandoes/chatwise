// What each connection tier can and cannot do.
//
// **Both tiers are paid.** They are not a free one and a paid one, and calling
// them that — in code, in comments or on screen — is a pricing claim that is no
// longer true. What separates them is who the customer is and who else bills
// them:
//
//   * **QR** — for small businesses. The platform subscription is the whole
//     bill. Nothing is charged per message by anybody.
//   * **API** — for larger businesses. The platform subscription *plus* Meta's
//     own per-conversation charges, billed by Meta directly to the customer's
//     Meta account. We never see that money, and we never quote a rate for it:
//     the numbers are Meta's, they vary by country and conversation type, and
//     inventing one would be inventing a price (docs/Rules.md §9).
//
// Which plans may use which tier is a separate question, answered by
// `allowsApiConnection` in lib/plans.ts. This file is about what a connection
// can *do* once it exists.
//
// This is deliberately *data*, not behaviour. Everything above the connectors —
// campaigns, analytics, the inbox — should read a value from here rather than
// asking "is this the QR tier?", because the moment a screen branches on the
// tier it has to be changed again for every rule that differs. Reading
// `maxBulkRecipients` means the 25-recipient cap lives in exactly one place and
// cannot drift from what the pricing page claims.
//
// There is nothing server-only here on purpose: the campaigns screen has to
// disable its send button at 25 recipients in the browser, and the API route
// has to reject the same send on the server. Both read this file. Same split as
// `lib/onboarding-steps.ts` and `components/dashboard/nav-items.ts`.
//
// Everything here comes from docs/PRD.md §7.1. Where Meta sets a limit rather
// than us, the value is `null` and the comment says so — inventing a number
// would be inventing a plan limit (docs/Rules.md §9).

/** Mirrors the ConnectionType enum in prisma/schema.prisma. */
export type ConnectionTypeValue = "QR" | "API";

export type TierCapabilities = {
  /**
   * Most recipients allowed in one bulk send.
   *
   * 25 on the QR tier is a hard cap we impose, enforced in code and not just
   * suggested (docs/PRD.md §7.1). `null` on the API tier means *we* impose no
   * cap — Meta's own messaging tier and quality rating still apply, and those
   * are theirs to set, not ours to guess.
   */
  maxBulkRecipients: number | null;

  /**
   * Whether a bulk send must be spaced out rather than fired all at once.
   *
   * True on the QR tier, where a burst from one ordinary number is what gets it
   * banned. The gaps themselves live in campaigns/throttle.ts.
   */
  requiresBulkThrottle: boolean;

  /**
   * Whether starting a conversation needs a template Meta has approved.
   *
   * The two tiers mean genuinely different things by "template": on the API
   * tier it is a named, approved object at Meta with variables; on the QR tier
   * it is ordinary text we fill in and send. Anything storing templates has to
   * handle both shapes (see docs/Memory.md).
   */
  requiresApprovedTemplates: boolean;

  /** Whether we are told that a message was delivered or read. */
  supportsDeliveryReceipts: boolean;

  /**
   * Whether the mandatory ban-risk warning is shown before a bulk send.
   *
   * Required on the QR tier and non-negotiable (docs/PRD.md §7.2): that tier
   * runs on the customer's own ordinary WhatsApp number, and the number is what
   * pays for a bad send. The API tier still carries an ordinary opt-out and
   * compliance notice; it just isn't this warning.
   */
  requiresBanRiskWarning: boolean;

  /**
   * Whether a send is confirmed there and then.
   *
   * The API tier calls Meta and knows the answer before it returns. The QR tier
   * hands the message to a worker over a queue, so "accepted" is the most that
   * can honestly be said at the point of sending. Anything reporting a send to a
   * customer needs to know which of the two it is dealing with.
   */
  sendIsImmediate: boolean;

  /**
   * Whether Meta bills the customer per conversation, on top of what we charge.
   *
   * True on the API tier only. This is the whole commercial difference between
   * the two tiers and the reason anything says "plus Meta's charges" on screen.
   * There is deliberately **no rate here**: Meta sets it, it varies by country
   * and conversation type, and a number in this file would be a price we made up
   * (docs/Rules.md §9). Screens should say the charge exists and send people to
   * Meta for what it is.
   */
  billsPerMessageAtMeta: boolean;
};

const QR_TIER: TierCapabilities = {
  maxBulkRecipients: 25,
  requiresBulkThrottle: true,
  requiresApprovedTemplates: false,
  supportsDeliveryReceipts: false,
  requiresBanRiskWarning: true,
  sendIsImmediate: false,
  billsPerMessageAtMeta: false,
};

const API_TIER: TierCapabilities = {
  maxBulkRecipients: null,
  requiresBulkThrottle: false,
  requiresApprovedTemplates: true,
  supportsDeliveryReceipts: true,
  requiresBanRiskWarning: false,
  sendIsImmediate: true,
  billsPerMessageAtMeta: true,
};

export function capabilitiesFor(type: ConnectionTypeValue): TierCapabilities {
  return type === "QR" ? QR_TIER : API_TIER;
}

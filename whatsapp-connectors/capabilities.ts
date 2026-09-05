// What each connection tier can and cannot do.
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
   * 25 on the free tier is a hard cap we impose, enforced in code and not just
   * suggested (docs/PRD.md §7.1). `null` on the paid tier means *we* impose no
   * cap — Meta's own messaging tier and quality rating still apply, and those
   * are theirs to set, not ours to guess.
   */
  maxBulkRecipients: number | null;

  /**
   * Whether a bulk send must be spaced out rather than fired all at once.
   *
   * True on the free tier, where a burst is what gets a number banned. The
   * actual delay is Phase 12's to choose and tune — it is not recorded here
   * because no one has picked a number yet.
   */
  requiresBulkThrottle: boolean;

  /**
   * Whether starting a conversation needs a template Meta has approved.
   *
   * The two tiers mean genuinely different things by "template": on the paid
   * tier it is a named, approved object at Meta with variables; on the free
   * tier it is ordinary text we fill in and send. Anything storing templates
   * has to handle both shapes (see docs/Memory.md).
   */
  requiresApprovedTemplates: boolean;

  /** Whether we are told that a message was delivered or read. */
  supportsDeliveryReceipts: boolean;

  /**
   * Whether the mandatory ban-risk warning is shown before a bulk send.
   *
   * Required on the free tier and non-negotiable (docs/PRD.md §7.2). The paid
   * tier still carries an ordinary opt-out and compliance notice; it just isn't
   * this warning.
   */
  requiresBanRiskWarning: boolean;

  /**
   * Whether a send is confirmed there and then.
   *
   * The paid tier calls Meta and knows the answer before it returns. The free
   * tier hands the message to a worker over a queue, so "accepted" is the most
   * that can honestly be said at the point of sending. Anything reporting a
   * send to a customer needs to know which of the two it is dealing with.
   */
  sendIsImmediate: boolean;
};

const QR_TIER: TierCapabilities = {
  maxBulkRecipients: 25,
  requiresBulkThrottle: true,
  requiresApprovedTemplates: false,
  supportsDeliveryReceipts: false,
  requiresBanRiskWarning: true,
  sendIsImmediate: false,
};

const API_TIER: TierCapabilities = {
  maxBulkRecipients: null,
  requiresBulkThrottle: false,
  requiresApprovedTemplates: true,
  supportsDeliveryReceipts: true,
  requiresBanRiskWarning: false,
  sendIsImmediate: true,
};

export function capabilitiesFor(type: ConnectionTypeValue): TierCapabilities {
  return type === "QR" ? QR_TIER : API_TIER;
}

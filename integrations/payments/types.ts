// The shapes both payment providers are translated into, so the rest of
// ChatWise never branches on Razorpay vs Stripe after the first step.

export type ProviderResult<T> = { ok: true; value: T } | { ok: false; message: string };

/**
 * What a provider's webhook means for one of our payments.
 *
 * `reference` is our own Payment id, which we hand the provider when creating
 * the link; `linkId` is the provider's id for the link. Either finds the row.
 * Amounts are in the currency's smallest unit (paise, cents).
 */
export type PaymentEvent =
  | { kind: "paid"; linkId: string | null; reference: string | null; providerPaymentId: string | null }
  | { kind: "failed"; linkId: string | null; reference: string | null; providerPaymentId: string | null }
  | { kind: "expired" | "cancelled"; linkId: string | null; reference: string | null }
  | {
      kind: "refunded";
      providerPaymentId: string;
      /** Everything refunded so far, when the provider says; else add refundAmount. */
      refundedTotal: number | null;
      refundAmount: number;
    }
  | { kind: "ignored"; reason: string };

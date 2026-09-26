// A customer's receipt for a payment link: /receipts/<token>
//
// Public — the customer has no ChatWise login — so the address carries an
// unguessable token rather than the payment's id, and the page shows only
// what a paper receipt would: who was paid, how much, for what, and when. No
// phone number, no email, no provider ids.
//
// It is also where the provider sends the customer straight after paying,
// which can be a few seconds before the provider's webhook tells us — hence
// "confirming" rather than "not paid" for a link that is still open.

import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { formatDate } from "@/lib/format-when";
import { formatMinor } from "@/integrations/payments/links";

export const metadata: Metadata = {
  title: "Receipt",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // A token is 24 url-safe characters; anything else is not worth a query.
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();

  const payment = await db.payment.findUnique({
    where: { receiptToken: token },
    select: {
      id: true,
      amount: true,
      currency: true,
      refundedAmount: true,
      status: true,
      description: true,
      reference: true,
      paidAt: true,
      createdAt: true,
      business: { select: { name: true } },
    },
  });

  if (!payment) notFound();

  const paid = payment.status === "PAID" || payment.status === "PARTIALLY_REFUNDED" || payment.status === "REFUNDED";
  const open = payment.status === "CREATED" || payment.status === "FAILED";

  const heading = paid
    ? "Payment received"
    : open
      ? "Confirming your payment"
      : "This payment link is no longer active";

  const Icon = paid ? CheckCircle2 : open ? Clock : XCircle;

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8">
        <Icon aria-hidden className={`size-8 ${paid ? "text-success" : "text-text-secondary"}`} />

        <h1 className="mt-4 text-h2 font-semibold text-text-primary">{heading}</h1>

        {open && (
          <p className="mt-2 text-small text-text-secondary">
            If you&rsquo;ve just paid, this can take a minute to update. You&rsquo;ll also get a
            confirmation on WhatsApp.
          </p>
        )}

        <dl className="mt-6 space-y-3 text-small">
          <Row label="Paid to" value={payment.business.name ?? "—"} />
          <Row label="For" value={payment.description} />
          <Row label="Amount" value={formatMinor(payment.amount, payment.currency)} />
          {payment.refundedAmount > 0 && (
            <Row label="Refunded" value={formatMinor(payment.refundedAmount, payment.currency)} />
          )}
          {payment.paidAt && <Row label="Date" value={formatDate(payment.paidAt)} />}
          {payment.reference && <Row label="Reference" value={payment.reference} />}
          <Row label="Receipt number" value={payment.id.slice(-10).toUpperCase()} />
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border pb-3 last:border-0">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="text-right font-medium text-text-primary">{value}</dd>
    </div>
  );
}

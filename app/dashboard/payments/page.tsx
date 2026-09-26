// Payments — sending customers payment links, and seeing what became of them.

import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/form-bits";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaymentsManager } from "@/components/dashboard/payments-manager";
import { db } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/features";
import { formatWhen } from "@/lib/format-when";
import { requirePageContext } from "@/lib/page-context";
import { formatMinor, PROVIDER_NAME } from "@/integrations/payments/links";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const { business, isOwner } = await requirePageContext();

  if (!isFeatureEnabled("paymentLinks")) {
    return (
      <div className="space-y-8">
        <PageHeader title="Payments" />
        <EmptyState title="Payment links aren't switched on yet">
          This ChatWise installation hasn&apos;t turned on payment links.
        </EmptyState>
      </div>
    );
  }

  const [accounts, payments] = await Promise.all([
    db.paymentAccount.findMany({
      where: { businessId: business.id },
      orderBy: { provider: "asc" },
      select: { provider: true, currency: true },
    }),
    db.payment.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        provider: true,
        amount: true,
        currency: true,
        refundedAmount: true,
        status: true,
        description: true,
        reference: true,
        linkUrl: true,
        receiptToken: true,
        createdAt: true,
        paidAt: true,
        contact: { select: { name: true, phone: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Payments"
        description="Send a customer a link to pay on WhatsApp. They pay on Razorpay's or Stripe's own page, and get a receipt when it goes through."
      />

      {accounts.length === 0 ? (
        <EmptyState title="Connect a payment account first">
          Payment links use your own Razorpay or Stripe account, so the money goes straight to you.{" "}
          {isOwner ? (
            <Link href="/dashboard/integrations#payments" className="text-primary underline">
              Connect one under Integrations.
            </Link>
          ) : (
            "Ask the account owner to connect one under Integrations."
          )}
        </EmptyState>
      ) : (
        <PaymentsManager
          accounts={accounts.map((account) => ({
            provider: account.provider,
            label: `${PROVIDER_NAME[account.provider]} (${account.currency})`,
            currency: account.currency,
          }))}
          payments={payments.map((payment) => ({
            id: payment.id,
            provider: PROVIDER_NAME[payment.provider],
            amount: formatMinor(payment.amount, payment.currency),
            refunded: payment.refundedAmount > 0 ? formatMinor(payment.refundedAmount, payment.currency) : null,
            status: payment.status,
            description: payment.description,
            reference: payment.reference,
            linkUrl: payment.linkUrl,
            receiptPath: `/receipts/${payment.receiptToken}`,
            who: payment.contact?.name || (payment.contact ? `+${payment.contact.phone}` : "Deleted contact"),
            when: formatWhen(payment.paidAt ?? payment.createdAt),
          }))}
        />
      )}
    </div>
  );
}

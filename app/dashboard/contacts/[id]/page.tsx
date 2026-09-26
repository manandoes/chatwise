// One contact: their details, tags and consent (editable), and everything
// the business has with them — conversation, orders, payments, deals,
// bookings — plus the full consent log.

import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ContactEditor } from "@/components/dashboard/contact-editor";
import { Pill, Section } from "@/components/dashboard/form-bits";
import { PageHeader } from "@/components/dashboard/page-header";
import { formatMoney } from "@/lib/automations";
import { OPT_IN_STATUS_LABEL, readConsentLog } from "@/lib/consent";
import { db } from "@/lib/db";
import { STAGE_LABEL } from "@/lib/deals";
import { formatWhen } from "@/lib/format-when";
import { requirePageContext } from "@/lib/page-context";
import { formatMinor } from "@/integrations/payments/links";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { business } = await requirePageContext();
  const { id } = await params;

  const contact = await db.contact.findFirst({
    where: { id, businessId: business.id },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      language: true,
      optInStatus: true,
      optInSource: true,
      totalSpent: true,
      currency: true,
      orderCount: true,
      lastOrderAt: true,
      createdAt: true,
      tags: { select: { source: true, tag: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      conversations: { select: { id: true, lastMessageAt: true }, take: 1 },
      orders: {
        orderBy: { placedAt: "desc" },
        take: 20,
        select: { id: true, orderNumber: true, status: true, total: true, currency: true, placedAt: true, trackingUrl: true },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, amount: true, currency: true, status: true, description: true, createdAt: true },
      },
      deals: {
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: { id: true, title: true, stage: true, value: true, currency: true },
      },
      bookings: {
        orderBy: { startTime: "desc" },
        take: 10,
        select: { id: true, eventName: true, startTime: true, status: true },
      },
    },
  });

  if (!contact) notFound();

  const [tagNames, consentLog] = await Promise.all([
    db.tag.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" }, select: { name: true } }),
    readConsentLog(business.id, contact.id),
  ]);

  const conversation = contact.conversations[0];

  return (
    <div className="space-y-10">
      <Link href="/dashboard/contacts" className="inline-flex items-center gap-1.5 text-small text-text-secondary hover:text-text-primary">
        <ArrowLeft className="size-4" /> All contacts
      </Link>

      <PageHeader
        title={contact.name || `+${contact.phone}`}
        description={`+${contact.phone} · added ${formatWhen(contact.createdAt)}${
          Number(contact.totalSpent) > 0
            ? ` · spent ${formatMoney(contact.totalSpent.toString(), contact.currency ?? "INR")} over ${contact.orderCount} ${contact.orderCount === 1 ? "order" : "orders"}`
            : ""
        }`}
        action={
          conversation ? (
            <Link href={`/dashboard/conversations/${conversation.id}`} className="text-small text-primary underline">
              Open conversation
            </Link>
          ) : undefined
        }
      />

      <ContactEditor
        contact={{
          id: contact.id,
          name: contact.name ?? "",
          email: contact.email ?? "",
          language: contact.language ?? "",
          optInStatus: contact.optInStatus,
          tags: contact.tags.map((row) => ({ name: row.tag.name, byRule: row.source === "RULE" })),
        }}
        knownTags={tagNames.map((row) => row.name)}
      />

      {contact.orders.length > 0 && (
        <Section title="Orders">
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-small">
            {contact.orders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="font-medium text-text-primary">{order.orderNumber ?? "Order"}</span>
                <Pill>{order.status.toLowerCase().replace("_", " ")}</Pill>
                <span className="tabular-nums">{formatMoney(order.total.toString(), order.currency)}</span>
                <span className="ml-auto text-text-secondary">{formatWhen(order.placedAt)}</span>
                {order.trackingUrl && (
                  <a href={order.trackingUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                    Tracking
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {contact.payments.length > 0 && (
        <Section title="Payment links">
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-small">
            {contact.payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="font-medium tabular-nums text-text-primary">{formatMinor(payment.amount, payment.currency)}</span>
                <Pill>{payment.status.toLowerCase().replace("_", " ")}</Pill>
                <span className="text-text-secondary">{payment.description}</span>
                <span className="ml-auto text-text-secondary">{formatWhen(payment.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {contact.deals.length > 0 && (
        <Section title="Deals">
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-small">
            {contact.deals.map((deal) => (
              <li key={deal.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="font-medium text-text-primary">{deal.title}</span>
                <Pill tone="primary">{STAGE_LABEL[deal.stage]}</Pill>
                <span className="ml-auto tabular-nums">{formatMoney(deal.value.toString(), deal.currency)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {contact.bookings.length > 0 && (
        <Section title="Bookings">
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-small">
            {contact.bookings.map((booking) => (
              <li key={booking.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="font-medium text-text-primary">{booking.eventName ?? "Meeting"}</span>
                <Pill tone={booking.status === "BOOKED" ? "good" : "neutral"}>
                  {booking.status === "BOOKED" ? "Booked" : "Cancelled"}
                </Pill>
                <span className="ml-auto text-text-secondary">{booking.startTime.toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Consent history"
        description="Every time this person's permission to be messaged changed, and why. Kept for your records."
      >
        {consentLog.length === 0 ? (
          <p className="text-small text-text-secondary">No changes recorded — they haven&apos;t been asked yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-small">
            {consentLog.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="text-text-primary">
                  {event.fromStatus ? `${OPT_IN_STATUS_LABEL[event.fromStatus]} → ` : ""}
                  {OPT_IN_STATUS_LABEL[event.toStatus]}
                </span>
                <span className="text-text-secondary">
                  via {event.source}
                  {event.detail ? ` (${event.detail})` : ""}
                </span>
                <span className="ml-auto text-text-secondary">{formatWhen(event.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

// Bookings — meetings customers booked through Calendly, and sending
// someone your booking link.

import type { Metadata } from "next";
import Link from "next/link";

import { BookingInviteForm } from "@/components/dashboard/booking-invite-form";
import { EmptyState, Pill } from "@/components/dashboard/form-bits";
import { PageHeader } from "@/components/dashboard/page-header";
import { db } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/features";
import { requirePageContext } from "@/lib/page-context";
import { formatBookingTime } from "@/integrations/calendly/sync";

export const metadata: Metadata = { title: "Bookings" };

export default async function BookingsPage() {
  const { business, isOwner } = await requirePageContext();

  if (!isFeatureEnabled("calendly")) {
    return (
      <div className="space-y-8">
        <PageHeader title="Bookings" />
        <EmptyState title="Bookings aren't switched on yet">
          This ChatWise installation hasn&apos;t turned on Calendly.
        </EmptyState>
      </div>
    );
  }

  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60_000);

  const [calendly, timezone, upcoming, recent, contacts] = await Promise.all([
    db.calendlyConnection.findUnique({ where: { businessId: business.id }, select: { bookingUrl: true, webhookUri: true } }),
    db.business.findUniqueOrThrow({ where: { id: business.id }, select: { timezone: true } }).then((row) => row.timezone),
    db.booking.findMany({
      where: { businessId: business.id, status: "BOOKED", startTime: { gte: now } },
      orderBy: { startTime: "asc" },
      take: 100,
      select: bookingSelect,
    }),
    db.booking.findMany({
      where: {
        businessId: business.id,
        startTime: { gte: monthAgo },
        OR: [{ startTime: { lt: now } }, { status: "CANCELED" }],
      },
      orderBy: { startTime: "desc" },
      take: 50,
      select: bookingSelect,
    }),
    db.contact.findMany({
      where: { businessId: business.id, optInStatus: { not: "OPTED_OUT" } },
      orderBy: { updatedAt: "desc" },
      take: 500,
      select: { id: true, name: true, phone: true },
    }),
  ]);

  if (!calendly) {
    return (
      <div className="space-y-8">
        <PageHeader title="Bookings" />
        <EmptyState title="Connect Calendly to take bookings">
          Share your Calendly link on WhatsApp and see who booked here, with confirmations and reminders sent for you.{" "}
          {isOwner ? (
            <Link href="/dashboard/integrations#calendly" className="text-primary underline">
              Connect it under Integrations.
            </Link>
          ) : (
            "Ask the account owner to connect it under Integrations."
          )}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <PageHeader
        title="Bookings"
        description={
          calendly.webhookUri
            ? "Meetings booked through your Calendly link. Each gets a WhatsApp confirmation, then reminders 24 hours and 1 hour before."
            : "Your Calendly link is connected. Add a personal access token under Integrations to see bookings here and send confirmations and reminders."
        }
      />

      <BookingInviteForm
        contacts={contacts.map((contact) => ({
          id: contact.id,
          label: contact.name ? `${contact.name} (+${contact.phone})` : `+${contact.phone}`,
        }))}
      />

      <BookingList title="Coming up" empty="Nothing booked yet." rows={upcoming} timezone={timezone} showReminders />
      {recent.length > 0 && <BookingList title="Past 30 days" empty="" rows={recent} timezone={timezone} />}
    </div>
  );
}

const bookingSelect = {
  id: true,
  eventName: true,
  startTime: true,
  status: true,
  inviteeName: true,
  inviteeEmail: true,
  reminder24hSentAt: true,
  reminder1hSentAt: true,
  contact: { select: { id: true, name: true, phone: true } },
} as const;

type BookingRow = {
  id: string;
  eventName: string | null;
  startTime: Date;
  status: "BOOKED" | "CANCELED";
  inviteeName: string | null;
  inviteeEmail: string | null;
  reminder24hSentAt: Date | null;
  reminder1hSentAt: Date | null;
  contact: { id: string; name: string | null; phone: string } | null;
};

function BookingList({
  title,
  empty,
  rows,
  timezone,
  showReminders = false,
}: {
  title: string;
  empty: string;
  rows: BookingRow[];
  timezone: string;
  showReminders?: boolean;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-h3 font-semibold text-text-primary">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-small text-text-secondary">{empty}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface text-small">
          {rows.map((booking) => {
            const who = booking.contact?.name || booking.inviteeName || (booking.contact ? `+${booking.contact.phone}` : booking.inviteeEmail) || "Someone";

            return (
              <li key={booking.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="w-56 shrink-0 font-medium tabular-nums text-text-primary">
                  {formatBookingTime(booking.startTime, timezone)}
                </span>
                <span className="min-w-0 flex-1 text-text-primary">
                  {booking.contact ? (
                    <Link href={`/dashboard/contacts/${booking.contact.id}`} className="hover:underline">
                      {who}
                    </Link>
                  ) : (
                    who
                  )}
                  {booking.eventName && <span className="text-text-secondary"> · {booking.eventName}</span>}
                </span>
                {booking.status === "CANCELED" ? (
                  <Pill>Cancelled</Pill>
                ) : showReminders ? (
                  <span className="text-xs text-text-secondary">
                    {!booking.contact
                      ? "No WhatsApp number — no reminders"
                      : booking.reminder1hSentAt
                        ? "Both reminders sent"
                        : booking.reminder24hSentAt
                          ? "Day-before reminder sent"
                          : "Reminders pending"}
                  </span>
                ) : (
                  <Pill tone="good">Done</Pill>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

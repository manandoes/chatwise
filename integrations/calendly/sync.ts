// Calendly bookings: connecting an account, what happens when someone books
// or cancels, and the reminders before each meeting.
//
//   * Links we send carry the contact's id (`bookingLinkFor`), so the booking
//     that comes back is matched to the right person even if they type a
//     different phone number or email into Calendly. Without it, we match on
//     the phone number they gave, then their email.
//   * A booking queues a confirmation on WhatsApp; a cancellation just marks
//     it cancelled (no reminders will go).
//   * `sendDueBookingReminders` runs every five minutes and sends a reminder
//     24 hours and 1 hour before each meeting. Each reminder is claimed on the
//     booking row before it is queued, so none goes twice, and one whose
//     moment has passed (the host was down) is skipped rather than sent late.
//
// Every message goes through lib/automations.ts, so opt-outs, the owner's
// switches and WhatsApp's 24-hour rule all apply.
//
// Relative .ts imports: runs in jobs on the always-on host.

import "server-only";

import { randomBytes } from "node:crypto";

import { db } from "../../lib/db.ts";
import { normalizePhone, upsertContact } from "../../lib/contacts.ts";
import { decryptText, encryptText } from "../../lib/encryption.ts";
import { enqueueJob } from "../../lib/jobs.ts";
import { publicAppUrl } from "../../lib/features.ts";
import { createCalendlyWebhook, deleteCalendlyWebhook, readCalendlyUser } from "./client.ts";

const HOUR = 60 * 60_000;

/**
 * The booking link with the contact's id in it, so the booking that comes
 * back can be matched to the right person.
 */
export function bookingLinkFor(bookingUrl: string, contactId: string): string {
  try {
    const url = new URL(bookingUrl);
    url.searchParams.set("utm_source", "chatwise");
    url.searchParams.set("utm_content", contactId);

    return url.toString();
  } catch {
    return bookingUrl;
  }
}

export function calendlyWebhookAddress(pathToken: string): string {
  return `${publicAppUrl()}/api/calendly/webhook/${pathToken}`;
}

/** "Tue, 30 Sept, 3:00 pm IST", in the business's own time zone. */
export function formatBookingTime(date: Date, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  };

  try {
    return new Intl.DateTimeFormat("en-IN", { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-IN", { ...options, timeZone: "UTC" }).format(date);
  }
}

// ─── Connecting ─────────────────────────────────────────────────────────────

export type ConnectResult =
  | { ok: true; webhooks: boolean; note: string | null }
  | { ok: false; message: string; field?: "bookingUrl" | "token" };

/**
 * Saves the booking link and, when a personal access token is given, asks
 * Calendly to send us bookings. Reconnecting replaces the old webhook.
 * A token Calendly accepts but won't give webhooks for (free plan) still
 * connects — links work; confirmations and reminders don't.
 */
export async function connectCalendly(input: {
  businessId: string;
  bookingUrl: string;
  token: string | null;
}): Promise<ConnectResult> {
  const existing = await db.calendlyConnection.findUnique({
    where: { businessId: input.businessId },
    select: { webhookPathToken: true, webhookUri: true, accessToken: true },
  });

  const webhookPathToken = existing?.webhookPathToken ?? randomBytes(18).toString("base64url");

  if (!input.token) {
    await db.calendlyConnection.upsert({
      where: { businessId: input.businessId },
      create: { businessId: input.businessId, bookingUrl: input.bookingUrl, webhookPathToken },
      update: { bookingUrl: input.bookingUrl },
    });

    return {
      ok: true,
      webhooks: Boolean(existing?.webhookUri),
      note: existing?.webhookUri ? null : "Links work. Add a personal access token to get confirmations and reminders.",
    };
  }

  const user = await readCalendlyUser(input.token);

  if (!user.ok) return { ok: false, message: user.message, field: "token" };

  // Only one webhook per connection: the old one goes before the new one comes.
  if (existing?.webhookUri && existing.accessToken?.length) {
    await deleteCalendlyWebhook(decryptText(Buffer.from(existing.accessToken)), existing.webhookUri);
  }

  const signingKey = randomBytes(32).toString("base64url");
  const webhook = await createCalendlyWebhook(input.token, {
    url: calendlyWebhookAddress(webhookPathToken),
    userUri: user.value.userUri,
    organizationUri: user.value.organizationUri,
    signingKey,
  });

  if (!webhook.ok && webhook.status !== 403) return { ok: false, message: webhook.message, field: "token" };

  const data = {
    bookingUrl: input.bookingUrl,
    accessToken: new Uint8Array(encryptText(input.token)),
    userUri: user.value.userUri,
    organizationUri: user.value.organizationUri,
    webhookUri: webhook.ok ? webhook.value : null,
    signingKey: webhook.ok ? new Uint8Array(encryptText(signingKey)) : null,
  };

  await db.calendlyConnection.upsert({
    where: { businessId: input.businessId },
    create: { businessId: input.businessId, webhookPathToken, ...data },
    update: data,
  });

  return { ok: true, webhooks: webhook.ok, note: webhook.ok ? null : webhook.message };
}

/** Removes the connection, and the webhook with Calendly. Bookings stay. */
export async function disconnectCalendly(businessId: string): Promise<boolean> {
  const existing = await db.calendlyConnection.findUnique({
    where: { businessId },
    select: { webhookUri: true, accessToken: true },
  });

  if (!existing) return false;

  if (existing.webhookUri && existing.accessToken?.length) {
    await deleteCalendlyWebhook(decryptText(Buffer.from(existing.accessToken)), existing.webhookUri);
  }

  await db.calendlyConnection.delete({ where: { businessId } });

  return true;
}

// ─── Bookings from the webhook ──────────────────────────────────────────────

type CalendlyWebhook = {
  event?: string;
  payload?: {
    uri?: string;
    name?: string | null;
    email?: string | null;
    text_reminder_number?: string | null;
    questions_and_answers?: { question?: string; answer?: string }[] | null;
    tracking?: { utm_source?: string | null; utm_content?: string | null } | null;
    cancel_url?: string | null;
    reschedule_url?: string | null;
    scheduled_event?: { name?: string | null; start_time?: string; end_time?: string | null } | null;
  };
};

const PHONE_QUESTION = /phone|mobile|whats ?app|number|contact/i;

/** Who booked: our own link's contact id first, then their phone, then their email. */
async function contactForInvitee(businessId: string, payload: NonNullable<CalendlyWebhook["payload"]>) {
  const tracking = payload.tracking;

  if (tracking?.utm_source === "chatwise" && tracking.utm_content) {
    // Only ever a contact of this same business, whatever the link said.
    const linked = await db.contact.findFirst({
      where: { id: tracking.utm_content, businessId },
      select: { id: true },
    });

    if (linked) return linked.id;
  }

  const phones = [
    payload.text_reminder_number,
    ...(payload.questions_and_answers ?? [])
      .filter((item) => PHONE_QUESTION.test(item.question ?? ""))
      .map((item) => item.answer),
  ];

  for (const raw of phones) {
    const phone = normalizePhone(raw);

    if (phone) {
      const contact = await upsertContact(businessId, phone, { name: payload.name, email: payload.email });

      return contact.id;
    }
  }

  const email = payload.email?.trim().toLowerCase();

  if (email) {
    const byEmail = await db.contact.findFirst({ where: { businessId, email }, select: { id: true } });

    if (byEmail) return byEmail.id;
  }

  return null;
}

/**
 * One Calendly webhook, already checked and deduped by the route. The
 * business comes from the connection the webhook arrived on.
 */
export async function processCalendlyWebhook(businessId: string, body: unknown): Promise<string> {
  const event = body as CalendlyWebhook;
  const payload = event.payload;

  if (event.event !== "invitee.created" && event.event !== "invitee.canceled") return `ignored ${event.event ?? "event"}`;
  if (!payload?.uri || !payload.scheduled_event?.start_time) return "booking without the details we need";

  const startTime = new Date(payload.scheduled_event.start_time);

  if (Number.isNaN(startTime.getTime())) return "booking with an unreadable time";

  const contactId = await contactForInvitee(businessId, payload);
  const phone = normalizePhone(payload.text_reminder_number);
  const status = event.event === "invitee.created" ? "BOOKED" : "CANCELED";

  const details = {
    contactId,
    eventName: payload.scheduled_event.name?.slice(0, 200) ?? null,
    startTime,
    endTime: payload.scheduled_event.end_time ? new Date(payload.scheduled_event.end_time) : null,
    inviteeName: payload.name?.slice(0, 120) ?? null,
    inviteeEmail: payload.email?.slice(0, 200) ?? null,
    inviteePhone: phone,
    cancelUrl: payload.cancel_url ?? null,
    rescheduleUrl: payload.reschedule_url ?? null,
  };

  const booking = await db.booking.upsert({
    where: { businessId_provider_providerEventId: { businessId, provider: "CALENDLY", providerEventId: payload.uri } },
    create: { businessId, provider: "CALENDLY", providerEventId: payload.uri, status, ...details },
    // A cancellation that arrives after the booking only changes its status;
    // one that somehow arrives first still leaves a cancelled row.
    update: status === "CANCELED" ? { status } : details,
    select: { id: true, status: true, contactId: true, startTime: true, eventName: true, rescheduleUrl: true, cancelUrl: true },
  });

  if (status === "CANCELED") return "booking cancelled";
  if (!booking.contactId) return "booking saved; no WhatsApp number to confirm to";
  if (booking.status !== "BOOKED" || booking.startTime <= new Date()) return "booking saved";

  const business = await db.business.findUniqueOrThrow({ where: { id: businessId }, select: { timezone: true } });

  await enqueueJob({
    businessId,
    jobType: "automation.send",
    dedupeKey: `calendly:BOOKING_CONFIRMED:${booking.id}`,
    payload: {
      kind: "BOOKING_CONFIRMED",
      contactId: booking.contactId,
      variables: {
        event_name: booking.eventName ?? "your meeting",
        start_time: formatBookingTime(booking.startTime, business.timezone),
        reschedule_url: booking.rescheduleUrl ?? "",
        cancel_url: booking.cancelUrl ?? "",
      },
    },
  });

  return "booking saved; confirmation queued";
}

// ─── Reminders ──────────────────────────────────────────────────────────────

/** Reminders only for people who booked far enough ahead to need one. */
const MIN_LEAD_FOR_DAY_REMINDER = 24 * HOUR - 30 * 60_000;
const MIN_LEAD_FOR_HOUR_REMINDER = 2 * HOUR;

type Due = { id: string; contactId: string | null; startTime: Date; createdAt: Date; eventName: string | null; businessId: string };

/**
 * Queues the 24-hour and 1-hour reminders that are due. Each is claimed by
 * setting its "sent" time on the booking first, so running this twice —
 * two hosts, a retry — never sends one twice.
 */
export async function sendDueBookingReminders(now = new Date()): Promise<{ queued: number }> {
  const connected = { business: { calendly: { isNot: null } } } as const;
  const select = { id: true, contactId: true, startTime: true, createdAt: true, eventName: true, businessId: true } as const;

  const [dayAhead, hourAhead] = await Promise.all([
    db.booking.findMany({
      where: {
        ...connected,
        status: "BOOKED",
        reminder24hSentAt: null,
        // Due once the meeting is within a day, until the hour reminder takes over.
        startTime: { gt: new Date(now.getTime() + HOUR), lte: new Date(now.getTime() + 24 * HOUR) },
      },
      select,
      take: 200,
    }),
    db.booking.findMany({
      where: {
        ...connected,
        status: "BOOKED",
        reminder1hSentAt: null,
        startTime: { gt: now, lte: new Date(now.getTime() + HOUR) },
      },
      select,
      take: 200,
    }),
  ]);

  let queued = 0;

  const send = async (booking: Due, which: "24h" | "1h") => {
    const claimed = await db.booking.updateMany({
      where: which === "24h" ? { id: booking.id, reminder24hSentAt: null } : { id: booking.id, reminder1hSentAt: null },
      data: which === "24h" ? { reminder24hSentAt: now } : { reminder1hSentAt: now },
    });

    if (claimed.count !== 1) return;

    // Claimed either way: someone who booked this morning for this afternoon
    // doesn't need a "tomorrow" reminder, and never will.
    const lead = booking.startTime.getTime() - booking.createdAt.getTime();

    if (!booking.contactId) return;
    if (which === "24h" && lead < MIN_LEAD_FOR_DAY_REMINDER) return;
    if (which === "1h" && lead < MIN_LEAD_FOR_HOUR_REMINDER) return;

    const business = await db.business.findUniqueOrThrow({ where: { id: booking.businessId }, select: { timezone: true } });
    const sameDay =
      new Intl.DateTimeFormat("en-CA", { timeZone: safeZone(business.timezone) }).format(booking.startTime) ===
      new Intl.DateTimeFormat("en-CA", { timeZone: safeZone(business.timezone) }).format(now);

    await enqueueJob({
      businessId: booking.businessId,
      jobType: "automation.send",
      dedupeKey: `booking:reminder:${which}:${booking.id}`,
      payload: {
        kind: "BOOKING_REMINDER",
        contactId: booking.contactId,
        variables: {
          event_name: booking.eventName ?? "Your meeting",
          start_time: formatBookingTime(booking.startTime, business.timezone),
          when: which === "1h" ? "in about an hour" : sameDay ? "later today" : "tomorrow",
        },
      },
    });

    queued += 1;
  };

  for (const booking of dayAhead) await send(booking, "24h");
  for (const booking of hourAhead) await send(booking, "1h");

  return { queued };
}

function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

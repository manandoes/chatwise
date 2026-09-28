// Automated WhatsApp messages: order confirmations, receipts, reminders.
//
// Shopify, the payment providers and Calendly all end in the same place — "tell
// this contact X" — and every rule about whether we may do that lives here, so
// no integration can forget one:
//
//   1. The owner switched this message on (Integrations → Automated messages).
//      A payment link sent by hand from the dashboard is the one exception,
//      since a person pressed Send.
//   2. The contact has not opted out. STOP means stop — for order updates too,
//      not only broadcasts (docs/Rules.md §8).
//   3. The account has a WhatsApp connection and messages left on its plan.
//   4. On the Business API, outside WhatsApp's 24-hour window since the
//      contact last wrote, Meta only accepts an approved template. Without one
//      mapped to this message it is skipped with a reason, not sent and
//      rejected.
//
// Every message that goes out is written into the contact's thread, marked
// AUTOMATION, so the inbox shows exactly what the customer received.
//
// Relative .ts imports: this runs inside jobs on the always-on host.

import "server-only";

import type { AutomationKind } from "./generated/prisma/client.ts";
import { db } from "./db.ts";
import { ensureConversationForContact } from "./contacts.ts";
import { checkMessageQuota } from "./usage.ts";
import { connectorFor } from "../whatsapp-connectors/index.ts";

/** How long after a customer's last message free text is still allowed. */
const SERVICE_WINDOW_MS = 24 * 60 * 60_000;

export type AutomationDefinition = {
  kind: AutomationKind;
  label: string;
  description: string;
  /** Where the message comes from, to group the settings screen. */
  group: "Shopify" | "Payments" | "Bookings";
  defaultBody: string;
  /** Placeholders the body may use. */
  placeholders: string[];
  defaultDelayMinutes?: number;
};

export const AUTOMATIONS: AutomationDefinition[] = [
  {
    kind: "ORDER_CONFIRMED",
    group: "Shopify",
    label: "Order confirmed",
    description: "Sent when a new Shopify order comes in.",
    defaultBody:
      "Hi {name}, thanks for your order {order_number}! We've received it and will let you know when it ships. Total: {total}.",
    placeholders: ["name", "order_number", "total", "business_name"],
  },
  {
    kind: "ORDER_PAID",
    group: "Shopify",
    label: "Payment received",
    description: "Sent when a Shopify order is marked paid.",
    defaultBody: "Hi {name}, we've received your payment of {total} for order {order_number}. Thank you!",
    placeholders: ["name", "order_number", "total", "business_name"],
  },
  {
    kind: "ORDER_SHIPPED",
    group: "Shopify",
    label: "Order shipped",
    description: "Sent when a Shopify order is fulfilled, with the tracking link.",
    defaultBody:
      "Good news {name} — order {order_number} is on its way! Track it here: {tracking_url}",
    placeholders: ["name", "order_number", "tracking_url", "tracking_number", "business_name"],
  },
  {
    kind: "ABANDONED_CART",
    group: "Shopify",
    label: "Abandoned cart reminder",
    description:
      "Sent if a checkout isn't completed. Only goes to customers who haven't opted out, and only once per checkout.",
    defaultBody:
      "Hi {name}, you left something in your cart at {business_name}. You can pick up where you left off here: {checkout_url}",
    placeholders: ["name", "checkout_url", "total", "business_name"],
    defaultDelayMinutes: 60,
  },
  {
    kind: "PAYMENT_LINK",
    group: "Payments",
    label: "Payment request",
    description: "The message a payment link is sent in.",
    defaultBody: "Hi {name}, here's your payment link for {description} ({amount}): {payment_link}",
    placeholders: ["name", "description", "amount", "payment_link", "business_name"],
  },
  {
    kind: "PAYMENT_RECEIPT",
    group: "Payments",
    label: "Payment receipt",
    description: "Sent when a payment link is paid, with a link to the receipt.",
    defaultBody: "Thank you {name}! We've received {amount} for {description}. Your receipt: {receipt_url}",
    placeholders: ["name", "description", "amount", "receipt_url", "business_name"],
  },
  {
    kind: "PAYMENT_RETRY",
    group: "Payments",
    label: "Payment failed — try again",
    description: "Sent when a payment fails, with a fresh link.",
    defaultBody:
      "Hi {name}, your payment of {amount} for {description} didn't go through. You can try again here: {payment_link}",
    placeholders: ["name", "description", "amount", "payment_link", "business_name"],
  },
  {
    kind: "REFUND_CONFIRMED",
    group: "Payments",
    label: "Refund confirmed",
    description: "Sent when a refund is processed.",
    defaultBody: "Hi {name}, we've refunded {amount} for {description}. It can take a few days to reach your account.",
    placeholders: ["name", "description", "amount", "business_name"],
  },
  {
    kind: "BOOKING_INVITE",
    group: "Bookings",
    label: "Book a consultation (after an order ships)",
    description: "Sends your booking link after a Shopify order is fulfilled.",
    defaultBody: "Hi {name}, want help getting the most out of your order? Book a free call with us: {booking_url}",
    placeholders: ["name", "booking_url", "business_name"],
  },
  {
    kind: "BOOKING_CONFIRMED",
    group: "Bookings",
    label: "Booking confirmed",
    description: "Sent when someone books through Calendly.",
    defaultBody: "Hi {name}, you're booked for {event_name} on {start_time}. Need to change it? {reschedule_url}",
    placeholders: ["name", "event_name", "start_time", "reschedule_url", "cancel_url", "business_name"],
  },
  {
    kind: "BOOKING_REMINDER",
    group: "Bookings",
    label: "Booking reminder",
    description: "Sent 24 hours and 1 hour before a booking.",
    defaultBody: "Reminder: {event_name} with {business_name} is {when} ({start_time}). See you then!",
    placeholders: ["name", "event_name", "start_time", "when", "business_name"],
  },
];

export function automationDefinition(kind: AutomationKind): AutomationDefinition {
  const found = AUTOMATIONS.find((definition) => definition.kind === kind);

  if (!found) throw new Error(`Unknown automation ${kind}`);

  return found;
}

export function isAutomationKind(value: unknown): value is AutomationKind {
  return AUTOMATIONS.some((definition) => definition.kind === value);
}

/** The owner's setting for one message, or the default (switched off). */
export async function readAutomation(businessId: string, kind: AutomationKind) {
  const saved = await db.automationSetting.findUnique({
    where: { businessId_kind: { businessId, kind } },
    select: {
      enabled: true,
      body: true,
      delayMinutes: true,
      template: {
        select: { metaName: true, metaLanguage: true, approval: true, variables: true },
      },
    },
  });

  const definition = automationDefinition(kind);

  return {
    enabled: saved?.enabled ?? false,
    body: saved?.body ?? definition.defaultBody,
    delayMinutes: saved?.delayMinutes ?? definition.defaultDelayMinutes ?? null,
    template: saved?.template ?? null,
  };
}

/** Every setting, with defaults filled in, for the settings screen. */
export async function listAutomations(businessId: string) {
  const saved = await db.automationSetting.findMany({
    where: { businessId },
    select: { kind: true, enabled: true, body: true, delayMinutes: true, templateId: true },
  });

  const byKind = new Map(saved.map((row) => [row.kind, row]));

  return AUTOMATIONS.map((definition) => {
    const row = byKind.get(definition.kind);

    return {
      ...definition,
      enabled: row?.enabled ?? false,
      body: row?.body ?? definition.defaultBody,
      delayMinutes: row?.delayMinutes ?? definition.defaultDelayMinutes ?? null,
      templateId: row?.templateId ?? null,
    };
  });
}

/** Fills {placeholders}. Unknown ones are left visible rather than guessed. */
export function fillPlaceholders(body: string, values: Record<string, string | null | undefined>) {
  return body.replace(/\{([a-z_]+)\}/g, (whole, key: string) => {
    const value = values[key];

    if (value === undefined) return whole;

    return value?.toString().trim() || (key === "name" ? "there" : "");
  });
}

export type AutomationOutcome =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string }
  /** Our own plumbing is down; the same send is worth trying later. */
  | { status: "retry"; reason: string };

export async function sendAutomatedMessage(input: {
  businessId: string;
  contactId: string;
  kind: AutomationKind;
  variables: Record<string, string | null | undefined>;
  /** Send even if the owner has not switched this message on. */
  manual?: boolean;
}): Promise<AutomationOutcome> {
  const setting = await readAutomation(input.businessId, input.kind);

  if (!setting.enabled && !input.manual) {
    return { status: "skipped", reason: "This automated message is switched off." };
  }

  const contact = await db.contact.findFirst({
    where: { id: input.contactId, businessId: input.businessId },
    select: { id: true, phone: true, name: true, optInStatus: true },
  });

  if (!contact) return { status: "skipped", reason: "The contact no longer exists." };

  if (contact.optInStatus === "OPTED_OUT") {
    return { status: "skipped", reason: "They've opted out of messages." };
  }

  const business = await db.business.findUnique({
    where: { id: input.businessId },
    select: {
      name: true,
      connection: { select: { id: true, type: true, status: true } },
    },
  });

  const connection = business?.connection;

  if (!connection) {
    return { status: "skipped", reason: "No WhatsApp number is connected." };
  }

  const quota = await checkMessageQuota(input.businessId);

  if (!quota.ok) return { status: "skipped", reason: quota.message };

  const values = {
    name: contact.name?.split(/\s+/)[0] ?? null,
    business_name: business?.name ?? "us",
    ...input.variables,
  };
  const text = fillPlaceholders(setting.body, values);

  const conversation = await ensureConversationForContact(input.businessId, contact.id);
  const connector = connectorFor(connection.type);

  let outcome;

  if (connection.type === "API" && !(await inServiceWindow(conversation.id))) {
    const template = setting.template;

    if (!template?.metaName || template.approval !== "APPROVED") {
      return {
        status: "skipped",
        reason:
          "It's been more than 24 hours since they last messaged you, and WhatsApp only allows an approved template then. Pick one for this message under Integrations.",
      };
    }

    outcome = await connector.sendTemplate({
      connectionId: connection.id,
      to: contact.phone,
      templateName: template.metaName,
      languageCode: template.metaLanguage ?? "en_US",
      parameters: template.variables.map((variable) => values[variable as keyof typeof values] ?? ""),
    });
  } else {
    outcome = await connector.sendText({ connectionId: connection.id, to: contact.phone, body: text });
  }

  if (outcome.status === "unavailable") return { status: "retry", reason: outcome.message };

  await db.message.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      author: "AUTOMATION",
      body: text,
      failureReason: outcome.status === "failed" ? outcome.message : null,
      externalId: outcome.status === "sent" ? outcome.messageId : null,
    },
  });

  if (outcome.status === "failed") return { status: "failed", reason: outcome.message };

  await db.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  return { status: "sent" };
}

async function inServiceWindow(conversationId: string): Promise<boolean> {
  const last = await db.message.findFirst({
    where: { conversationId, direction: "INBOUND" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return Boolean(last && Date.now() - last.createdAt.getTime() < SERVICE_WINDOW_MS);
}

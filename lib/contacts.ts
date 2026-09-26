// The CRM contact: one person a business knows, keyed on their phone number.
//
// Conversations, leads, Shopify customers, payment links, bookings and imports
// all arrive at a contact through this file, so "is this the same person?" is
// answered one way everywhere: same business, same digits.
//
// Relative .ts imports: the router and the job runner on the always-on host
// load this under plain Node.

import "server-only";

import { Prisma } from "./generated/prisma/client.ts";
import { db } from "./db.ts";

/** Shortest and longest a real international number can be, in digits. */
const MIN_PHONE_DIGITS = 8;
const MAX_PHONE_DIGITS = 15;

/**
 * Reduces a phone number to the digits WhatsApp addresses people by.
 *
 * Returns null for anything that cannot be one. A number must carry its
 * country code: "98765 43210" could be anywhere, and messaging the wrong
 * country's subscriber is worse than asking the owner to fix the row. The one
 * exception is a `defaultCountryCode`, which a caller may supply when it knows
 * the source (Shopify tells us the store's country).
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultCountryCode?: string | null,
): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/\D/g, "");

  // "00" is the international prefix in much of the world; "+" is implied.
  if (digits.startsWith("00")) digits = digits.slice(2);

  const hadPlus = trimmed.startsWith("+") || trimmed.startsWith("00");

  if (!hadPlus && defaultCountryCode) {
    const code = defaultCountryCode.replace(/\D/g, "");
    // A national number with a leading trunk zero ("09876…") loses it.
    const national = digits.replace(/^0+/, "");

    if (code && !national.startsWith(code)) digits = `${code}${national}`;
    else digits = national;
  }

  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
    return null;
  }

  return digits;
}

export type ContactDetails = {
  name?: string | null;
  email?: string | null;
  shopifyCustomerId?: string | null;
  language?: string | null;
  importBatchId?: string | null;
};

/**
 * Finds or creates the contact for a phone number.
 *
 * Details only ever fill gaps: a name a person typed in the dashboard is not
 * replaced by whatever Shopify or a spreadsheet says, in keeping with the
 * rule that human edits win (docs/Rules.md §5).
 */
export async function upsertContact(
  businessId: string,
  phone: string,
  details: ContactDetails = {},
): Promise<{ id: string; created: boolean }> {
  const clean = cleanDetails(details);

  const existing = await db.contact.findUnique({
    where: { businessId_phone: { businessId, phone } },
    select: {
      id: true,
      name: true,
      email: true,
      shopifyCustomerId: true,
      language: true,
    },
  });

  if (existing) {
    const fill: Prisma.ContactUpdateInput = {};

    if (!existing.name && clean.name) fill.name = clean.name;
    if (!existing.email && clean.email) fill.email = clean.email;
    if (!existing.shopifyCustomerId && clean.shopifyCustomerId) {
      fill.shopifyCustomerId = clean.shopifyCustomerId;
    }
    if (!existing.language && clean.language) fill.language = clean.language;

    if (Object.keys(fill).length > 0) {
      await db.contact.update({ where: { id: existing.id }, data: fill });
    }

    return { id: existing.id, created: false };
  }

  try {
    const created = await db.contact.create({
      data: { businessId, phone, ...clean },
      select: { id: true },
    });

    return { id: created.id, created: true };
  } catch (error) {
    // Two webhooks for the same new customer at once. The unique index lets
    // one win; the other reads the winner's row.
    if (isUniqueViolation(error)) {
      const winner = await db.contact.findUniqueOrThrow({
        where: { businessId_phone: { businessId, phone } },
        select: { id: true },
      });

      return { id: winner.id, created: false };
    }

    throw error;
  }
}

/**
 * Makes sure a conversation points at its contact, creating the contact if
 * this is somebody new. Called by the router on every inbound message, so it
 * is one indexed read in the common case.
 */
export async function linkConversationToContact(conversation: {
  id: string;
  businessId: string;
  contactPhone: string;
  contactName: string | null;
  contactId: string | null;
}): Promise<string> {
  if (conversation.contactId) return conversation.contactId;

  const contact = await upsertContact(conversation.businessId, conversation.contactPhone, {
    name: conversation.contactName,
  });

  await db.conversation.update({
    where: { id: conversation.id },
    data: { contactId: contact.id },
  });

  await db.lead.updateMany({
    where: { conversationId: conversation.id, contactId: null },
    data: { contactId: contact.id },
  });

  return contact.id;
}

/**
 * The conversation for a contact, created if they have never messaged.
 *
 * Anything we send somebody belongs in their thread, including an order
 * confirmation to a Shopify customer who has never written in.
 */
export async function ensureConversationForContact(
  businessId: string,
  contactId: string,
): Promise<{ id: string; contactPhone: string }> {
  const contact = await db.contact.findFirstOrThrow({
    where: { id: contactId, businessId },
    select: { id: true, phone: true, name: true },
  });

  const conversation = await db.conversation.upsert({
    where: { businessId_contactPhone: { businessId, contactPhone: contact.phone } },
    create: {
      businessId,
      contactPhone: contact.phone,
      contactName: contact.name,
      contactId: contact.id,
    },
    update: {},
    select: { id: true, contactPhone: true, contactId: true },
  });

  if (!conversation.contactId) {
    await db.conversation.update({
      where: { id: conversation.id },
      data: { contactId: contact.id },
    });
  }

  return { id: conversation.id, contactPhone: conversation.contactPhone };
}

/**
 * Recomputes a contact's spend and order figures from the rows themselves.
 *
 * Never incremented: a webhook Shopify re-sends, or a payment captured and
 * then reported again, would otherwise count twice. Paid payment links tied to
 * an order are not added on top of that order, for the same reason.
 */
export async function refreshContactTotals(contactId: string): Promise<void> {
  const [orders, looseTotals] = await Promise.all([
    db.order.aggregate({
      where: {
        contactId,
        status: { in: ["PAID", "FULFILLED", "PARTIALLY_REFUNDED"] },
      },
      _sum: { total: true },
      _count: { _all: true },
      _max: { placedAt: true },
    }),
    db.payment.aggregate({
      where: {
        contactId,
        orderId: null,
        status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
      },
      _sum: { amount: true, refundedAmount: true },
      _max: { paidAt: true },
    }),
  ]);

  const fromOrders = orders._sum.total ?? new Prisma.Decimal(0);
  // Payments are in the smallest unit (paise, cents); orders are not.
  const loose = new Prisma.Decimal(
    (looseTotals._sum.amount ?? 0) - (looseTotals._sum.refundedAmount ?? 0),
  ).div(100);

  const lastOrderAt = latest(orders._max.placedAt, looseTotals._max.paidAt);

  await db.contact.update({
    where: { id: contactId },
    data: {
      totalSpent: fromOrders.add(loose),
      orderCount: orders._count._all,
      lastOrderAt,
    },
  });
}

/** Adds tags to a contact, creating any tag that does not exist yet. */
export async function addTagsToContact(
  businessId: string,
  contactId: string,
  names: string[],
  source: "MANUAL" | "RULE" | "IMPORT" | "SHOPIFY" = "MANUAL",
): Promise<void> {
  const clean = [...new Set(names.map((name) => name.trim()).filter(Boolean))].slice(0, 30);

  for (const name of clean) {
    const tag = await db.tag.upsert({
      where: { businessId_name: { businessId, name: name.slice(0, 40) } },
      create: { businessId, name: name.slice(0, 40) },
      update: {},
      select: { id: true },
    });

    await db.contactTag.upsert({
      where: { contactId_tagId: { contactId, tagId: tag.id } },
      create: { contactId, tagId: tag.id, businessId, source },
      // A tag a person added stays theirs even if a rule would also add it.
      update: {},
    });
  }
}

function latest(a: Date | null | undefined, b: Date | null | undefined): Date | null {
  if (!a) return b ?? null;
  if (!b) return a;

  return a > b ? a : b;
}

function cleanDetails(details: ContactDetails) {
  const name = details.name?.trim().slice(0, 120) || null;
  const email = details.email?.trim().toLowerCase().slice(0, 200) || null;

  return {
    ...(name ? { name } : {}),
    ...(email && email.includes("@") ? { email } : {}),
    ...(details.shopifyCustomerId ? { shopifyCustomerId: details.shopifyCustomerId } : {}),
    ...(details.language ? { language: details.language.slice(0, 12) } : {}),
    ...(details.importBatchId ? { importBatchId: details.importBatchId } : {}),
  };
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

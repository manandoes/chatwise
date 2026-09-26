// What happens when Shopify tells us something.
//
// The webhook route (app/api/shopify/webhooks) only checks the signature and
// queues the payload; the job runner calls `processShopifyWebhook` here, well
// outside Shopify's few-second deadline. Everything is written so that the
// same webhook processed twice changes nothing the second time: orders and
// checkouts are upserts on Shopify's own ids, totals are recomputed rather
// than added to, and each WhatsApp message is queued under a dedupe key.
//
// Every query carries the business id taken from the shop row — never
// anything from the payload — so one store's data can only ever land in the
// business that connected it.
//
// Relative .ts imports: runs on the always-on host.

import "server-only";

import type { AutomationKind, OrderStatus, Prisma } from "../../lib/generated/prisma/client.ts";
import { db } from "../../lib/db.ts";
import {
  addTagsToContact,
  normalizePhone,
  refreshContactTotals,
  upsertContact,
} from "../../lib/contacts.ts";
import { setConsent } from "../../lib/consent.ts";
import { callingCodeFor } from "../../lib/country-codes.ts";
import { cancelJobByKey, enqueueJob } from "../../lib/jobs.ts";
import { formatMoney, readAutomation } from "../../lib/automations.ts";
import { evaluateRulesForContact } from "../../lib/tag-rules.ts";
import { upsertShopifyProduct, removeShopifyProduct } from "../../lib/catalog.ts";

export type ShopRow = {
  id: string;
  businessId: string;
  shopDomain: string;
  active: boolean;
};

// Only the fields we read. Shopify sends far more.
type ShopifyAddress = { phone?: string | null; country_code?: string | null; first_name?: string | null; last_name?: string | null };
type ShopifyCustomer = {
  id?: number | string;
  email?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  tags?: string | null;
  default_address?: ShopifyAddress | null;
  accepts_marketing?: boolean;
  sms_marketing_consent?: { state?: string | null } | null;
  email_marketing_consent?: { state?: string | null } | null;
};
type ShopifyFulfillment = {
  tracking_url?: string | null;
  tracking_urls?: string[] | null;
  tracking_number?: string | null;
  tracking_numbers?: string[] | null;
};
export type ShopifyOrder = {
  id: number | string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  total_price?: string | null;
  currency?: string | null;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  cancelled_at?: string | null;
  created_at?: string | null;
  processed_at?: string | null;
  checkout_token?: string | null;
  buyer_accepts_marketing?: boolean;
  customer?: ShopifyCustomer | null;
  billing_address?: ShopifyAddress | null;
  shipping_address?: ShopifyAddress | null;
  fulfillments?: ShopifyFulfillment[] | null;
};
type ShopifyCheckout = {
  token?: string | null;
  id?: number | string;
  email?: string | null;
  phone?: string | null;
  total_price?: string | null;
  currency?: string | null;
  presentment_currency?: string | null;
  abandoned_checkout_url?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  buyer_accepts_marketing?: boolean;
  customer?: ShopifyCustomer | null;
  billing_address?: ShopifyAddress | null;
  shipping_address?: ShopifyAddress | null;
};

export async function processShopifyWebhook(
  shop: ShopRow,
  topic: string,
  payload: Record<string, unknown>,
): Promise<string> {
  switch (topic) {
    case "orders/create":
      return handleOrder(shop, payload as ShopifyOrder, "ORDER_CONFIRMED");
    case "orders/paid":
      return handleOrder(shop, payload as ShopifyOrder, "ORDER_PAID");
    case "orders/fulfilled":
      return handleOrder(shop, payload as ShopifyOrder, "ORDER_SHIPPED");
    case "orders/updated":
    case "orders/cancelled":
      return handleOrder(shop, payload as ShopifyOrder, null);
    case "checkouts/create":
    case "checkouts/update":
      return handleCheckout(shop, payload as ShopifyCheckout);
    case "customers/create":
    case "customers/update":
      return syncCustomer(shop, payload);
    case "products/create":
    case "products/update":
      await upsertShopifyProduct(shop, payload);
      return "product saved";
    case "products/delete":
      await removeShopifyProduct(shop, payload);
      return "product removed";
    default:
      return `ignored topic ${topic}`;
  }
}

// ─── Customers → contacts ───────────────────────────────────────────────────

function nameOf(customer: ShopifyCustomer | null | undefined, address?: ShopifyAddress | null) {
  const first = customer?.first_name ?? address?.first_name ?? "";
  const last = customer?.last_name ?? address?.last_name ?? "";

  return `${first} ${last}`.trim() || null;
}

/** The first usable phone number on anything Shopify gives us. */
function phoneFrom(candidates: (string | null | undefined)[], country: string | null | undefined) {
  const code = callingCodeFor(country);

  for (const candidate of candidates) {
    const phone = normalizePhone(candidate, code);

    if (phone) return phone;
  }

  return null;
}

/**
 * Finds or creates the contact for a Shopify customer, deduped by phone.
 *
 * A customer with no phone number at all cannot be a WhatsApp contact; if we
 * already know them by their Shopify id we still return that contact.
 */
async function contactForCustomer(
  shop: ShopRow,
  customer: ShopifyCustomer | null | undefined,
  extra: { phones?: (string | null | undefined)[]; country?: string | null; email?: string | null; address?: ShopifyAddress | null } = {},
): Promise<string | null> {
  const country = extra.country ?? customer?.default_address?.country_code ?? null;
  const phone = phoneFrom(
    [customer?.phone, ...(extra.phones ?? []), customer?.default_address?.phone],
    country,
  );
  const shopifyCustomerId = customer?.id ? String(customer.id) : null;

  if (!phone) {
    if (!shopifyCustomerId) return null;

    const known = await db.contact.findFirst({
      where: { businessId: shop.businessId, shopifyCustomerId },
      select: { id: true },
    });

    return known?.id ?? null;
  }

  const contact = await upsertContact(shop.businessId, phone, {
    name: nameOf(customer, extra.address),
    email: customer?.email ?? extra.email ?? null,
    shopifyCustomerId,
  });

  return contact.id;
}

/**
 * Carries Shopify's marketing consent across — but only ever upwards from
 * "not asked". A contact who said STOP on WhatsApp stays opted out whatever
 * a checkbox on the store says (docs/Rules.md §8).
 */
async function applyShopifyConsent(businessId: string, contactId: string, accepted: boolean, detail: string) {
  if (!accepted) return;

  const contact = await db.contact.findUnique({ where: { id: contactId }, select: { optInStatus: true } });

  if (contact?.optInStatus !== "PENDING") return;

  await setConsent({ businessId, contactId, to: "OPTED_IN", source: "shopify", detail });
}

/**
 * Saves a Shopify customer as a contact, with their store tags and marketing
 * consent. The import passes `evaluateRules: false` and runs the rules once
 * at the end instead of once per customer.
 */
export async function syncCustomer(
  shop: ShopRow,
  payload: Record<string, unknown>,
  options: { evaluateRules?: boolean } = {},
): Promise<string> {
  const customer = payload as ShopifyCustomer;
  const contactId = await contactForCustomer(shop, customer);

  if (!contactId) return "customer has no phone number";

  const tags = (customer.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);

  if (tags.length > 0) await addTagsToContact(shop.businessId, contactId, tags, "SHOPIFY");

  const accepted =
    customer.sms_marketing_consent?.state === "subscribed" ||
    customer.email_marketing_consent?.state === "subscribed" ||
    customer.accepts_marketing === true;

  await applyShopifyConsent(shop.businessId, contactId, accepted, "customer marketing consent");

  if (options.evaluateRules !== false) await evaluateRulesForContact(shop.businessId, contactId);

  return "contact synced";
}

// ─── Orders ─────────────────────────────────────────────────────────────────

export function orderStatusFrom(order: ShopifyOrder): OrderStatus {
  if (order.cancelled_at) return "CANCELLED";

  switch (order.financial_status) {
    case "refunded":
      return "REFUNDED";
    case "partially_refunded":
      return "PARTIALLY_REFUNDED";
    case "voided":
      return "CANCELLED";
  }

  if (order.fulfillment_status === "fulfilled") return "FULFILLED";
  if (order.financial_status === "paid") return "PAID";

  return "PENDING";
}

function trackingOf(order: ShopifyOrder) {
  for (const fulfillment of order.fulfillments ?? []) {
    const url = fulfillment.tracking_url ?? fulfillment.tracking_urls?.[0] ?? null;
    const number = fulfillment.tracking_number ?? fulfillment.tracking_numbers?.[0] ?? null;

    if (url || number) return { url, number };
  }

  return { url: null, number: null };
}

/** Saves an order. Returns its row, or null when it can't be tied to anybody. */
export async function saveOrder(shop: ShopRow, order: ShopifyOrder) {
  const address = order.shipping_address ?? order.billing_address ?? null;
  const contactId = await contactForCustomer(shop, order.customer, {
    phones: [order.phone, order.shipping_address?.phone, order.billing_address?.phone],
    country: address?.country_code ?? null,
    email: order.email,
    address,
  });

  const status = orderStatusFrom(order);
  const tracking = trackingOf(order);
  const placedAt = order.processed_at ?? order.created_at;
  const now = new Date();

  const data = {
    contactId,
    orderNumber: order.name ?? null,
    status,
    total: order.total_price ?? "0",
    currency: order.currency ?? "INR",
    trackingUrl: tracking.url,
    trackingNumber: tracking.number,
    checkoutToken: order.checkout_token ?? null,
    ...(status === "PAID" || status === "FULFILLED" ? { paidAt: now } : {}),
    ...(status === "FULFILLED" ? { fulfilledAt: now } : {}),
    ...(status === "CANCELLED" ? { cancelledAt: order.cancelled_at ? new Date(order.cancelled_at) : now } : {}),
  } satisfies Partial<Prisma.OrderUncheckedCreateInput>;

  const existing = await db.order.findUnique({
    where: { shopId_shopifyOrderId: { shopId: shop.id, shopifyOrderId: String(order.id) } },
    select: { id: true, paidAt: true, fulfilledAt: true },
  });

  const saved = existing
    ? await db.order.update({
        where: { id: existing.id },
        data: {
          ...data,
          // First time only: a re-sent webhook must not move these.
          paidAt: existing.paidAt ?? ("paidAt" in data ? data.paidAt : undefined),
          fulfilledAt: existing.fulfilledAt ?? ("fulfilledAt" in data ? data.fulfilledAt : undefined),
        },
      })
    : await db.order.create({
        data: {
          ...data,
          businessId: shop.businessId,
          shopId: shop.id,
          shopifyOrderId: String(order.id),
          placedAt: placedAt ? new Date(placedAt) : now,
        },
      });

  // The cart turned into an order: no abandoned-cart message for it.
  if (order.checkout_token) {
    await db.shopifyCheckout.updateMany({
      where: { shopId: shop.id, checkoutToken: order.checkout_token, convertedAt: null },
      data: { convertedAt: now },
    });
    await cancelJobByKey(abandonedCartKey(shop.id, order.checkout_token), "The customer completed the order.");
  }

  if (contactId) {
    await applyShopifyConsent(shop.businessId, contactId, order.buyer_accepts_marketing === true, "accepted marketing at checkout");
    await refreshContactTotals(contactId);
  }

  return saved;
}

async function handleOrder(
  shop: ShopRow,
  order: ShopifyOrder,
  message: AutomationKind | null,
): Promise<string> {
  const saved = await saveOrder(shop, order);

  if (!saved.contactId) return "order saved; no phone number to message";

  await evaluateRulesForContact(shop.businessId, saved.contactId);

  if (!message) return "order saved";

  const variables = {
    order_number: saved.orderNumber ?? "",
    total: formatMoney(saved.total.toString(), saved.currency),
    tracking_url: saved.trackingUrl ?? "",
    tracking_number: saved.trackingNumber ?? "",
  };

  await enqueueJob({
    businessId: shop.businessId,
    shopId: shop.id,
    jobType: "automation.send",
    dedupeKey: `shopify:${message}:${shop.id}:${order.id}`,
    payload: { kind: message, contactId: saved.contactId, variables },
  });

  // After a delivery, invite them to book a consultation, if the owner has
  // switched that on and Calendly is connected.
  if (message === "ORDER_SHIPPED") {
    const calendly = await db.calendlyConnection.findUnique({
      where: { businessId: shop.businessId },
      select: { bookingUrl: true },
    });

    if (calendly) {
      await enqueueJob({
        businessId: shop.businessId,
        shopId: shop.id,
        jobType: "automation.send",
        dedupeKey: `shopify:BOOKING_INVITE:${shop.id}:${order.id}`,
        payload: {
          kind: "BOOKING_INVITE",
          contactId: saved.contactId,
          variables: { booking_url: bookingLinkFor(calendly.bookingUrl, saved.contactId) },
        },
      });
    }
  }

  return `order saved; ${message} queued`;
}

/**
 * The Calendly link with the contact's id in it, so the booking that comes
 * back can be matched to the right person even if they type a different
 * phone number (integrations/calendly/sync.ts).
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

// ─── Checkouts → abandoned-cart reminders ───────────────────────────────────

export function abandonedCartKey(shopId: string, token: string) {
  return `abandoned-cart:${shopId}:${token}`;
}

async function handleCheckout(shop: ShopRow, checkout: ShopifyCheckout): Promise<string> {
  const token = checkout.token ?? (checkout.id ? String(checkout.id) : null);

  if (!token) return "checkout without a token";

  const address = checkout.shipping_address ?? checkout.billing_address ?? null;
  const contactId = await contactForCustomer(shop, checkout.customer, {
    phones: [checkout.phone, checkout.shipping_address?.phone, checkout.billing_address?.phone],
    country: address?.country_code ?? null,
    email: checkout.email,
    address,
  });

  const saved = await db.shopifyCheckout.upsert({
    where: { shopId_checkoutToken: { shopId: shop.id, checkoutToken: token } },
    create: {
      businessId: shop.businessId,
      shopId: shop.id,
      checkoutToken: token,
      contactId,
      phone: checkout.phone ?? null,
      email: checkout.email ?? null,
      total: checkout.total_price ?? "0",
      currency: checkout.presentment_currency ?? checkout.currency ?? "INR",
      recoveryUrl: checkout.abandoned_checkout_url ?? null,
      convertedAt: checkout.completed_at ? new Date(checkout.completed_at) : null,
      createdAt: checkout.created_at ? new Date(checkout.created_at) : undefined,
    },
    update: {
      contactId: contactId ?? undefined,
      total: checkout.total_price ?? undefined,
      recoveryUrl: checkout.abandoned_checkout_url ?? undefined,
      ...(checkout.completed_at ? { convertedAt: new Date(checkout.completed_at) } : {}),
    },
  });

  if (saved.convertedAt) {
    await cancelJobByKey(abandonedCartKey(shop.id, token), "The customer completed the order.");
    return "checkout completed";
  }

  if (!contactId) return "checkout saved; no phone number to remind";

  await applyShopifyConsent(shop.businessId, contactId, checkout.buyer_accepts_marketing === true, "accepted marketing at checkout");

  const setting = await readAutomation(shop.businessId, "ABANDONED_CART");

  if (!setting.enabled) return "checkout saved; abandoned-cart reminders are off";

  // Timed from when the checkout started, so a checkouts/update an hour
  // later does not push the reminder back. The dedupe key means only the
  // first webhook for this checkout queues anything.
  const delayMs = (setting.delayMinutes ?? 60) * 60_000;

  await enqueueJob({
    businessId: shop.businessId,
    shopId: shop.id,
    jobType: "shopify.abandoned_cart",
    dedupeKey: abandonedCartKey(shop.id, token),
    runAt: new Date(saved.createdAt.getTime() + delayMs),
    payload: { checkoutId: saved.id },
  });

  return "checkout saved; reminder scheduled";
}

/**
 * Runs when an abandoned-cart reminder falls due. Checks again that the cart
 * really was abandoned — the order may have arrived by a route that never
 * cancelled this job — and that nobody has been reminded already.
 */
export async function sendAbandonedCartReminder(businessId: string, checkoutId: string) {
  const checkout = await db.shopifyCheckout.findFirst({
    where: { id: checkoutId, businessId },
    select: {
      id: true,
      shopId: true,
      contactId: true,
      convertedAt: true,
      remindedAt: true,
      recoveryUrl: true,
      total: true,
      currency: true,
      checkoutToken: true,
      createdAt: true,
      shop: { select: { active: true } },
    },
  });

  if (!checkout || !checkout.shop.active) return { sent: false, reason: "The store is disconnected." };
  if (checkout.convertedAt) return { sent: false, reason: "They completed the order." };
  if (checkout.remindedAt) return { sent: false, reason: "Already reminded." };
  if (!checkout.contactId) return { sent: false, reason: "No phone number." };

  // An order from the same person since the cart was started counts as
  // converted, even if Shopify didn't link the two.
  const ordered = await db.order.count({
    where: { businessId, contactId: checkout.contactId, placedAt: { gte: checkout.createdAt } },
  });

  if (ordered > 0) return { sent: false, reason: "They placed an order since." };

  const claimed = await db.shopifyCheckout.updateMany({
    where: { id: checkout.id, remindedAt: null },
    data: { remindedAt: new Date() },
  });

  if (claimed.count !== 1) return { sent: false, reason: "Already reminded." };

  await enqueueJob({
    businessId,
    shopId: checkout.shopId,
    jobType: "automation.send",
    dedupeKey: `shopify:ABANDONED_CART:${checkout.shopId}:${checkout.checkoutToken}`,
    payload: {
      kind: "ABANDONED_CART",
      contactId: checkout.contactId,
      variables: {
        checkout_url: checkout.recoveryUrl ?? "",
        total: formatMoney(checkout.total.toString(), checkout.currency),
      },
    },
  });

  return { sent: true, reason: "Reminder queued." };
}

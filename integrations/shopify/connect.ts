// Connecting a Shopify store, keeping it connected, and letting it go.
//
// The pieces, in the order they happen:
//
//   1. `saveConnectedShop` — after the owner approves ChatWise in Shopify
//      (app/api/shopify/callback). Stores the token encrypted and queues the
//      two set-up jobs below. A store can belong to one business only.
//   2. `registerWebhooks` (job `shopify.register_webhooks`) — asks Shopify to
//      tell us about orders, checkouts, customers and products.
//   3. `runBackfillPage` (job `shopify.backfill`) — imports past customers,
//      orders and products one page at a time, each page its own job, so a
//      store with years of orders never holds the job runner for long.
//      Importing never sends anybody a WhatsApp message.
//   4. `deactivateShop` — the store uninstalled us, or the owner pressed
//      Disconnect. Everything queued for the store is cancelled and the token
//      is wiped.
//   5. `handleComplianceRequest` (job `shopify.compliance`) — Shopify's three
//      mandatory privacy requests.
//
// Relative .ts imports: the job runner on the always-on host uses this.

import "server-only";

import { db } from "../../lib/db.ts";
import { encryptText } from "../../lib/encryption.ts";
import { cancelJobsForShop, enqueueJob } from "../../lib/jobs.ts";
import { publicAppUrl } from "../../lib/features.ts";
import { evaluateAllRules } from "../../lib/tag-rules.ts";
import { upsertShopifyProduct } from "../../lib/catalog.ts";
import { ShopifyApiError, shopifyRequest } from "./client.ts";
import { saveOrder, syncCustomer, type ShopRow, type ShopifyOrder } from "./sync.ts";

/** Everything we ask Shopify to tell us about. */
export const SHOPIFY_WEBHOOK_TOPICS = [
  "orders/create",
  "orders/paid",
  "orders/fulfilled",
  "orders/updated",
  "orders/cancelled",
  "checkouts/create",
  "checkouts/update",
  "customers/create",
  "customers/update",
  "products/create",
  "products/update",
  "products/delete",
  "app/uninstalled",
];

/** The three privacy topics every Shopify app must answer. */
export const SHOPIFY_COMPLIANCE_TOPICS = ["customers/data_request", "customers/redact", "shop/redact"];

export function shopifyWebhookAddress(): string {
  return `${publicAppUrl()}/api/shopify/webhooks`;
}

export type SaveShopResult =
  | { ok: true; shopId: string }
  | { ok: false; reason: "owned-elsewhere" | "different-store-connected"; otherDomain?: string };

/**
 * Stores a newly approved store against a business.
 *
 * Refused when the store is already connected to a different ChatWise
 * account — otherwise anyone who could log into a store's admin could pull
 * its customers into a second account — and when this business already has
 * a different store connected.
 */
export async function saveConnectedShop(input: {
  businessId: string;
  shopDomain: string;
  accessToken: string;
  scopes: string;
}): Promise<SaveShopResult> {
  const [byDomain, byBusiness] = await Promise.all([
    db.shop.findUnique({ where: { shopDomain: input.shopDomain }, select: { id: true, businessId: true } }),
    db.shop.findUnique({ where: { businessId: input.businessId }, select: { id: true, shopDomain: true, active: true } }),
  ]);

  if (byDomain && byDomain.businessId !== input.businessId) return { ok: false, reason: "owned-elsewhere" };

  if (byBusiness && byBusiness.shopDomain !== input.shopDomain) {
    if (byBusiness.active) {
      return { ok: false, reason: "different-store-connected", otherDomain: byBusiness.shopDomain };
    }

    // A store this business disconnected earlier. Its orders keep their
    // business but lose the link to a store row that no longer applies.
    await db.shop.delete({ where: { id: byBusiness.id } });
  }

  const now = new Date();
  const data = {
    shopDomain: input.shopDomain,
    accessToken: new Uint8Array(encryptText(input.accessToken)),
    scopes: input.scopes,
    active: true,
    installedAt: now,
    uninstalledAt: null,
    webhookError: null,
    backfillStatus: "Waiting to start",
  };

  const shop = await db.shop.upsert({
    where: { businessId: input.businessId },
    create: { businessId: input.businessId, ...data },
    update: data,
    select: { id: true },
  });

  const runId = String(now.getTime());

  await enqueueJob({
    businessId: input.businessId,
    shopId: shop.id,
    jobType: "shopify.register_webhooks",
    dedupeKey: `shopify.register_webhooks:${shop.id}:${runId}`,
  });
  await enqueueJob({
    businessId: input.businessId,
    shopId: shop.id,
    jobType: "shopify.backfill",
    dedupeKey: `shopify.backfill:${shop.id}:${runId}:customers:1`,
    payload: { runId, stage: "customers", page: 1 },
  });

  return { ok: true, shopId: shop.id };
}

/** The shop row with its token, for a job. Null when it is gone or disconnected. */
export async function loadActiveShop(shopId: string | null) {
  if (!shopId) return null;

  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { id: true, businessId: true, shopDomain: true, active: true, accessToken: true, installedAt: true },
  });

  return shop?.active ? shop : null;
}

/**
 * Marks a store disconnected: cancels everything it queued and wipes the
 * token (Shopify has already revoked it on uninstall; on a manual disconnect
 * we revoke it first). Orders, contacts and products stay — they are the
 * business's own CRM history.
 */
export async function deactivateShop(shopId: string, reason: string): Promise<void> {
  await db.shop.update({
    where: { id: shopId },
    data: {
      active: false,
      uninstalledAt: new Date(),
      accessToken: new Uint8Array(0),
      backfillStatus: reason,
    },
  });

  await cancelJobsForShop(shopId);
}

/** The owner pressed Disconnect. Tells Shopify to revoke the token, best effort. */
export async function disconnectShop(businessId: string): Promise<boolean> {
  const shop = await db.shop.findUnique({
    where: { businessId },
    select: { id: true, shopDomain: true, accessToken: true, active: true },
  });

  if (!shop?.active) return false;

  try {
    await shopifyRequest(shop, "api_permissions/current.json", { method: "DELETE" });
  } catch (error) {
    // Already revoked, or Shopify unreachable. Either way the token is about
    // to be wiped here, so it can no longer be used by us.
    console.error(
      `[shopify] revoking the token for ${shop.shopDomain} failed:`,
      error instanceof ShopifyApiError ? error.status : "error",
    );
  }

  await deactivateShop(shop.id, "Disconnected");

  return true;
}

// ─── Webhook registration ───────────────────────────────────────────────────

type ShopifyWebhook = { id: number; topic: string; address: string };

/**
 * Makes sure Shopify will tell us about everything in SHOPIFY_WEBHOOK_TOPICS.
 * Safe to run again: topics already pointed at us are left alone, and ones
 * pointed at an old address of ours (the app moved) are updated.
 */
export async function registerWebhooks(shopId: string | null): Promise<string> {
  const shop = await loadActiveShop(shopId);

  if (!shop) return "The store is disconnected.";

  const address = shopifyWebhookAddress();

  try {
    const { body } = await shopifyRequest<{ webhooks: ShopifyWebhook[] }>(shop, "webhooks.json", {
      query: { limit: "250" },
    });

    const existing = new Map(body.webhooks.map((hook) => [hook.topic, hook]));

    for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
      const hook = existing.get(topic);

      if (hook?.address === address) continue;

      if (hook) {
        await shopifyRequest(shop, `webhooks/${hook.id}.json`, {
          method: "PUT",
          body: { webhook: { id: hook.id, address } },
        });
      } else {
        await shopifyRequest(shop, "webhooks.json", {
          method: "POST",
          body: { webhook: { topic, address, format: "json" } },
        });
      }
    }

    await db.shop.update({ where: { id: shop.id }, data: { webhooksAt: new Date(), webhookError: null } });

    return `${SHOPIFY_WEBHOOK_TOPICS.length} notifications registered`;
  } catch (error) {
    const message =
      error instanceof ShopifyApiError && (error.status === 401 || error.status === 403)
        ? "Shopify refused — the app may be missing a permission. Try reconnecting the store."
        : "Couldn't reach Shopify to set up notifications. We'll try again.";

    await db.shop.update({ where: { id: shop.id }, data: { webhookError: message } });

    throw new Error(message);
  }
}

// ─── Importing the past ─────────────────────────────────────────────────────

const BACKFILL_STAGES = ["customers", "orders", "products"] as const;
type BackfillStage = (typeof BACKFILL_STAGES)[number];

const STAGE_WORDS: Record<BackfillStage, string> = {
  customers: "customers",
  orders: "orders",
  products: "products",
};

/**
 * Imports one page (up to 250) of one kind of record, then queues the next
 * page — or the next kind, or finishes. Payload: { runId, stage, page, pageInfo }.
 *
 * Every write is an upsert on Shopify's own ids, so a page imported twice
 * (the runner died after writing but before queueing the next) changes
 * nothing the second time.
 */
export async function runBackfillPage(
  shopId: string | null,
  payload: Record<string, unknown>,
): Promise<string> {
  const shop = await loadActiveShop(shopId);

  if (!shop) return "The store is disconnected.";

  const runId = String(payload.runId ?? "");
  const stage = (BACKFILL_STAGES as readonly string[]).includes(String(payload.stage))
    ? (payload.stage as BackfillStage)
    : "customers";
  const page = Number(payload.page) || 1;
  const pageInfo = typeof payload.pageInfo === "string" ? payload.pageInfo : null;

  // A newer connection started its own import; this one is stale.
  if (runId && runId !== String(shop.installedAt.getTime())) return "Superseded by a newer import.";

  const row: ShopRow = { id: shop.id, businessId: shop.businessId, shopDomain: shop.shopDomain, active: true };

  await db.shop.update({
    where: { id: shop.id },
    data: { backfillStatus: `Importing ${STAGE_WORDS[stage]} (page ${page})` },
  });

  // With page_info Shopify allows only `limit` alongside it.
  const query: Record<string, string> = pageInfo
    ? { limit: "250", page_info: pageInfo }
    : { limit: "250", ...(stage === "orders" ? { status: "any" } : {}) };

  const { body, nextPageInfo } = await shopifyRequest<Record<string, Record<string, unknown>[]>>(
    shop,
    `${stage}.json`,
    { query },
  );

  const records = body[stage] ?? [];

  for (const record of records) {
    if (stage === "customers") await syncCustomer(row, record, { evaluateRules: false });
    else if (stage === "orders") await saveOrder(row, record as unknown as ShopifyOrder);
    else await upsertShopifyProduct(row, record);
  }

  const nextStage = nextPageInfo ? stage : BACKFILL_STAGES[BACKFILL_STAGES.indexOf(stage) + 1];

  if (!nextStage) {
    // Tags from rules depend on the whole history, so they run once at the end.
    await evaluateAllRules(shop.businessId);
    await db.shop.update({
      where: { id: shop.id },
      data: { backfillStatus: "Done", backfilledAt: new Date() },
    });

    return `import finished (${records.length} ${stage} on the last page)`;
  }

  const nextPage = nextPageInfo ? page + 1 : 1;

  await enqueueJob({
    businessId: shop.businessId,
    shopId: shop.id,
    jobType: "shopify.backfill",
    dedupeKey: `shopify.backfill:${shop.id}:${runId}:${nextStage}:${nextPage}`,
    payload: { runId, stage: nextStage, page: nextPage, ...(nextPageInfo ? { pageInfo: nextPageInfo } : {}) },
  });

  return `imported ${records.length} ${stage}`;
}

// ─── Privacy requests ───────────────────────────────────────────────────────

/**
 * Carries out one of Shopify's mandatory privacy requests, recorded first by
 * the webhook route as a ComplianceRequest row.
 *
 *   * customers/data_request — collects what we hold on that customer into
 *     the row's `result`, for the merchant to pass on (shown on Integrations).
 *   * customers/redact — erases what came from Shopify about them: their
 *     orders and checkouts from this store, and their email and Shopify id on
 *     the contact. A contact who has also talked to the business on WhatsApp
 *     keeps that conversation — it is the business's own record, not
 *     Shopify's — but a contact known only through Shopify is deleted.
 *   * shop/redact — sent 48 hours after an uninstall: erases everything that
 *     came from the store.
 */
export async function handleComplianceRequest(
  requestId: string,
  /** The Shopify customer the request is about; none for shop/redact. */
  customerId: string | null,
): Promise<string> {
  const request = await db.complianceRequest.findUnique({
    where: { id: requestId },
    select: { id: true, topic: true, shopDomain: true, completedAt: true },
  });

  if (!request) return "request not found";
  if (request.completedAt) return "already handled";

  const shop = await db.shop.findUnique({
    where: { shopDomain: request.shopDomain },
    select: { id: true, businessId: true },
  });

  // Nothing of this store's was ever stored, or it was already erased.
  if (!shop) {
    await db.complianceRequest.update({ where: { id: request.id }, data: { completedAt: new Date() } });
    return "no data held";
  }

  if (request.topic === "shop/redact") {
    await db.$transaction([
      db.order.deleteMany({ where: { shopId: shop.id } }),
      db.product.deleteMany({ where: { businessId: shop.businessId, source: "SHOPIFY" } }),
      db.contact.updateMany({
        where: { businessId: shop.businessId, shopifyCustomerId: { not: null } },
        data: { shopifyCustomerId: null },
      }),
      // Checkouts go with the shop row (cascade).
      db.shop.delete({ where: { id: shop.id } }),
      db.complianceRequest.update({
        where: { id: request.id },
        data: { completedAt: new Date(), result: { erased: "all store data" } },
      }),
    ]);

    return "store data erased";
  }

  const contact = customerId
    ? await db.contact.findFirst({
        where: { businessId: shop.businessId, shopifyCustomerId: customerId },
        select: {
          id: true,
          phone: true,
          name: true,
          email: true,
          optInStatus: true,
          createdAt: true,
          _count: { select: { conversations: true } },
        },
      })
    : null;

  if (request.topic === "customers/data_request") {
    const orders = contact
      ? await db.order.findMany({
          where: { contactId: contact.id, shopId: shop.id },
          select: { orderNumber: true, status: true, total: true, currency: true, placedAt: true },
        })
      : [];

    await db.complianceRequest.update({
      where: { id: request.id },
      data: {
        completedAt: new Date(),
        result: contact
          ? {
              customerId,
              contact: {
                name: contact.name,
                phone: contact.phone,
                email: contact.email,
                consent: contact.optInStatus,
                addedAt: contact.createdAt.toISOString(),
                whatsappConversations: contact._count.conversations,
              },
              orders: orders.map((order) => ({
                ...order,
                total: order.total.toString(),
                placedAt: order.placedAt.toISOString(),
              })),
            }
          : { customerId, contact: null, note: "We hold no data on this customer." },
      },
    });

    return "data collected";
  }

  // customers/redact
  if (contact) {
    await db.$transaction([
      db.order.deleteMany({ where: { contactId: contact.id, shopId: shop.id } }),
      db.shopifyCheckout.deleteMany({ where: { contactId: contact.id, shopId: shop.id } }),
      contact._count.conversations === 0
        ? db.contact.delete({ where: { id: contact.id } })
        : db.contact.update({ where: { id: contact.id }, data: { shopifyCustomerId: null, email: null } }),
    ]);
  }

  await db.complianceRequest.update({
    where: { id: request.id },
    data: { completedAt: new Date(), result: { customerId, erased: Boolean(contact) } },
  });

  return contact ? "customer erased" : "no data held";
}

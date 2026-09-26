// Where every Shopify store tells us something happened.
//
// Public — Shopify can't log in — so the first thing done is checking the
// request was signed with our app secret. Anyone can POST here; only Shopify
// can sign.
//
// Shopify gives us five seconds to answer and retries anything slower, so
// this route does as little as possible: check, dedupe, queue, return 200.
// The job runner does the real work later (integrations/shopify/sync.ts),
// and no WhatsApp message is ever sent from inside this request.
//
// Two topics are handled here rather than queued:
//   * app/uninstalled — the store's token is already dead, so everything
//     still queued for it is cancelled straight away.
//   * the three privacy topics — recorded as a ComplianceRequest first, so
//     there is a durable record of what Shopify asked even if the job that
//     carries it out fails.

import { db } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/features";
import { normalizeShopDomain, verifyWebhook } from "@/integrations/shopify/client";
import { deactivateShop, SHOPIFY_COMPLIANCE_TOPICS } from "@/integrations/shopify/connect";

export const dynamic = "force-dynamic";

function ok() {
  return new Response(null, { status: 200 });
}

export async function POST(request: Request) {
  try {
    // The raw text, before any parsing: the signature covers exactly the
    // bytes Shopify sent.
    const rawBody = await request.text();

    if (!verifyWebhook(rawBody, request.headers.get("x-shopify-hmac-sha256"))) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Signed but switched off here: acknowledge, so Shopify doesn't keep
    // retrying something this installation will never process.
    if (!isFeatureEnabled("shopify")) return ok();

    const topic = request.headers.get("x-shopify-topic") ?? "";
    const shopDomain = normalizeShopDomain(request.headers.get("x-shopify-shop-domain"));
    const webhookId = request.headers.get("x-shopify-webhook-id");

    if (!topic || !shopDomain) return new Response("Bad request", { status: 400 });

    let body: Record<string, unknown>;

    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    const shop = await db.shop.findUnique({
      where: { shopDomain },
      select: { id: true, businessId: true, active: true },
    });

    if (SHOPIFY_COMPLIANCE_TOPICS.includes(topic)) {
      await recordComplianceRequest(topic, shopDomain, shop?.businessId ?? null, webhookId, body);

      return ok();
    }

    // A store we don't know, or one that disconnected: nothing to do.
    if (!shop?.active) return ok();

    if (topic === "app/uninstalled") {
      await deactivateShop(shop.id, "Uninstalled from Shopify");

      return ok();
    }

    // Recording the delivery and queueing its job happen together or not at
    // all: if the queue write failed after the event was recorded, Shopify's
    // retry would be dropped as a duplicate and the order lost.
    await db.$transaction(async (tx) => {
      if (webhookId) {
        const recorded = await tx.integrationEvent.createMany({
          data: [{ provider: "shopify", externalId: `${topic}:${webhookId}`, businessId: shop.businessId, topic }],
          skipDuplicates: true,
        });

        // Already had this one.
        if (recorded.count === 0) return;
      }

      await tx.pendingJob.create({
        data: {
          businessId: shop.businessId,
          shopId: shop.id,
          jobType: "shopify.webhook",
          payload: { topic, body: body as object },
        },
      });
    });

    return ok();
  } catch (error) {
    // A 500 makes Shopify retry later, which is what we want for a database
    // hiccup. The payload is never logged: it holds a customer's details.
    console.error("[shopify/webhooks]", error instanceof Error ? error.message : "error");

    return new Response("Error", { status: 500 });
  }
}

async function recordComplianceRequest(
  topic: string,
  shopDomain: string,
  businessId: string | null,
  webhookId: string | null,
  body: Record<string, unknown>,
) {
  const customer = body.customer as { id?: number | string } | undefined;
  const customerId = customer?.id !== undefined && customer?.id !== null ? String(customer.id) : null;

  // One transaction, for the same reason as ordinary topics above.
  await db.$transaction(async (tx) => {
    if (webhookId) {
      const recorded = await tx.integrationEvent.createMany({
        data: [{ provider: "shopify", externalId: `${topic}:${webhookId}`, businessId, topic }],
        skipDuplicates: true,
      });

      if (recorded.count === 0) return;
    }

    const request = await tx.complianceRequest.create({
      data: { businessId, shopDomain, topic },
      select: { id: true },
    });

    await tx.pendingJob.create({
      data: {
        businessId,
        jobType: "shopify.compliance",
        dedupeKey: `shopify.compliance:${request.id}`,
        payload: { requestId: request.id, customerId },
      },
    });
  });
}

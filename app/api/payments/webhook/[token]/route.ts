// Where a business's own Razorpay or Stripe account reports on its payment
// links.
//
// Each connected account has its own address (the token in the path), so the
// event names its account — and therefore its business and signing secret —
// before anything in it is trusted. Then the signature is checked on the raw
// body, the delivery deduped, a job queued, and 200 returned. Nothing is sent
// to the customer from inside this request.

import { db } from "@/lib/db";
import { decryptText } from "@/lib/encryption";
import { isFeatureEnabled } from "@/lib/features";
import { verifyRazorpayWebhook } from "@/integrations/payments/razorpay";
import { verifyStripeWebhook } from "@/integrations/payments/stripe";

export const dynamic = "force-dynamic";

/** The same answer for every refusal, so a prober learns nothing. */
function refuse() {
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    if (!isFeatureEnabled("paymentLinks")) return refuse();

    const { token } = await context.params;
    const account = await db.paymentAccount.findUnique({
      where: { webhookPathToken: token },
      select: { id: true, businessId: true, provider: true, webhookSecret: true },
    });

    // No secret saved yet: there is no way to tell a real event from a
    // forged one, and an unverifiable event about money is refused.
    if (!account?.webhookSecret?.length) return refuse();

    const rawBody = await request.text();
    const secret = decryptText(Buffer.from(account.webhookSecret));

    const valid =
      account.provider === "RAZORPAY"
        ? verifyRazorpayWebhook(rawBody, request.headers.get("x-razorpay-signature"), secret)
        : verifyStripeWebhook(rawBody, request.headers.get("stripe-signature"), secret);

    if (!valid) return refuse();

    let body: Record<string, unknown>;

    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    const eventId =
      account.provider === "RAZORPAY"
        ? request.headers.get("x-razorpay-event-id")
        : typeof body.id === "string"
          ? body.id
          : null;
    const topic = String((account.provider === "RAZORPAY" ? body.event : body.type) ?? "unknown");

    // Recorded and queued together, or neither (see the Shopify webhook).
    await db.$transaction(async (tx) => {
      if (eventId) {
        const recorded = await tx.integrationEvent.createMany({
          data: [
            {
              provider: account.provider.toLowerCase(),
              externalId: `${account.id}:${eventId}`,
              businessId: account.businessId,
              topic,
            },
          ],
          skipDuplicates: true,
        });

        if (recorded.count === 0) return;
      }

      await tx.pendingJob.create({
        data: {
          businessId: account.businessId,
          jobType: "payments.webhook",
          payload: { accountId: account.id, body: body as object },
        },
      });
    });

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[payments/webhook]", error instanceof Error ? error.message : "error");

    return new Response("Error", { status: 500 });
  }
}

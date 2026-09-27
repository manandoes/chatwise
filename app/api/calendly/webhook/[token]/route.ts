// Where Calendly tells us somebody booked or cancelled.
//
// Each connection has its own address (the token in the path), which names
// the business and its signing key before anything in the body is trusted.
// Then: signature on the raw body, dedupe, queue a job, answer 200. The
// confirmation message is sent by the job, never from inside this request.

import { db } from "@/lib/db";
import { decryptText } from "@/lib/encryption";
import { isFeatureEnabled } from "@/lib/features";
import { verifyCalendlyWebhook } from "@/integrations/calendly/client";

export const dynamic = "force-dynamic";

function refuse() {
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    if (!isFeatureEnabled("calendly")) return refuse();

    const { token } = await context.params;
    const connection = await db.calendlyConnection.findUnique({
      where: { webhookPathToken: token },
      select: { businessId: true, signingKey: true },
    });

    if (!connection?.signingKey?.length) return refuse();

    const rawBody = await request.text();
    const valid = verifyCalendlyWebhook(
      rawBody,
      request.headers.get("calendly-webhook-signature"),
      decryptText(Buffer.from(connection.signingKey)),
    );

    if (!valid) return refuse();

    let body: { event?: unknown; created_at?: unknown; payload?: { uri?: unknown } };

    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    const topic = typeof body.event === "string" ? body.event : "unknown";
    const invitee = typeof body.payload?.uri === "string" ? body.payload.uri : null;

    // Recorded and queued together, or neither (see the Shopify webhook).
    await db.$transaction(async (tx) => {
      if (invitee) {
        const recorded = await tx.integrationEvent.createMany({
          data: [{ provider: "calendly", externalId: `${topic}:${invitee}`, businessId: connection.businessId, topic }],
          skipDuplicates: true,
        });

        if (recorded.count === 0) return;
      }

      await tx.pendingJob.create({
        data: {
          businessId: connection.businessId,
          jobType: "calendly.webhook",
          payload: { body: body as object },
        },
      });
    });

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[calendly/webhook]", error instanceof Error ? error.message : "error");

    return new Response("Error", { status: 500 });
  }
}

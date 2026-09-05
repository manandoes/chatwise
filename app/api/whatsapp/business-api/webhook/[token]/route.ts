// One customer's WhatsApp webhook.
//
// Each customer brings their own Meta app, so each gets their own address here.
// The random segment in the path is what says whose webhook this is — which
// has to be known before anything can be verified, because the signing secret
// belongs to that customer's app rather than to ChatWise.
//
// This route is deliberately public: Meta calls it, so it cannot require a
// login. It defends itself instead.

import { after } from "next/server";

import {
  handleVerifiedPayload,
  isSignatureValid,
  verifySubscription,
} from "@/whatsapp-connectors/business-api/webhook-handler";
import {
  markWebhookVerified,
  readWebhookSecrets,
} from "@/whatsapp-connectors/business-api/credentials";

/**
 * The same answer for "no such webhook" and "wrong token".
 *
 * Somebody probing this shouldn't be able to tell a real customer's address
 * from a made-up one, or learn how close a guessed token was.
 */
function refuse() {
  return new Response("Forbidden", { status: 403 });
}

/** Meta's one-off check that the customer owns this endpoint. */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const secrets = await readWebhookSecrets(token);

    if (!secrets) return refuse();

    const url = new URL(request.url);
    const result = verifySubscription(url.searchParams, secrets.verifyToken);

    if (!result.ok) return refuse();

    await markWebhookVerified(secrets.connectionId);

    // Meta wants the challenge back as plain text, exactly as sent.
    return new Response(result.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("[business-api] webhook verification failed", error);
    return refuse();
  }
}

/** Incoming messages and delivery updates. */
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;

    // The raw bytes, before any parsing: the signature covers exactly what was
    // sent, and re-serialising parsed JSON would change them.
    const rawBody = await request.text();

    const secrets = await readWebhookSecrets(token);
    if (!secrets) return refuse();

    if (
      !isSignatureValid(
        rawBody,
        request.headers.get("x-hub-signature-256"),
        secrets.appSecret,
      )
    ) {
      return refuse();
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      // Signed but unparseable. Accept it so Meta doesn't retry forever.
      return new Response("OK", { status: 200 });
    }

    // Answer Meta first, then do the work.
    //
    // Meta gives a webhook only a few seconds before it decides we are down and
    // starts retrying, and an agent thinking about a reply takes longer than
    // that. `after` runs once the 200 has been sent, so a slow reply can never
    // turn into a retry storm or a duplicated answer to the customer.
    after(async () => {
      try {
        const outcome = await handleVerifiedPayload(payload, {
          connectionId: secrets.connectionId,
          phoneNumberId: secrets.phoneNumberId,
        });

        if (outcome.mismatchedNumbers > 0) {
          console.warn(
            `[business-api] ${outcome.mismatchedNumbers} event(s) for a number this webhook doesn't belong to`,
          );
        }
      } catch (error) {
        console.error("[business-api] could not process a webhook payload", error);
      }
    });

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[business-api] webhook failed", error);

    // Answer 200 anyway. A retry storm from Meta would not fix a bug at our
    // end, and the failure is in the log where it belongs.
    return new Response("OK", { status: 200 });
  }
}

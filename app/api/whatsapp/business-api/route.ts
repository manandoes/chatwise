// Meta's webhook.
//
// This is the only endpoint in ChatWise that is deliberately public. Meta calls
// it, so it cannot require a login — which means it defends itself instead:
//
//   GET  proves we own the endpoint, by echoing a challenge only someone who
//        knows our verify token could answer.
//   POST accepts nothing that isn't signed with our app secret.
//
// Meta sends every customer's messages here, so the payload itself says whose
// they are (see whatsapp-connectors/business-api/webhook-handler.ts).

import {
  handleWebhookPayload,
  isSignatureValid,
  verifyWebhookSubscription,
} from "@/whatsapp-connectors/business-api/webhook-handler";

/** Meta's one-off endpoint check. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = verifyWebhookSubscription(url.searchParams);

  if (!result.ok) {
    // Nothing about *why* — an attacker probing this shouldn't learn whether
    // the token was close.
    return new Response("Forbidden", { status: 403 });
  }

  // Meta wants the challenge back as plain text, exactly as sent.
  return new Response(result.challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

/** Incoming messages and delivery updates. */
export async function POST(request: Request) {
  try {
    // The raw bytes, before any parsing: the signature covers exactly what was
    // sent, and re-serialising parsed JSON would change it.
    const rawBody = await request.text();

    if (!isSignatureValid(rawBody, request.headers.get("x-hub-signature-256"))) {
      return new Response("Forbidden", { status: 403 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      // Signed but unparseable. Accept it so Meta doesn't retry forever.
      return new Response("OK", { status: 200 });
    }

    const outcome = await handleWebhookPayload(payload);

    if (outcome.unknownNumbers > 0) {
      console.warn(
        `[business-api] ${outcome.unknownNumbers} event(s) for a number no account has connected`,
      );
    }

    // Meta retries anything that isn't a 200, so always acknowledge once the
    // payload has been dealt with.
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[business-api] webhook failed", error);

    // Answer 200 anyway. A retry storm from Meta would not fix a bug at our
    // end, and the failure is in the log where it belongs.
    return new Response("OK", { status: 200 });
  }
}

// Send one test message, to prove the connection actually works.
//
// This is a setup aid, not the way the product sends messages. Real replies go
// out through the message router once the bots are wired up (Phase 7), and bulk
// sends have their own rules and limits (Phase 12, docs/Rules.md §8).

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireQrConnection } from "@/lib/whatsapp-connection";
import { connectorFor } from "@/whatsapp-connectors";

/** Long enough for a real test, short enough not to be a broadcast tool. */
const MAX_TEST_MESSAGE_LENGTH = 500;

export async function POST(request: Request) {
  try {
    const found = await requireQrConnection();
    if (!found.ok) return found.response;


    if (found.connection.status !== "CONNECTED") {
      return apiError(
        "Connect your WhatsApp number first, then try sending a test.",
        "VALIDATION_FAILED",
        409,
      );
    }

    const body = (await request.json().catch(() => null)) as {
      to?: unknown;
      body?: unknown;
    } | null;

    const to = String(body?.to ?? "").trim();
    const text = String(body?.body ?? "").trim();

    // Digits only, and long enough to include a country code. A WhatsApp
    // address needs the full international number — a local one silently fails
    // to deliver, which is worse than refusing it here.
    const digits = to.replace(/\D/g, "");

    if (digits.length < 8 || digits.length > 15) {
      return apiError(
        "Enter the full number including the country code, e.g. 919876543210.",
        "VALIDATION_FAILED",
        400,
        { to: "That doesn't look like a full international number." },
      );
    }

    if (!text) {
      return apiError("Write a message to send.", "VALIDATION_FAILED", 400, {
        body: "Write something to send.",
      });
    }

    if (text.length > MAX_TEST_MESSAGE_LENGTH) {
      return apiError(
        `Keep the test message under ${MAX_TEST_MESSAGE_LENGTH} characters.`,
        "VALIDATION_FAILED",
        400,
        { body: "That's too long for a test message." },
      );
    }

    const outcome = await connectorFor("QR").sendText({
      connectionId: found.connection.id,
      to: digits,
      body: text,
    });

    switch (outcome.status) {
      case "failed":
        return apiError(outcome.message, "VALIDATION_FAILED", 400);

      case "unavailable":
        // Redis or the worker host is down. Say so plainly; the real reason is
        // in the server log, not on the customer's screen (docs/Rules.md §4).
        return apiError(outcome.message, "UNEXPECTED_ERROR", 503);

      default:
        // "queued" — the worker has it. Whether it actually arrives comes back
        // separately, through the event queue.
        return Response.json({ sending: true }, { status: 202 });
    }
  } catch (error) {
    return unexpectedError("whatsapp/qr-session/send-test", error);
  }
}

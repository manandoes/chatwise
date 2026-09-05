// Send one test message over the Business API, to prove the connection works.
//
// A setup aid, not how the product sends messages. Real replies go through the
// message router (Phase 7); bulk sends have their own rules (Phase 12).

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiConnection } from "@/lib/whatsapp-connection";
import { connectorFor } from "@/whatsapp-connectors";

const MAX_TEST_MESSAGE_LENGTH = 500;

export async function POST(request: Request) {
  try {
    const found = await requireApiConnection();
    if (!found.ok) return found.response;

    const body = (await request.json().catch(() => null)) as {
      to?: unknown;
      body?: unknown;
    } | null;

    const digits = String(body?.to ?? "").replace(/\D/g, "");
    const text = String(body?.body ?? "").trim();

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

    const outcome = await connectorFor("API").sendText({
      connectionId: found.connection.id,
      to: digits,
      body: text,
    });

    switch (outcome.status) {
      case "sent":
        return Response.json({ sent: true, messageId: outcome.messageId });

      case "failed":
        // Meta's own explanation, already translated into something readable.
        return apiError(outcome.message, "VALIDATION_FAILED", 400);

      case "unavailable":
        return apiError(outcome.message, "UNEXPECTED_ERROR", 503);

      default:
        // "queued" belongs to the free tier, which sends through a worker.
        // This tier calls Meta directly, so it can never land here.
        return apiError(
          "That message couldn't be sent.",
          "UNEXPECTED_ERROR",
          500,
        );
    }
  } catch (error) {
    return unexpectedError("whatsapp/business-api/send-test", error);
  }
}

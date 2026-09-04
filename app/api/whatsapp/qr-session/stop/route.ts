// Disconnect this customer's WhatsApp number.

import { apiError, unexpectedError } from "@/lib/api-response";
import { QueueUnavailableError, requestSessionStop } from "@/whatsapp-connectors/web-qr/session-commands";
import { requireQrConnection } from "@/lib/whatsapp-connection";

export async function POST(request: Request) {
  try {
    const found = await requireQrConnection();
    if (!found.ok) return found.response;


    const body = (await request.json().catch(() => null)) as {
      forget?: unknown;
    } | null;

    // `forget` throws away the saved login, so the next connection starts with
    // a fresh QR code. Anything other than an explicit true is treated as a
    // pause rather than a disconnect.
    await requestSessionStop(found.connection.id, body?.forget === true);

    return Response.json({ stopping: true }, { status: 202 });
  } catch (error) {
    if (error instanceof QueueUnavailableError) {
      // Redis or the worker host is down. Say so plainly; the real reason is
      // in the server log, not on the customer's screen (docs/Rules.md §4).
      console.error("[whatsapp] queue unavailable", error.message);

      return apiError(
        "WhatsApp connections aren't available right now. Please try again shortly.",
        "UNEXPECTED_ERROR",
        503,
      );
    }

    return unexpectedError("whatsapp/qr-session/stop", error);
  }
}

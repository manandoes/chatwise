// Start (or restart) this customer's WhatsApp Web session, which is what
// produces a QR code to scan.

import { apiError, unexpectedError } from "@/lib/api-response";
import { takeFromBudget } from "@/lib/rate-limit";
import { QueueUnavailableError, requestSessionStart } from "@/whatsapp-connectors/web-qr/session-commands";
import { requireQrConnection } from "@/lib/whatsapp-connection";

export async function POST() {
  try {
    const found = await requireQrConnection();
    if (!found.ok) return found.response;

    // Each start spawns a real browser on the worker host, so this one is about
    // that host staying up rather than about abuse (lib/rate-limit.ts).
    const budget = await takeFromBudget("startSession", found.businessId);

    if (!budget.allowed) {
      return apiError(budget.message, "RATE_LIMITED", 429);
    }

    await requestSessionStart(found.connection.id, found.businessId);

    return Response.json({ starting: true }, { status: 202 });
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

    return unexpectedError("whatsapp/qr-session/start", error);
  }
}

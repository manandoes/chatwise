// Connecting or disconnecting Calendly. Owner only.
//
//   POST   { bookingUrl, token? }   save the booking link; with a personal
//                                    access token, also register the webhook
//   DELETE                          disconnect (bookings already made stay)

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { FEATURE_OFF_MESSAGE, isFeatureEnabled } from "@/lib/features";
import { normalizeBookingUrl } from "@/integrations/calendly/client";
import { connectCalendly, disconnectCalendly } from "@/integrations/calendly/sync";

export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    if (!isFeatureEnabled("calendly")) return apiError(FEATURE_OFF_MESSAGE, "NOT_FOUND", 404);

    const body = (await request.json().catch(() => null)) as { bookingUrl?: unknown; token?: unknown } | null;
    const bookingUrl = normalizeBookingUrl(typeof body?.bookingUrl === "string" ? body.bookingUrl : "");

    if (!bookingUrl) {
      const message = "Paste your Calendly booking link, like https://calendly.com/your-name/30min.";

      return apiError(message, "VALIDATION_FAILED", 400, { bookingUrl: message });
    }

    const token = typeof body?.token === "string" && body.token.trim() ? body.token.trim() : null;
    const result = await connectCalendly({ businessId: found.businessId, bookingUrl, token });

    if (!result.ok) {
      return apiError(result.message, "VALIDATION_FAILED", 400, result.field ? { [result.field]: result.message } : undefined);
    }

    return Response.json({ saved: true, webhooks: result.webhooks, note: result.note });
  } catch (error) {
    return unexpectedError("calendly/post", error);
  }
}

export async function DELETE() {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    if (!(await disconnectCalendly(found.businessId))) return apiError("Calendly isn't connected.", "NOT_FOUND", 404);

    return Response.json({ disconnected: true });
  } catch (error) {
    return unexpectedError("calendly/delete", error);
  }
}

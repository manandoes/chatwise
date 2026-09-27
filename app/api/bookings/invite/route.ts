// Sending a contact the booking link on WhatsApp. Any team member.
//
// POST { contactId }
//
// The link carries the contact's id, so the booking that comes back is
// matched to them (integrations/calendly/sync.ts).

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { db } from "@/lib/db";
import { FEATURE_OFF_MESSAGE, isFeatureEnabled } from "@/lib/features";
import { enqueueJob } from "@/lib/jobs";
import { bookingLinkFor } from "@/integrations/calendly/sync";

export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    if (!isFeatureEnabled("calendly")) return apiError(FEATURE_OFF_MESSAGE, "NOT_FOUND", 404);

    const body = (await request.json().catch(() => null)) as { contactId?: unknown } | null;
    const contactId = typeof body?.contactId === "string" ? body.contactId : "";

    const [calendly, contact] = await Promise.all([
      db.calendlyConnection.findUnique({ where: { businessId: found.businessId }, select: { bookingUrl: true } }),
      db.contact.findFirst({ where: { id: contactId, businessId: found.businessId }, select: { id: true, optInStatus: true } }),
    ]);

    if (!calendly) return apiError("Connect Calendly under Integrations first.", "NOT_FOUND", 404);
    if (!contact) return apiError("Choose who to send it to.", "VALIDATION_FAILED", 400, { contactId: "Choose a contact." });

    if (contact.optInStatus === "OPTED_OUT") {
      return apiError("This person has opted out of WhatsApp messages from you.", "VALIDATION_FAILED", 400);
    }

    const link = bookingLinkFor(calendly.bookingUrl, contact.id);

    await enqueueJob({
      businessId: found.businessId,
      jobType: "automation.send",
      payload: { kind: "BOOKING_INVITE", contactId: contact.id, manual: true, variables: { booking_url: link } },
    });

    return Response.json({ queued: true, link });
  } catch (error) {
    return unexpectedError("bookings/invite", error);
  }
}

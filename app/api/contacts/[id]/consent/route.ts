// Changing whether a contact has agreed to hear from the business, by hand.
// Recorded in the consent log with who did it (lib/consent.ts).

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { isOptInStatus, setConsent } from "@/lib/consent";
import { db } from "@/lib/db";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { status?: unknown; note?: unknown } | null;

    if (!isOptInStatus(body?.status)) {
      return apiError("Choose Not asked, Opted in or Opted out.", "VALIDATION_FAILED", 400);
    }

    const contact = await db.contact.findFirst({ where: { id, businessId: found.businessId }, select: { id: true } });

    if (!contact) return apiError("That contact doesn't exist.", "NOT_FOUND", 404);

    await setConsent({
      businessId: found.businessId,
      contactId: contact.id,
      to: body.status,
      source: "dashboard",
      detail: typeof body.note === "string" ? body.note.trim().slice(0, 200) || null : null,
      actorUserId: found.userId,
    });

    return Response.json({ saved: true });
  } catch (error) {
    return unexpectedError("contacts/consent", error);
  }
}

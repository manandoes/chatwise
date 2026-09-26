// Adding a contact by hand. Any team member.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { normalizePhone, updateContactDetails, upsertContact } from "@/lib/contacts";

export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const phone = normalizePhone(typeof body?.phone === "string" ? body.phone : "");

    if (!phone) {
      return apiError("Enter their WhatsApp number with the country code.", "VALIDATION_FAILED", 400, {
        phone: "Include the country code, like +91 98765 43210.",
      });
    }

    const contact = await upsertContact(found.businessId, phone);

    await updateContactDetails(found.businessId, contact.id, {
      ...(typeof body?.name === "string" && body.name.trim() ? { name: body.name } : {}),
      ...(typeof body?.email === "string" && body.email.trim() ? { email: body.email } : {}),
    });

    return Response.json({ id: contact.id, created: contact.created });
  } catch (error) {
    return unexpectedError("contacts/post", error);
  }
}

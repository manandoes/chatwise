// Editing a contact's details. A person's edit overwrites whatever Shopify,
// an import or WhatsApp said (docs/Rules.md §5).

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { updateContactDetails } from "@/lib/contacts";
import { evaluateRulesForContact } from "@/lib/tag-rules";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const email = typeof body?.email === "string" ? body.email.trim() : undefined;

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiError("That email address doesn't look right.", "VALIDATION_FAILED", 400, {
        email: "Check the email address.",
      });
    }

    const updated = await updateContactDetails(found.businessId, id, {
      name: typeof body?.name === "string" ? body.name : undefined,
      email,
      language: typeof body?.language === "string" ? body.language : undefined,
    });

    if (!updated) return apiError("That contact doesn't exist.", "NOT_FOUND", 404);

    await evaluateRulesForContact(found.businessId, id);

    return Response.json({ saved: true });
  } catch (error) {
    return unexpectedError("contacts/patch", error);
  }
}

// Putting a tag on a contact, or taking one off.
//
//   POST   { name }   add (a tag added here is never removed by a rule)
//   DELETE ?name=…    remove

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { addManualTag, removeTag } from "@/lib/contacts";
import { evaluateRulesForContact } from "@/lib/tag-rules";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!name || name.length > 40) {
      return apiError("A tag is 1 to 40 characters.", "VALIDATION_FAILED", 400, { name: "1 to 40 characters." });
    }

    if (!(await addManualTag(found.businessId, id, name))) {
      return apiError("That contact doesn't exist.", "NOT_FOUND", 404);
    }

    // Other rules may depend on this tag ("VIP and no order in 30 days").
    await evaluateRulesForContact(found.businessId, id);

    return Response.json({ saved: true });
  } catch (error) {
    return unexpectedError("contacts/tags/post", error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const { id } = await context.params;
    const name = new URL(request.url).searchParams.get("name") ?? "";

    await removeTag(found.businessId, id, name);
    await evaluateRulesForContact(found.businessId, id);

    return Response.json({ removed: true });
  } catch (error) {
    return unexpectedError("contacts/tags/delete", error);
  }
}

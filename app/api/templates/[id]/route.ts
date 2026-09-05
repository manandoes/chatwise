// Deleting one of the business's saved templates.
//
// Deleting a template never changes a campaign that used it. A campaign keeps
// its own copy of the words it sent (`Campaign.body`), so the record of what
// went out to somebody stays true whatever happens to the template afterwards.

import { deleteTemplate } from "@/campaigns/templates/saved-templates";
import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const found = await requireApiBusiness();

    if (!found.ok) return found.response;

    const { id } = await context.params;

    if (!(await deleteTemplate(found.businessId, id))) {
      return apiError("That template doesn't exist.", "NOT_FOUND", 404);
    }

    return Response.json({ deleted: true });
  } catch (error) {
    return unexpectedError("templates/delete", error);
  }
}

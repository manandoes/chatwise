// Editing or removing one saved reply.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import {
  checkQuickReply,
  deleteQuickReply,
  updateQuickReply,
} from "@/lib/quick-replies";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const found = await requireApiBusiness();

    if (!found.ok) return found.response;

    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const checked = checkQuickReply(body);

    if (!checked.ok) {
      return apiError(checked.message, "VALIDATION_FAILED", 400, checked.fields);
    }

    const done = await updateQuickReply(found.businessId, id, checked.input);

    if (!done) {
      return apiError("That saved reply doesn't exist.", "NOT_FOUND", 404);
    }

    return Response.json({ saved: true });
  } catch (error) {
    return unexpectedError("quick-replies/update", error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const found = await requireApiBusiness();

    if (!found.ok) return found.response;

    const { id } = await context.params;
    const done = await deleteQuickReply(found.businessId, id);

    if (!done) {
      return apiError("That saved reply doesn't exist.", "NOT_FOUND", 404);
    }

    return Response.json({ deleted: true });
  } catch (error) {
    return unexpectedError("quick-replies/delete", error);
  }
}

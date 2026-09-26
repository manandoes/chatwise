// Changing or deleting a saved segment. Campaigns already sent to it keep
// their recipients; their link to the segment is simply cleared.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/contacts";
import { db } from "@/lib/db";
import { parseSegmentFilter } from "@/lib/segments";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { name?: unknown; filter?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : undefined;
    const parsed = body?.filter !== undefined ? parseSegmentFilter(body.filter) : null;

    if (name === "") return apiError("Give the segment a name.", "VALIDATION_FAILED", 400, { name: "Give it a name." });
    if (parsed && !parsed.ok) return apiError(parsed.message, "VALIDATION_FAILED", 400, { filter: parsed.message });

    try {
      const updated = await db.segment.updateMany({
        where: { id, businessId: found.businessId },
        data: { ...(name ? { name } : {}), ...(parsed?.ok ? { filter: parsed.filter } : {}) },
      });

      if (updated.count === 0) return apiError("That segment doesn't exist.", "NOT_FOUND", 404);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return apiError("You already have a segment with that name.", "ALREADY_EXISTS", 409, { name: "Already used." });
      }

      throw error;
    }

    return Response.json({ saved: true });
  } catch (error) {
    return unexpectedError("segments/patch", error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const { id } = await context.params;
    const removed = await db.segment.deleteMany({ where: { id, businessId: found.businessId } });

    if (removed.count === 0) return apiError("That segment doesn't exist.", "NOT_FOUND", 404);

    return Response.json({ removed: true });
  } catch (error) {
    return unexpectedError("segments/delete", error);
  }
}

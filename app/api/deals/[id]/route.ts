// Moving or editing a deal, or deleting it. Every change is logged in the
// deal's activity (lib/deals.ts).

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { db } from "@/lib/db";
import { readDealFields, updateDeal } from "@/lib/deals";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const { id } = await context.params;
    const read = readDealFields((await request.json().catch(() => null)) as Record<string, unknown> | null);

    if (!read.ok) return apiError(read.message, "VALIDATION_FAILED", 400, read.fields);

    const result = await updateDeal(found.businessId, id, found.userId, read.value);

    if (!result.ok) return apiError(result.message, result.field ? "VALIDATION_FAILED" : "NOT_FOUND", result.field ? 400 : 404);

    return Response.json({ saved: true });
  } catch (error) {
    return unexpectedError("deals/patch", error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const { id } = await context.params;
    const removed = await db.deal.deleteMany({ where: { id, businessId: found.businessId } });

    if (removed.count === 0) return apiError("That deal doesn't exist.", "NOT_FOUND", 404);

    return Response.json({ removed: true });
  } catch (error) {
    return unexpectedError("deals/delete", error);
  }
}

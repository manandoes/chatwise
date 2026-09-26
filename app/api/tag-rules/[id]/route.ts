// Switching an auto-tag rule on or off, changing it, or deleting it. Owner
// only. Either way the tags are brought up to date in the background: a rule
// switched off takes back only the tags it added, never a person's.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { db } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs";
import { isEmptyFilter, parseSegmentFilter } from "@/lib/segments";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const parsed = body?.filter !== undefined ? parseSegmentFilter(body.filter) : null;

    if (parsed && !parsed.ok) return apiError(parsed.message, "VALIDATION_FAILED", 400, { filter: parsed.message });
    if (parsed?.ok && isEmptyFilter(parsed.filter)) {
      return apiError("Add at least one condition, or it would tag everyone.", "VALIDATION_FAILED", 400);
    }

    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : undefined;
    const updated = await db.tagRule.updateMany({
      where: { id, businessId: found.businessId },
      data: {
        ...(typeof body?.enabled === "boolean" ? { enabled: body.enabled } : {}),
        ...(name ? { name } : {}),
        ...(parsed?.ok ? { filter: parsed.filter } : {}),
      },
    });

    if (updated.count === 0) return apiError("That rule doesn't exist.", "NOT_FOUND", 404);

    await enqueueJob({ businessId: found.businessId, jobType: "tags.evaluate_rules" });

    return Response.json({ saved: true });
  } catch (error) {
    return unexpectedError("tag-rules/patch", error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    const { id } = await context.params;
    const removed = await db.tagRule.deleteMany({ where: { id, businessId: found.businessId } });

    if (removed.count === 0) return apiError("That rule doesn't exist.", "NOT_FOUND", 404);

    await enqueueJob({ businessId: found.businessId, jobType: "tags.evaluate_rules" });

    return Response.json({ removed: true });
  } catch (error) {
    return unexpectedError("tag-rules/delete", error);
  }
}

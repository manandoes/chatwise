// Pausing, resuming or deleting a scheduled export. Owner only.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { db } from "@/lib/db";
import { nextRunAfter } from "@/integrations/google/sheets";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;

    if (typeof body?.enabled !== "boolean") return apiError("Say whether it should run.", "VALIDATION_FAILED", 400);

    const job = await db.scheduledExport.findFirst({
      where: { id, businessId: found.businessId },
      select: { id: true, nextRunAt: true, frequency: true },
    });

    if (!job) return apiError("That export doesn't exist.", "NOT_FOUND", 404);

    if (body.enabled) {
      const connected = await db.googleConnection.count({ where: { businessId: found.businessId } });

      if (!connected) return apiError("Connect Google Sheets first.", "VALIDATION_FAILED", 400);
    }

    const now = new Date();

    await db.scheduledExport.update({
      where: { id: job.id },
      data: {
        enabled: body.enabled,
        // Resuming after a long pause runs at the next slot, not a backlog.
        ...(body.enabled && job.nextRunAt <= now ? { nextRunAt: nextRunAfter(job.nextRunAt, job.frequency, now) } : {}),
      },
    });

    return Response.json({ saved: true });
  } catch (error) {
    return unexpectedError("sheets/scheduled/patch", error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    const { id } = await context.params;
    const removed = await db.scheduledExport.deleteMany({ where: { id, businessId: found.businessId } });

    if (removed.count === 0) return apiError("That export doesn't exist.", "NOT_FOUND", 404);

    return Response.json({ removed: true });
  } catch (error) {
    return unexpectedError("sheets/scheduled/delete", error);
  }
}

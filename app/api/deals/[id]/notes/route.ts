// Adding a note to a deal's activity log, and reading the log.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { addDealNote, dealActivity } from "@/lib/deals";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const { id } = await context.params;
    const activity = await dealActivity(found.businessId, id);

    return Response.json({ activity });
  } catch (error) {
    return unexpectedError("deals/notes/get", error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { note?: unknown } | null;
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 2000) : "";

    if (!note) return apiError("Write the note first.", "VALIDATION_FAILED", 400, { note: "Write something." });

    if (!(await addDealNote(found.businessId, id, found.userId, note))) {
      return apiError("That deal doesn't exist.", "NOT_FOUND", 404);
    }

    return Response.json({ saved: true });
  } catch (error) {
    return unexpectedError("deals/notes/post", error);
  }
}

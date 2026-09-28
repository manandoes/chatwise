// Notes the team leaves each other on a conversation. Never sent to the
// customer.
//
//   GET                                   every note, oldest first
//   POST { body, mentionedMemberIds? }    add one; the people mentioned are notified

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { db } from "@/lib/db";
import { addTeamNote, listTeamNotes } from "@/lib/team-inbox";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const { id } = await context.params;

    return Response.json({ notes: await listTeamNotes(found.businessId, id) });
  } catch (error) {
    return unexpectedError("conversations/notes/get", error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { body?: unknown; mentionedMemberIds?: unknown } | null;
    const mentioned = Array.isArray(body?.mentionedMemberIds)
      ? body.mentionedMemberIds.filter((value): value is string => typeof value === "string")
      : [];

    const author = await db.user.findUnique({ where: { id: found.userId }, select: { name: true, email: true } });
    const result = await addTeamNote({
      businessId: found.businessId,
      conversationId: id,
      author: { userId: found.userId, name: author?.name?.trim() || author?.email.split("@")[0] || "Someone" },
      body: typeof body?.body === "string" ? body.body : "",
      mentionedMemberIds: mentioned,
    });

    if (!result.ok) {
      return apiError(result.message, result.status === 404 ? "NOT_FOUND" : "VALIDATION_FAILED", result.status);
    }

    return Response.json({ note: result.note });
  } catch (error) {
    return unexpectedError("conversations/notes/post", error);
  }
}

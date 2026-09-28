// Changing one conversation.
//
// Four things can change here:
//
//   { escalated: true }   take it over — the agent stops replying here
//   { escalated: false }  hand it back — the agent carries on
//   { read: true }        somebody has looked at it, clear the "new" count
//   { tags: [...] }       replace this thread's tags
//   { notes: "..." }      save this thread's internal note
//   { assignedTo: id }    hand it to a team member (null: nobody)
//   { priority: "HIGH" }  mark it urgent ("NORMAL" clears it)
//
// The business id comes from the signed-in session and goes into the WHERE
// clause alongside the conversation id, so an id belonging to another account
// matches nothing and changes nothing — there is no separate ownership check
// that could be forgotten (docs/Rules.md §3).

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import {
  checkTags,
  letTheAgentCarryOn,
  markThreadRead,
  takeOverThread,
  updateConversationNotes,
  updateConversationTags,
} from "@/lib/conversations";
import { db } from "@/lib/db";
import { assignConversation, setConversationPriority } from "@/lib/team-inbox";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const found = await requireApiBusiness();

    if (!found.ok) return found.response;

    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      escalated?: unknown;
      read?: unknown;
      tags?: unknown;
      notes?: unknown;
      assignedTo?: unknown;
      priority?: unknown;
    } | null;

    let didSomething = false;
    const result: Record<string, unknown> = {};

    if (body?.read === true) {
      await markThreadRead(found.businessId, id);
      didSomething = true;
      result.read = true;
    }

    if (body?.tags !== undefined) {
      const checked = checkTags(body.tags);

      if (!checked.ok) {
        return apiError(checked.message, "VALIDATION_FAILED", 400);
      }

      const done = await updateConversationTags(found.businessId, id, checked.tags);

      if (!done) {
        return apiError("That conversation doesn't exist.", "NOT_FOUND", 404);
      }

      didSomething = true;
      result.tags = checked.tags;
    }

    if (body?.notes !== undefined) {
      if (typeof body.notes !== "string") {
        return apiError("Notes must be text.", "VALIDATION_FAILED", 400);
      }

      const done = await updateConversationNotes(found.businessId, id, body.notes);

      if (!done) {
        return apiError("That conversation doesn't exist.", "NOT_FOUND", 404);
      }

      didSomething = true;
      result.notes = body.notes.trim() || null;
    }

    if (body?.escalated !== undefined) {
      if (typeof body.escalated !== "boolean") {
        return apiError(
          "Say whether your agent should be answering this conversation or not.",
          "VALIDATION_FAILED",
          400,
        );
      }

      const done = body.escalated
        ? await takeOverThread(found.businessId, id)
        : await letTheAgentCarryOn(found.businessId, id);

      if (!done) {
        return apiError("That conversation doesn't exist.", "NOT_FOUND", 404);
      }

      didSomething = true;
      result.escalated = body.escalated;
    }

    if (body?.assignedTo !== undefined) {
      if (body.assignedTo !== null && typeof body.assignedTo !== "string") {
        return apiError("Choose someone on your team.", "VALIDATION_FAILED", 400);
      }

      const actor = await db.user.findUnique({ where: { id: found.userId }, select: { name: true, email: true } });
      const done = await assignConversation({
        businessId: found.businessId,
        conversationId: id,
        memberId: body.assignedTo || null,
        actor: { userId: found.userId, name: actor?.name?.trim() || actor?.email.split("@")[0] || "Someone" },
      });

      if (!done.ok) {
        return apiError(done.message, done.status === 404 ? "NOT_FOUND" : "VALIDATION_FAILED", done.status);
      }

      didSomething = true;
      result.assignedTo = body.assignedTo || null;
    }

    if (body?.priority !== undefined) {
      if (body.priority !== "HIGH" && body.priority !== "NORMAL") {
        return apiError("Mark it urgent, or not.", "VALIDATION_FAILED", 400);
      }

      if (!(await setConversationPriority(found.businessId, id, body.priority))) {
        return apiError("That conversation doesn't exist.", "NOT_FOUND", 404);
      }

      didSomething = true;
      result.priority = body.priority;
    }

    if (!didSomething) {
      return apiError("There was nothing to change.", "VALIDATION_FAILED", 400);
    }

    return Response.json(result);
  } catch (error) {
    return unexpectedError("conversations/patch", error);
  }
}

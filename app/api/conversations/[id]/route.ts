// Changing one conversation.
//
// Three things can change, and all three are about the same question: who is
// answering this thread, the agent or a person?
//
//   { escalated: true }   take it over — the agent stops replying here
//   { escalated: false }  hand it back — the agent carries on
//   { read: true }        somebody has looked at it, clear the "new" count
//
// The business id comes from the signed-in session and goes into the WHERE
// clause alongside the conversation id, so an id belonging to another account
// matches nothing and changes nothing — there is no separate ownership check
// that could be forgotten (docs/Rules.md §3).

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import {
  letTheAgentCarryOn,
  markThreadRead,
  takeOverThread,
} from "@/lib/conversations";

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
    } | null;

    if (body?.read === true) {
      await markThreadRead(found.businessId, id);
    }

    if (body?.escalated === undefined) {
      // Marking it read on its own is a complete request.
      if (body?.read === true) return Response.json({ read: true });

      return apiError(
        "There was nothing to change.",
        "VALIDATION_FAILED",
        400,
      );
    }

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

    return Response.json({ escalated: body.escalated });
  } catch (error) {
    return unexpectedError("conversations/patch", error);
  }
}

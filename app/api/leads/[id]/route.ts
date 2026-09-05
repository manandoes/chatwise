// Saving a lead somebody edited by hand.
//
// The one thing worth knowing about this route: saving here does more than
// change the record. Every field on the form is one the background CRM agent
// could also write, so whatever a person actually changes becomes theirs, and
// the agent stops touching it (docs/Rules.md §5). That bookkeeping lives in
// lib/leads.ts, next to the agent's own writes, because they are two halves of
// the same rule.
//
// The business id comes from the signed-in session and goes into the WHERE
// clause alongside the lead id, so another account's lead matches nothing and
// changes nothing (docs/Rules.md §3).

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { applyHumanEdit } from "@/lib/leads";
import { validateLeadEdit, type LeadEditInput } from "@/lib/validation/leads";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const found = await requireApiBusiness();

    if (!found.ok) return found.response;

    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as Partial<
      Record<keyof LeadEditInput, unknown>
    > | null;

    // The browser checked this too, for quick feedback. The server checks it
    // again because the browser's verdict is not evidence (docs/Rules.md §3).
    const checked = validateLeadEdit({
      name: asText(body?.name),
      email: asText(body?.email),
      status: asText(body?.status),
      score: asText(body?.score),
      tags: asText(body?.tags),
      summary: asText(body?.summary),
      nextStep: asText(body?.nextStep),
      notes: asText(body?.notes),
      letTheAgentUpdateThis: body?.letTheAgentUpdateThis === true,
    });

    if (!checked.ok) {
      return apiError(
        "Some of that needs fixing.",
        "VALIDATION_FAILED",
        400,
        checked.errors,
      );
    }

    const saved = await applyHumanEdit({
      businessId: found.businessId,
      id,
      edit: checked.edit,
    });

    if (!saved.ok) {
      return apiError("That lead doesn't exist.", "NOT_FOUND", 404);
    }

    // `claimed` is what the screen tells the person afterwards: these are the
    // fields their agent will now leave alone.
    return Response.json({ saved: true, claimed: saved.claimed });
  } catch (error) {
    return unexpectedError("leads/patch", error);
  }
}

/** Anything that isn't a string was not typed into the form. */
function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

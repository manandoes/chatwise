// Saving the business's knowledge base.
//
// The whole list is sent and the whole list is replaced — see
// lib/knowledge-base.ts for why. The business is always looked up from the
// signed-in user, never taken from the request, so there is no id here for
// anyone to change (docs/Rules.md §3).

import { apiError, unexpectedError } from "@/lib/api-response";
import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { replaceEntries, validateEntries } from "@/lib/knowledge-base";
import { checkKnowledgeQuota } from "@/lib/usage";

export async function PUT(request: Request) {
  try {
    const user = await getApiUser();

    if (!user) {
      return apiError("Please sign in again.", "NOT_AUTHENTICATED", 401);
    }

    const business = await db.business.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!business) {
      return apiError(
        "Finish setting up your account first.",
        "NOT_FOUND",
        404,
      );
    }

    const body = (await request.json().catch(() => null)) as {
      entries?: unknown;
    } | null;

    const checked = validateEntries(body?.entries);

    if (!checked.ok) {
      return apiError(
        checked.message,
        "VALIDATION_FAILED",
        400,
        checked.fields,
      );
    }

    // How many answers the plan includes (lib/plans.ts). Checked after the list
    // is known to be valid, so somebody over their limit is told about the
    // limit rather than about a blank question box.
    const quota = await checkKnowledgeQuota(business.id, checked.entries.length);

    if (!quota.ok) {
      return apiError(quota.message, "NOT_AUTHORIZED", 403);
    }

    await replaceEntries(business.id, checked.entries);

    return Response.json({ saved: true, count: checked.entries.length });
  } catch (error) {
    return unexpectedError("knowledge-base", error);
  }
}

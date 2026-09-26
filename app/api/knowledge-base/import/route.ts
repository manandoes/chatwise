// Reading a file of example conversations into suggested Knowledge Base rows.
//
// This never saves anything — it only returns the pairs it found, the same
// way a hand-typed row starts life in the editor's own state. The owner still
// has to press Save on the existing PUT /api/knowledge-base route, which is
// what actually checks quota and writes the database (docs/Rules.md §3: the
// business is always looked up from the signed-in user, never from the request).

import { readGeminiApiKey } from "@/lib/ai-credentials";
import { apiError, unexpectedError } from "@/lib/api-response";
import { getApiUser } from "@/lib/auth";
import { findMembership } from "@/lib/team";
import { parseUploadedKnowledge } from "@/lib/knowledge-import";

export async function POST(request: Request) {
  try {
    const user = await getApiUser();

    if (!user) {
      return apiError("Please sign in again.", "NOT_AUTHENTICATED", 401);
    }

    // Through the team membership, so team members edit the knowledge base
    // of the business they work in (lib/team.ts).
    const membership = await findMembership(user.id);
    const business = membership ? { id: membership.businessId } : null;

    if (!business) {
      return apiError(
        "Finish setting up your account first.",
        "NOT_FOUND",
        404,
      );
    }

    const formData = await request.formData().catch(() => null);
    const file = formData?.get("file");

    if (!file || typeof file === "string") {
      return apiError("Choose a file to import.", "VALIDATION_FAILED", 400);
    }

    // Reading the file costs a model call, so it goes on this business's own
    // key where they have set one — the same key their agents answer on.
    const result = await parseUploadedKnowledge(
      file,
      await readGeminiApiKey(business.id),
    );

    if (!result.ok) {
      return apiError(result.message, "VALIDATION_FAILED", 400);
    }

    return Response.json({ entries: result.entries, skipped: result.skipped });
  } catch (error) {
    return unexpectedError("knowledge-base-import", error);
  }
}

// Extracting persona fields from an uploaded business document.
//
// This route never saves anything — it only returns the fields it found so the
// form can show a preview. The owner still has to press Save on the main
// /api/agents route to persist any changes (lib/team.ts: the business is looked
// up from the signed-in user, never from the request body).

import { readGeminiApiKey } from "@/lib/ai-credentials";
import { apiError, unexpectedError } from "@/lib/api-response";
import { getApiUser } from "@/lib/auth";
import { findMembership } from "@/lib/team";
import { extractPersonaFromDocument } from "@/lib/agent-persona-extract";

export async function POST(request: Request) {
  try {
    const user = await getApiUser();

    if (!user) {
      return apiError("Please sign in again.", "NOT_AUTHENTICATED", 401);
    }

    const membership = await findMembership(user.id);
    const business = membership ? { id: membership.businessId } : null;

    if (!business) {
      return apiError("Finish setting up your account first.", "NOT_FOUND", 404);
    }

    const formData = await request.formData().catch(() => null);
    const file = formData?.get("file");

    if (!file || typeof file === "string") {
      return apiError("Choose a PDF file to upload.", "VALIDATION_FAILED", 400);
    }

    // The same business-scoped key the knowledge-base import uses.
    const apiKey = await readGeminiApiKey(business.id);

    const result = await extractPersonaFromDocument(file, apiKey);

    if (!result.ok) {
      return apiError(result.message, "VALIDATION_FAILED", 400);
    }

    return Response.json({ persona: result.persona });
  } catch (error) {
    return unexpectedError("persona-extract", error);
  }
}

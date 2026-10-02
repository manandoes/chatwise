// Submit one saved template to Meta for approval.

import { submitTemplateToMeta } from "@/campaigns/templates/request-meta";
import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const templateId = typeof body?.templateId === "string" ? body.templateId : null;

    if (!templateId) return apiError("Which template should we submit?", "VALIDATION_FAILED", 400);

    const result = await submitTemplateToMeta(templateId);

    if (!result.ok) {
      return apiError(result.message, "VALIDATION_FAILED", 400);
    }

    return Response.json({ submitted: true, metaTemplateId: result.metaTemplateId, status: result.status });
  } catch (error) {
    return unexpectedError("templates/submit", error);
  }
}

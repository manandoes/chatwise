// Adding a deal to the pipeline board. Any team member.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { createDeal, isDealStage, readDealFields } from "@/lib/deals";

export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const read = readDealFields(body);

    if (!read.ok) return apiError(read.message, "VALIDATION_FAILED", 400, read.fields);

    const title = read.value.title ?? "";
    const contactId = typeof body?.contactId === "string" ? body.contactId : "";

    if (!title) return apiError("Give the deal a title.", "VALIDATION_FAILED", 400, { title: "Give it a title." });
    if (!contactId) return apiError("Choose who the deal is with.", "VALIDATION_FAILED", 400, { contactId: "Choose a contact." });

    const result = await createDeal(found.businessId, found.userId, {
      ...read.value,
      title,
      contactId,
      stage: isDealStage(body?.stage) ? body.stage : "LEAD",
    });

    if (!result.ok) {
      return apiError(result.message, "VALIDATION_FAILED", 400, result.field ? { [result.field]: result.message } : undefined);
    }

    return Response.json({ id: result.id });
  } catch (error) {
    return unexpectedError("deals/post", error);
  }
}

// "Check with Meta": reads every template's real approval status from the
// account's WhatsApp Business Account, and brings in approved ones not saved
// here yet (campaigns/templates/meta-sync.ts).

import { syncTemplatesFromMeta } from "@/campaigns/templates/meta-sync";
import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";

export async function POST() {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const result = await syncTemplatesFromMeta(found.businessId);

    if (!result.ok) return apiError(result.message, "VALIDATION_FAILED", 400);

    return Response.json(result);
  } catch (error) {
    return unexpectedError("templates/sync", error);
  }
}

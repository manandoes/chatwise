// Undoing an import. Owner only. Removes the contacts it created unless
// they've been used since (integrations/google/sheets.ts explains which stay).

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { rollbackImport } from "@/integrations/google/sheets";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    const { id } = await context.params;
    const result = await rollbackImport(found.businessId, id);

    if (!result.ok) return apiError(result.message, "VALIDATION_FAILED", 400);

    return Response.json({ removed: result.removed, kept: result.kept });
  } catch (error) {
    return unexpectedError("sheets/import/rollback", error);
  }
}

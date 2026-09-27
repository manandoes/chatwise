// Step one of an import: read the sheet's header and first rows, and guess
// which column is which. Nothing is saved. Owner only.
//
// POST { spreadsheet, sheetName? }

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { FEATURE_OFF_MESSAGE, isFeatureEnabled } from "@/lib/features";
import { spreadsheetIdFrom } from "@/integrations/google/client";
import { previewImport } from "@/integrations/google/sheets";

export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    if (!isFeatureEnabled("googleSheets")) return apiError(FEATURE_OFF_MESSAGE, "NOT_FOUND", 404);

    const body = (await request.json().catch(() => null)) as { spreadsheet?: unknown; sheetName?: unknown } | null;
    const spreadsheetId = typeof body?.spreadsheet === "string" ? spreadsheetIdFrom(body.spreadsheet) : null;

    if (!spreadsheetId) {
      const message = "Paste the spreadsheet's link from your browser's address bar.";

      return apiError(message, "VALIDATION_FAILED", 400, { spreadsheet: message });
    }

    const sheetName = typeof body?.sheetName === "string" && body.sheetName.trim() ? body.sheetName.trim() : null;
    const preview = await previewImport(found.businessId, spreadsheetId, sheetName);

    if (!preview.ok) return apiError(preview.message, "VALIDATION_FAILED", 400);

    return Response.json({ spreadsheetId, ...preview.value });
  } catch (error) {
    return unexpectedError("sheets/import/preview", error);
  }
}

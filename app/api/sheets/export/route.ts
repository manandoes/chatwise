// Exporting contacts to Google Sheets now. Owner only: an export is every
// contact's details leaving ChatWise.
//
// POST { spreadsheet?: link or id (blank = new spreadsheet), sheetName?, segmentId?, mode? }

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { FEATURE_OFF_MESSAGE, isFeatureEnabled } from "@/lib/features";
import { spreadsheetUrl } from "@/integrations/google/client";
import { exportContacts, readSheetTarget } from "@/integrations/google/sheets";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    if (!isFeatureEnabled("googleSheets")) return apiError(FEATURE_OFF_MESSAGE, "NOT_FOUND", 404);

    const target = readSheetTarget((await request.json().catch(() => null)) as Record<string, unknown> | null);

    if (!target.ok) return apiError(target.message, "VALIDATION_FAILED", 400, target.fields);

    const result = await exportContacts({ businessId: found.businessId, ...target.value });

    if (!result.ok) return apiError(result.message, "VALIDATION_FAILED", 400);

    return Response.json({ rows: result.value.rows, url: spreadsheetUrl(result.value.spreadsheetId) });
  } catch (error) {
    return unexpectedError("sheets/export", error);
  }
}

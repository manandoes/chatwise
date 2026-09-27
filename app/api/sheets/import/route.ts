// Step two of an import: the owner confirmed which column is which, so the
// import is recorded as a batch and queued. Owner only.
//
// POST { spreadsheetId, sheetName, mapping: { phone, name?, email?, tags?,
//        language?, consent? }, defaultCountryCode? }
//
// Column numbers start at 0. The job re-reads the sheet when it runs, so the
// import reflects the sheet at that moment.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { db } from "@/lib/db";
import { FEATURE_OFF_MESSAGE, isFeatureEnabled } from "@/lib/features";
import { spreadsheetIdFrom } from "@/integrations/google/client";
import { startImport, type ColumnMapping } from "@/integrations/google/sheets";

const OPTIONAL_COLUMNS = ["name", "email", "tags", "language", "consent"] as const;

function column(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;

  const number = Number(value);

  return Number.isInteger(number) && number >= 0 && number < 200 ? number : "invalid";
}

export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    if (!isFeatureEnabled("googleSheets")) return apiError(FEATURE_OFF_MESSAGE, "NOT_FOUND", 404);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const spreadsheetId = typeof body?.spreadsheetId === "string" ? spreadsheetIdFrom(body.spreadsheetId) : null;
    const sheetName = typeof body?.sheetName === "string" ? body.sheetName.trim().slice(0, 90) : "";
    const raw = (body?.mapping ?? {}) as Record<string, unknown>;

    if (!spreadsheetId || !sheetName) return apiError("Preview the sheet first.", "VALIDATION_FAILED", 400);

    const phone = column(raw.phone);

    if (phone === null || phone === "invalid") {
      return apiError("Choose which column has the phone numbers.", "VALIDATION_FAILED", 400, {
        phone: "Choose the phone column.",
      });
    }

    const mapping: ColumnMapping = { phone };

    for (const key of OPTIONAL_COLUMNS) {
      const value = column(raw[key]);

      if (value === "invalid") return apiError("One of the columns chosen isn't valid.", "VALIDATION_FAILED", 400);

      mapping[key] = value;
    }

    const code = typeof body?.defaultCountryCode === "string" ? body.defaultCountryCode.replace(/\D/g, "") : "";

    if (code && (code.length > 4 || code.startsWith("0"))) {
      return apiError("A country code is 1 to 4 digits, like 91 or 44.", "VALIDATION_FAILED", 400, {
        defaultCountryCode: "1 to 4 digits, like 91.",
      });
    }

    const running = await db.importBatch.count({ where: { businessId: found.businessId, status: "PROCESSING" } });

    if (running > 0) {
      return apiError("An import is already running. Wait for it to finish first.", "VALIDATION_FAILED", 409);
    }

    const batchId = await startImport({
      businessId: found.businessId,
      userId: found.userId,
      spreadsheetId,
      sheetName,
      mapping,
      defaultCountryCode: code || null,
    });

    return Response.json({ batchId });
  } catch (error) {
    return unexpectedError("sheets/import/post", error);
  }
}

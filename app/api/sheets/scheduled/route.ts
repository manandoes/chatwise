// Setting up an export that runs on its own, daily or weekly. Owner only.
//
// POST { spreadsheet?, sheetName?, segmentId?, mode?, frequency }
//
// The first export runs straight away, so a spreadsheet the connected Google
// account can't open is reported now rather than failing quietly overnight.
// A blank spreadsheet link makes a new spreadsheet, which later runs reuse.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { db } from "@/lib/db";
import { FEATURE_OFF_MESSAGE, isFeatureEnabled } from "@/lib/features";
import { spreadsheetUrl } from "@/integrations/google/client";
import { exportContacts, nextRunAfter, readSheetTarget } from "@/integrations/google/sheets";

export const maxDuration = 60;

/** How many scheduled exports one account may keep. */
const MAX_SCHEDULED = 10;

export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    if (!isFeatureEnabled("googleSheets")) return apiError(FEATURE_OFF_MESSAGE, "NOT_FOUND", 404);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const target = readSheetTarget(body);

    if (!target.ok) return apiError(target.message, "VALIDATION_FAILED", 400, target.fields);

    const frequency = body?.frequency === "WEEKLY" ? "WEEKLY" : body?.frequency === "DAILY" ? "DAILY" : null;

    if (!frequency) {
      return apiError("Choose daily or weekly.", "VALIDATION_FAILED", 400, { frequency: "Choose daily or weekly." });
    }

    // Checked here as well as when it runs, so another account's segment id
    // is never stored against this one.
    if (target.value.segmentId) {
      const segment = await db.segment.findFirst({
        where: { id: target.value.segmentId, businessId: found.businessId },
        select: { id: true },
      });

      if (!segment) return apiError("That segment doesn't exist.", "NOT_FOUND", 404);
    }

    const existing = await db.scheduledExport.count({ where: { businessId: found.businessId } });

    if (existing >= MAX_SCHEDULED) {
      return apiError(`You can keep up to ${MAX_SCHEDULED} scheduled exports. Delete one first.`, "VALIDATION_FAILED", 400);
    }

    const first = await exportContacts({ businessId: found.businessId, ...target.value });

    if (!first.ok) return apiError(first.message, "VALIDATION_FAILED", 400);

    const now = new Date();
    const scheduled = await db.scheduledExport.create({
      data: {
        businessId: found.businessId,
        spreadsheetId: first.value.spreadsheetId,
        sheetName: target.value.sheetName,
        segmentId: target.value.segmentId,
        frequency,
        mode: target.value.mode,
        lastRunAt: now,
        nextRunAt: nextRunAfter(now, frequency, now),
      },
      select: { id: true },
    });

    return Response.json({ id: scheduled.id, rows: first.value.rows, url: spreadsheetUrl(first.value.spreadsheetId) });
  } catch (error) {
    return unexpectedError("sheets/scheduled/post", error);
  }
}

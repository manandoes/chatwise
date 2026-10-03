// Toggle Google Drive auto-backup for conversations.
// Owner only. Requires Google Sheets to be connected and the feature flag enabled.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { db } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/features";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    if (!isFeatureEnabled("googleDriveBackup")) {
      return apiError("Google Drive backup is not enabled on this installation.", "NOT_FOUND", 404);
    }

    const { enabled } = await request.json().catch(() => ({ enabled: false }));

    if (typeof enabled !== "boolean") {
      return apiError("Expected { enabled: boolean }", "VALIDATION_FAILED", 400);
    }

    const business = await db.business.findUnique({
      where: { id: found.businessId },
      select: { autoBackupToDrive: true, google: { select: { id: true } } },
    });

    if (!business) {
      return apiError("Business not found.", "NOT_FOUND", 404);
    }

    if (enabled && !business.google) {
      return apiError("Connect Google Sheets first under Integrations.", "NOT_FOUND", 404);
    }

    await db.business.update({
      where: { id: found.businessId },
      data: { autoBackupToDrive: enabled },
    });

    return Response.json({ ok: true, autoBackupToDrive: enabled });
  } catch (error) {
    return unexpectedError("settings/drive-backup", error);
  }
}
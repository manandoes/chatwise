// Disconnects Google Sheets. Owner only. Scheduled exports are switched off
// (not deleted), so reconnecting can turn them back on.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptText } from "@/lib/encryption";
import { forgetAccessToken, revokeGoogleToken } from "@/integrations/google/client";

export async function POST() {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    const connection = await db.googleConnection.findUnique({
      where: { businessId: found.businessId },
      select: { refreshToken: true },
    });

    if (!connection) return apiError("Google Sheets isn't connected.", "NOT_FOUND", 404);

    await revokeGoogleToken(decryptText(Buffer.from(connection.refreshToken)));
    await db.$transaction([
      db.googleConnection.delete({ where: { businessId: found.businessId } }),
      db.scheduledExport.updateMany({ where: { businessId: found.businessId }, data: { enabled: false } }),
    ]);
    forgetAccessToken(found.businessId);

    return Response.json({ disconnected: true });
  } catch (error) {
    return unexpectedError("google/disconnect", error);
  }
}

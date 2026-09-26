// Withdrawing an invitation before it is used. Owner only.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    const { id } = await context.params;

    const revoked = await db.teamInvite.updateMany({
      where: { id, businessId: found.businessId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (revoked.count === 0) return apiError("That invitation doesn't exist.", "NOT_FOUND", 404);

    return Response.json({ revoked: true });
  } catch (error) {
    return unexpectedError("team/invites/delete", error);
  }
}

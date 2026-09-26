// The team: who works in this business, and (for the owner) who has been
// invited. Everyone in the team may see the list — it is what the inbox's
// assignment menu and @mentions are built from.

import { unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { db } from "@/lib/db";
import { listMembers } from "@/lib/team";

export async function GET() {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const members = await listMembers(found.businessId);

    const invites =
      found.role === "OWNER"
        ? await db.teamInvite.findMany({
            where: {
              businessId: found.businessId,
              acceptedAt: null,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: "desc" },
            select: { id: true, email: true, role: true, expiresAt: true },
          })
        : [];

    return Response.json({ members, invites, you: found.memberId, role: found.role });
  } catch (error) {
    return unexpectedError("team/get", error);
  }
}

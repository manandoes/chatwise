// Changing a team member's role, or removing them. Owner only.
//
// The person who created the account can be neither demoted nor removed: the
// business row still names them as its owner, and billing is theirs.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { db } from "@/lib/db";
import { isMemberRole } from "@/lib/team";

async function findMember(businessId: string, id: string) {
  return db.businessMember.findFirst({
    where: { id, businessId },
    select: { id: true, userId: true, business: { select: { userId: true } } },
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { role?: unknown } | null;

    if (!isMemberRole(body?.role)) {
      return apiError("Choose Owner or Team member.", "VALIDATION_FAILED", 400);
    }

    const member = await findMember(found.businessId, id);
    if (!member) return apiError("That person isn't on your team.", "NOT_FOUND", 404);

    if (member.userId === member.business.userId && body.role !== "OWNER") {
      return apiError("The account's creator always stays an owner.", "NOT_AUTHORIZED", 409);
    }

    await db.businessMember.update({ where: { id: member.id }, data: { role: body.role } });

    return Response.json({ saved: true });
  } catch (error) {
    return unexpectedError("team/members/patch", error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    const { id } = await context.params;
    const member = await findMember(found.businessId, id);

    if (!member) return apiError("That person isn't on your team.", "NOT_FOUND", 404);

    if (member.userId === member.business.userId) {
      return apiError("The account's creator can't be removed.", "NOT_AUTHORIZED", 409);
    }

    // Their threads go back to the unassigned pile rather than vanishing with
    // them; the relation's ON DELETE SET NULL does exactly that.
    await db.businessMember.delete({ where: { id: member.id } });

    return Response.json({ removed: true });
  } catch (error) {
    return unexpectedError("team/members/delete", error);
  }
}

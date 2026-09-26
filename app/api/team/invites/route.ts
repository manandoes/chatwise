// Inviting someone to the team. Owner only.
//
// There is no email service yet, so the response carries the link itself and
// the owner sends it however they like. The token in it is shown this once;
// only its hash is stored (lib/team.ts).

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicAppUrl } from "@/lib/features";
import { createInvite, isMemberRole } from "@/lib/team";
import { normalizeEmail } from "@/lib/validation/auth";

export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    const body = (await request.json().catch(() => null)) as {
      email?: unknown;
      role?: unknown;
    } | null;

    const email = normalizeEmail(typeof body?.email === "string" ? body.email : "");
    const role = isMemberRole(body?.role) ? body.role : "AGENT";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiError("Enter the email address they sign in with.", "VALIDATION_FAILED", 400, {
        email: "Enter a valid email address.",
      });
    }

    const alreadyMember = await db.businessMember.findFirst({
      where: { businessId: found.businessId, user: { email } },
      select: { id: true },
    });

    if (alreadyMember) {
      return apiError("They're already on your team.", "ALREADY_EXISTS", 409, {
        email: "Already on your team.",
      });
    }

    const invite = await createInvite({
      businessId: found.businessId,
      invitedById: found.userId,
      email,
      role,
    });

    return Response.json({
      id: invite.id,
      link: `${publicAppUrl()}/join/${invite.token}`,
      expiresAt: invite.expiresAt,
    });
  } catch (error) {
    return unexpectedError("team/invites/post", error);
  }
}

// Accepting a team invitation. The rules — the invite must be for the address
// you are signed in with, and you cannot be moved out of a business that is
// already running — live in lib/team.ts.

import { apiError, unexpectedError } from "@/lib/api-response";
import { getApiUser } from "@/lib/auth";
import { acceptInvite } from "@/lib/team";

export async function POST(request: Request) {
  try {
    const user = await getApiUser();
    if (!user?.email) return apiError("Please sign in again.", "NOT_AUTHENTICATED", 401);

    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    const token = typeof body?.token === "string" ? body.token : "";

    if (!token) return apiError("That invitation link is incomplete.", "VALIDATION_FAILED", 400);

    const result = await acceptInvite(token, { id: user.id, email: user.email });

    if (!result.ok) return apiError(result.message, "NOT_AUTHORIZED", 409);

    return Response.json({ joined: true });
  } catch (error) {
    return unexpectedError("team/join", error);
  }
}

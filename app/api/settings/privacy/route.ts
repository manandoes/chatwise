// Privacy: masking the contact's phone number on screen.

import { apiError, unexpectedError } from "@/lib/api-response";
import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrCreateBusiness } from "@/lib/onboarding";

export async function PATCH(request: Request) {
  try {
    const user = await getApiUser();

    if (!user) return apiError("Please sign in again.", "NOT_AUTHENTICATED", 401);

    const body = (await request.json().catch(() => null)) as {
      maskContactPhone?: unknown;
    } | null;

    if (typeof body?.maskContactPhone !== "boolean") {
      return apiError("Say whether numbers should be masked.", "VALIDATION_FAILED", 400);
    }

    const business = await getOrCreateBusiness(user.id);

    await db.business.update({
      where: { id: business.id },
      data: { maskContactPhone: body.maskContactPhone },
    });

    return Response.json({ maskContactPhone: body.maskContactPhone });
  } catch (error) {
    return unexpectedError("settings/privacy/patch", error);
  }
}

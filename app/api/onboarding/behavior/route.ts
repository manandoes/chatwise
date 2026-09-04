// Setup Step D — how the agent should behave, and the end of the wizard.
//
// Saving this marks setup finished, which is what lets the dashboard open.

import { apiError, unexpectedError } from "@/lib/api-response";
import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrCreateBusiness } from "@/lib/onboarding";
import { isValid, validateBotBehavior } from "@/lib/validation/onboarding";

export async function POST(request: Request) {
  try {
    const user = await getApiUser();
    if (!user) {
      return apiError("Please log in and try again.", "NOT_AUTHENTICATED", 401);
    }

    const business = await getOrCreateBusiness(user.id);

    // Every earlier step has to be done — this one finishes setup, so it can't
    // run against a half-filled account.
    if (!business.agent || !business.connection || !business.name?.trim()) {
      return apiError(
        "There are earlier setup steps still to finish.",
        "VALIDATION_FAILED",
        400,
      );
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    const input = {
      tone: String(body?.tone ?? ""),
      language: String(body?.language ?? ""),
      escalationRules: String(body?.escalationRules ?? ""),
      escalateTo: String(body?.escalateTo ?? ""),
    };

    const errors = validateBotBehavior(input);
    if (!isValid(errors)) {
      return apiError(
        "Please check the highlighted answers.",
        "VALIDATION_FAILED",
        400,
        errors,
      );
    }

    await db.$transaction([
      db.agentInstance.update({
        where: { businessId: business.id },
        data: {
          tone: input.tone,
          language: input.language,
          escalationRules: input.escalationRules.trim(),
          escalateTo: input.escalateTo.trim() || null,
        },
      }),
      db.business.update({
        where: { id: business.id },
        data: {
          // Setting this is what marks setup complete. Re-running the wizard
          // just refreshes the timestamp; it never creates anything new.
          onboardingCompletedAt: business.onboardingCompletedAt ?? new Date(),
        },
      }),
    ]);

    return Response.json({ complete: true }, { status: 200 });
  } catch (error) {
    return unexpectedError("onboarding/behavior", error);
  }
}

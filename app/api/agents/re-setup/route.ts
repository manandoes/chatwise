// Starting setup again, to change which agent runs or how it connects.
//
// This is a re-setup of the single slot, never an addition (docs/Rules.md §6).
// It marks setup unfinished, which puts the customer back at the start of the
// wizard with all their current answers pre-filled — so walking through without
// changing anything leaves them exactly where they were.
//
// Nothing is deleted here. The existing agent and connection rows stay put; if
// the customer picks a *different* agent, that agent's setup route clears the
// answers, because they were answers to a different agent's questions.

import { apiError, unexpectedError } from "@/lib/api-response";
import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrCreateBusiness } from "@/lib/onboarding";

export async function POST() {
  try {
    const user = await getApiUser();
    if (!user) {
      return apiError("Please log in and try again.", "NOT_AUTHENTICATED", 401);
    }

    const business = await getOrCreateBusiness(user.id);

    if (!business.onboardingCompletedAt) {
      return apiError(
        "You're already partway through setup.",
        "VALIDATION_FAILED",
        400,
      );
    }

    await db.business.update({
      where: { id: business.id },
      data: { onboardingCompletedAt: null },
    });

    return Response.json({ restarted: true }, { status: 200 });
  } catch (error) {
    return unexpectedError("agents/re-setup", error);
  }
}

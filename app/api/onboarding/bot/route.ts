// Setup Step A — which agent this account runs.
//
// An account gets exactly one (docs/PRD.md §3.1). This route never creates a
// second: it writes to the single row keyed to the business, and the unique
// index on `businessId` is what actually guarantees that.

import { isSelectableBotType } from "@/bots/shared/bot-catalog";
import { apiError, unexpectedError } from "@/lib/api-response";
import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrCreateBusiness } from "@/lib/onboarding";

export async function POST(request: Request) {
  try {
    const user = await getApiUser();
    if (!user) {
      return apiError("Please log in and try again.", "NOT_AUTHENTICATED", 401);
    }

    const body = await request.json().catch(() => null);
    const botType = (body as { botType?: unknown } | null)?.botType;

    // Only a name from the catalogue is accepted — never whatever was sent.
    if (!isSelectableBotType(botType)) {
      return apiError(
        "Choose one of the agents shown.",
        "VALIDATION_FAILED",
        400,
        { botType: "Pick an agent to carry on." },
      );
    }

    // Looked up by the signed-in user, so there is no id from the request to
    // forge (docs/Rules.md §3).
    const business = await getOrCreateBusiness(user.id);

    // Once setup is finished, changing the agent is a deliberate re-setup of
    // the one slot rather than something this route does quietly
    // (docs/Rules.md §6). That flow is built in Phase 4.
    if (business.onboardingCompletedAt && business.agent) {
      return apiError(
        "You already have an agent set up. Change it from your dashboard.",
        "ALREADY_EXISTS",
        409,
      );
    }

    const agent = await db.agentInstance.upsert({
      where: { businessId: business.id },
      create: { businessId: business.id, botType },
      // Changing your mind mid-setup replaces the choice; it never adds one.
      // Answers to the old agent's questions are cleared, because they were
      // questions a different agent asked.
      update: business.agent?.botType === botType ? {} : { botType, config: {} },
      select: { botType: true },
    });

    return Response.json({ agent }, { status: 200 });
  } catch (error) {
    return unexpectedError("onboarding/bot", error);
  }
}

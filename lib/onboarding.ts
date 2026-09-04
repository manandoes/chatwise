// Where someone is in setup, and what they're allowed to reach.
//
// The wizard saves each answer as it goes, so closing the tab halfway through
// loses nothing — coming back drops you at the first step you haven't finished.
// That also means every page has to work out where you actually are rather than
// trusting a step number in the address bar.

import "server-only";

import { getBot } from "@/bots/shared/bot-catalog";
import { db } from "@/lib/db";
import {
  ONBOARDING_STEPS,
  canReachStep,
  pathForStep,
  stepIndex,
  type OnboardingSlug,
} from "@/lib/onboarding-steps";

// Re-exported so server code has a single import for setup.
export { ONBOARDING_STEPS, canReachStep, pathForStep, stepIndex };
export type { OnboardingSlug };

/**
 * Finds the business for this user, creating it the first time they arrive at
 * setup. It starts out nameless — we haven't asked yet — which is why
 * `Business.name` is nullable.
 */
export async function getOrCreateBusiness(userId: string) {
  const existing = await db.business.findUnique({
    where: { userId },
    include: { agent: true, connection: true },
  });

  if (existing) return existing;

  // Two tabs opening setup at once would both try to create this. The unique
  // index on userId means only one wins; the loser reads the winner's row.
  try {
    return await db.business.create({
      data: { userId },
      include: { agent: true, connection: true },
    });
  } catch {
    return db.business.findUniqueOrThrow({
      where: { userId },
      include: { agent: true, connection: true },
    });
  }
}

export type OnboardingState = Awaited<ReturnType<typeof getOnboardingState>>;

/** Everything a setup screen needs to know about where this account is up to. */
export async function getOnboardingState(userId: string) {
  const business = await getOrCreateBusiness(userId);

  const hasAgent = Boolean(business.agent);
  const hasConnection = Boolean(business.connection);
  const hasBusinessDetails = Boolean(business.name?.trim());
  const isComplete = Boolean(business.onboardingCompletedAt);

  // The first step that still needs doing. Someone returning mid-setup lands
  // here rather than back at the beginning.
  const nextStep: OnboardingSlug = !hasAgent
    ? "choose-bots"
    : !hasConnection
      ? "connection-type"
      : !hasBusinessDetails
        ? "business-details"
        : "bot-behavior";

  return {
    business,
    agent: business.agent,
    connection: business.connection,
    bot: getBot(business.agent?.botType),
    hasAgent,
    hasConnection,
    hasBusinessDetails,
    isComplete,
    nextStep,
  };
}

// The setup wizard's steps, as plain data.
//
// Deliberately free of any database import so the progress bar — which runs in
// the browser — can use it. Anything that needs to read the database lives in
// lib/onboarding.ts, which is server-only.

export const ONBOARDING_STEPS = [
  {
    slug: "choose-bots",
    path: "/onboarding/choose-bots",
    title: "Choose your agent",
    shortTitle: "Agent",
  },
  {
    slug: "connection-type",
    path: "/onboarding/connection-type",
    title: "Connect WhatsApp",
    shortTitle: "Connection",
  },
  {
    slug: "business-details",
    path: "/onboarding/business-details",
    title: "About your business",
    shortTitle: "Business",
  },
  {
    slug: "bot-behavior",
    path: "/onboarding/bot-behavior",
    title: "How it should behave",
    shortTitle: "Behaviour",
  },
] as const;

export type OnboardingSlug = (typeof ONBOARDING_STEPS)[number]["slug"];

/**
 * Whether a given step can be opened yet.
 *
 * Steps unlock in order because each depends on the last: the business
 * questions are chosen by which agent you picked, so they cannot be asked
 * before you've picked one.
 */
export function canReachStep(
  slug: OnboardingSlug,
  state: {
    hasAgent: boolean;
    hasConnection: boolean;
    hasBusinessDetails: boolean;
  },
): boolean {
  switch (slug) {
    case "choose-bots":
      return true;
    case "connection-type":
      return state.hasAgent;
    case "business-details":
      return state.hasAgent && state.hasConnection;
    case "bot-behavior":
      return state.hasAgent && state.hasConnection && state.hasBusinessDetails;
  }
}

export function stepIndex(slug: OnboardingSlug): number {
  return ONBOARDING_STEPS.findIndex((step) => step.slug === slug);
}

export function pathForStep(slug: OnboardingSlug): string {
  return `/onboarding/${slug}`;
}

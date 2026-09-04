// Someone landing on /onboarding goes to whichever step they still need.

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { getOnboardingState, pathForStep } from "@/lib/onboarding";

export default async function OnboardingIndexPage() {
  const user = await requireUser();
  const state = await getOnboardingState(user.id);

  if (state.isComplete) redirect("/dashboard");

  redirect(pathForStep(state.nextStep));
}

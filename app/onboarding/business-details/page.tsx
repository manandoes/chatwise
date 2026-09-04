// Setup Step C — about the business. The questions vary by the agent chosen in
// Step A (docs/PRD.md §3, Step C).

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BusinessDetailsForm } from "@/components/onboarding/business-details-form";
import { requireUser } from "@/lib/auth";
import { canReachStep, getOnboardingState, pathForStep } from "@/lib/onboarding";

export const metadata: Metadata = { title: "About your business" };

export default async function BusinessDetailsPage() {
  const user = await requireUser();
  const state = await getOnboardingState(user.id);

  if (state.isComplete) redirect("/dashboard");

  if (!canReachStep("business-details", state) || !state.bot) {
    redirect(pathForStep(state.nextStep));
  }

  const savedAnswers = (state.agent?.config ?? {}) as Record<string, unknown>;

  return (
    <BusinessDetailsForm
      bot={state.bot}
      initial={{
        name: state.business.name ?? "",
        industry: state.business.industry ?? "",
        about: state.business.about ?? "",
        answers: Object.fromEntries(
          Object.entries(savedAnswers).map(([key, value]) => [
            key,
            typeof value === "string" ? value : "",
          ]),
        ),
      }}
    />
  );
}

// Setup Step D — tone, language and escalation (docs/PRD.md §3, Step D).
// Finishing this marks setup complete and opens the dashboard.

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BotBehaviorForm } from "@/components/onboarding/bot-behavior-form";
import { requireUser } from "@/lib/auth";
import { canReachStep, getOnboardingState, pathForStep } from "@/lib/onboarding";

export const metadata: Metadata = { title: "How it should behave" };

export default async function BotBehaviorPage() {
  const user = await requireUser();
  const state = await getOnboardingState(user.id);

  if (state.isComplete) redirect("/dashboard");

  if (!canReachStep("bot-behavior", state) || !state.bot) {
    redirect(pathForStep(state.nextStep));
  }

  return (
    <BotBehaviorForm
      botName={state.bot.name}
      initial={{
        tone: state.agent?.tone ?? "",
        language: state.agent?.language ?? "",
        escalationRules: state.agent?.escalationRules ?? "",
        escalateTo: state.agent?.escalateTo ?? "",
      }}
    />
  );
}

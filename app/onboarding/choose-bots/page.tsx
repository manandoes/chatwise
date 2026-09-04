// Setup Step A — choose the one agent this account runs (docs/PRD.md §3, Step A).

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BOT_CATALOG } from "@/bots/shared/bot-catalog";
import { BotPicker } from "@/components/onboarding/bot-picker";
import { requireUser } from "@/lib/auth";
import { getOnboardingState } from "@/lib/onboarding";

export const metadata: Metadata = { title: "Choose your agent" };

export default async function ChooseBotPage() {
  const user = await requireUser();
  const state = await getOnboardingState(user.id);

  // Setup is already done — this screen would let someone silently replace
  // their agent, which is a deliberate re-setup, not a step in a wizard.
  if (state.isComplete) redirect("/dashboard");

  return (
    <BotPicker
      bots={BOT_CATALOG}
      initialBotType={state.agent?.botType ?? null}
    />
  );
}

// Setup Step B — QR or the official API, never both (docs/PRD.md §3, Step B).

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ConnectionPicker } from "@/components/onboarding/connection-picker";
import { requireUser } from "@/lib/auth";
import { canReachStep, getOnboardingState, pathForStep } from "@/lib/onboarding";

export const metadata: Metadata = { title: "Connect WhatsApp" };

export default async function ConnectionTypePage() {
  const user = await requireUser();
  const state = await getOnboardingState(user.id);

  if (state.isComplete) redirect("/dashboard");

  // Someone who typed this address in without choosing an agent first goes
  // back to the step they actually need.
  if (!canReachStep("connection-type", state)) {
    redirect(pathForStep(state.nextStep));
  }

  return (
    <ConnectionPicker initialConnectionType={state.connection?.type ?? null} />
  );
}

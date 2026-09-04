// The frame around the setup wizard.
//
// Deliberately stripped back — no dashboard navigation, nothing to wander off
// into. One question per screen (Design.md §5), with the progress bar the only
// chrome.

import type { ReactNode } from "react";

import { OnboardingProgress } from "@/components/onboarding/progress";
import { Button } from "@/components/ui/button";
import { requireUser, signOut } from "@/lib/auth";
import {
  ONBOARDING_STEPS,
  canReachStep,
  getOnboardingState,
  type OnboardingSlug,
} from "@/lib/onboarding";

export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  const state = await getOnboardingState(user.id);

  const reachable: OnboardingSlug[] = ONBOARDING_STEPS.filter((step) =>
    canReachStep(step.slug, state),
  ).map((step) => step.slug);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-72 left-1/2 size-[40rem] -translate-x-1/2 rounded-full bg-primary/8 blur-[140px]"
      />

      <header className="relative flex h-topbar shrink-0 items-center justify-between border-b border-border px-6">
        <span className="text-h3 font-semibold text-text-primary">
          Chat<span className="text-primary">Wise</span>
        </span>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <Button type="submit" variant="ghost" size="sm">
            Log out
          </Button>
        </form>
      </header>

      <div className="relative mx-auto w-full max-w-3xl flex-1 px-6 py-10 lg:py-14">
        <OnboardingProgress reachable={reachable} />

        <div className="mt-10">{children}</div>

        <p className="mt-10 text-center text-small text-text-secondary">
          Your answers save as you go — you can close this and pick up where you
          left off.
        </p>
      </div>
    </div>
  );
}

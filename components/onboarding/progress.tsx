"use client";

// The progress indicator across the top of every setup screen.
//
// Steps already finished are clickable — going back to change an earlier answer
// should never mean starting again. Steps not yet unlocked are inert, because
// the later questions depend on the earlier answers.

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ONBOARDING_STEPS, type OnboardingSlug } from "@/lib/onboarding-steps";

export function OnboardingProgress({
  reachable,
}: {
  /** Which steps this account has unlocked so far. */
  reachable: OnboardingSlug[];
}) {
  const pathname = usePathname();

  const currentIndex = Math.max(
    0,
    ONBOARDING_STEPS.findIndex((step) => pathname.startsWith(step.path)),
  );

  return (
    <nav aria-label="Setup progress">
      <ol className="flex items-start gap-2 sm:gap-3">
        {ONBOARDING_STEPS.map((step, index) => {
          const isCurrent = index === currentIndex;
          const isDone = index < currentIndex;
          const canOpen = reachable.includes(step.slug) && !isCurrent;

          const body = (
            <>
              <span
                aria-hidden
                className={`block h-1 w-full rounded-full transition-colors ${
                  isCurrent
                    ? "bg-primary shadow-glow"
                    : isDone
                      ? "bg-primary/50"
                      : "bg-border"
                }`}
              />
              <span
                className={`mt-2 hidden text-small sm:block ${
                  isCurrent
                    ? "text-text-primary"
                    : isDone
                      ? "text-text-secondary"
                      : "text-text-disabled"
                }`}
              >
                {step.shortTitle}
              </span>
            </>
          );

          return (
            <li key={step.slug} className="min-w-0 flex-1">
              {canOpen ? (
                <Link
                  href={step.path}
                  className="block rounded-md"
                  aria-label={`Back to step ${index + 1}: ${step.title}`}
                >
                  {body}
                </Link>
              ) : (
                <div aria-current={isCurrent ? "step" : undefined}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-small text-text-secondary sm:hidden">
        Step {currentIndex + 1} of {ONBOARDING_STEPS.length} ·{" "}
        {ONBOARDING_STEPS[currentIndex].title}
      </p>
    </nav>
  );
}

"use client";

// Choosing a plan.
//
// The buttons say what will actually happen, which is not the same on every
// card: starting a plan opens a payment page, moving up takes effect straight
// away, and moving down waits until the month already paid for has run out.
// Somebody clicking should not be surprised by any of those (docs/Rules.md §7).

import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatRupees, type Plan, type PlanIdValue } from "@/lib/plans";

export function PlanPicker({
  plans,
  currentPlanId,
  /** False when payments aren't switched on, or the plan can't be bought yet. */
  canChange,
  /** Plans with no price set up at Razorpay yet — shown, but not buyable. */
  unavailablePlanIds,
  /** True once there is a subscription, which makes every change a move. */
  hasSubscription,
}: {
  plans: Plan[];
  currentPlanId: PlanIdValue;
  canChange: boolean;
  unavailablePlanIds: PlanIdValue[];
  hasSubscription: boolean;
}) {
  const router = useRouter();
  const [busyPlan, setBusyPlan] = useState<PlanIdValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentPrice =
    plans.find((plan) => plan.id === currentPlanId)?.monthlyPriceInRupees ?? 0;

  async function choose(plan: Plan) {
    setError(null);
    setBusyPlan(plan.id);

    try {
      const response = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.id }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error?.message ?? "We couldn't start that just now.");

        return;
      }

      if (payload?.payUrl) {
        // Razorpay's own hosted page. Card details never touch ChatWise, so
        // this leaves the app entirely rather than routing within it.
        window.location.assign(payload.payUrl);

        return;
      }

      router.refresh();
    } catch {
      setError("We couldn't reach ChatWise. Check your connection.");
    } finally {
      setBusyPlan(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const isUnavailable = unavailablePlanIds.includes(plan.id);
          const isFree = plan.monthlyPriceInRupees === 0;
          const isUpgrade = plan.monthlyPriceInRupees > currentPrice;

          return (
            <div
              key={plan.id}
              className={`flex flex-col rounded-lg border p-5 ${
                isCurrent
                  ? "border-primary/40 bg-surface shadow-glow-lg"
                  : "border-border bg-surface/50"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-semibold text-text-primary">{plan.name}</h3>
                {isCurrent && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    Your plan
                  </span>
                )}
              </div>

              <p className="mt-3 text-h3 font-bold tracking-tight text-text-primary">
                {formatRupees(plan.monthlyPriceInRupees)}
                {!isFree && (
                  <span className="ml-1 text-small font-normal text-text-secondary">
                    a month
                  </span>
                )}
              </p>

              <p className="mt-3 text-pretty text-small leading-relaxed text-text-secondary">
                {plan.summary}
              </p>

              <ul className="mt-4 flex-1 space-y-2">
                {plan.includes.map((line) => (
                  <li key={line} className="flex gap-2 text-small">
                    <Check
                      aria-hidden
                      className="mt-0.5 size-3.5 shrink-0 text-primary"
                    />
                    <span className="text-pretty text-text-secondary">
                      {line}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                {isCurrent ? (
                  <p className="text-small text-text-secondary">
                    You&rsquo;re on this plan.
                  </p>
                ) : isFree ? (
                  <p className="text-small text-text-secondary">
                    Cancel your plan to move back to Free.
                  </p>
                ) : isUnavailable ? (
                  <p className="text-small text-text-secondary">
                    Not available to buy yet.
                  </p>
                ) : (
                  <Button
                    type="button"
                    variant={isUpgrade ? "default" : "outline"}
                    className="w-full"
                    disabled={!canChange || busyPlan !== null}
                    onClick={() => choose(plan)}
                  >
                    {busyPlan === plan.id && (
                      <LoaderCircle className="size-4 animate-spin" />
                    )}
                    {!hasSubscription
                      ? "Choose this plan"
                      : isUpgrade
                        ? "Move up now"
                        : "Move down next month"}
                    {!busyPlan && <ArrowRight className="size-4" />}
                  </Button>
                )}
              </div>

              {!isCurrent && !isFree && !isUnavailable && hasSubscription && (
                <p className="mt-2 text-xs leading-relaxed text-text-secondary">
                  {isUpgrade
                    ? "Takes effect immediately. Razorpay adjusts your next invoice."
                    : "You keep everything you have until the month you've paid for ends."}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-small text-error">{error}</p>}
    </div>
  );
}

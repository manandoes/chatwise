// The plans, on the public pricing page.
//
// Read from lib/plans.ts — the same file the dashboard, the billing screen and
// every limit check read. Before Phase 13 this component kept its own copy of
// what each plan included, which is exactly the kind of second version of a
// fact that goes quietly out of date. Now a plan changes in one place.
//
// Every plan here is paid. The line under each price comes from `billingNote`
// rather than being written here, because on the API plans the price is not the
// whole bill — Meta charges per conversation on top — and a pricing page that
// implies otherwise is making a claim we cannot stand behind.

import { Check } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PLANS, billingNote, formatRupees } from "@/lib/plans";

/** The one plan given visual weight. Most businesses land here. */
const RECOMMENDED = "SMALL_BUSINESS";

export function PricingPlans() {
  return (
    <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
      {PLANS.map((plan) => {
        const emphasised = plan.id === RECOMMENDED;

        return (
          <div
            key={plan.id}
            className={`flex flex-col rounded-lg border p-6 ${
              emphasised
                ? "border-primary/40 bg-surface shadow-glow-lg"
                : "border-border bg-surface/50"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-h3 font-semibold text-text-primary">
                {plan.name}
              </h2>
              {emphasised && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  Most popular
                </span>
              )}
            </div>

            <p className="mt-4 text-h2 font-bold tracking-tight text-text-primary">
              {formatRupees(plan.monthlyPriceInRupees)}
            </p>
            <p className="mt-1 text-pretty text-small text-text-secondary">
              {billingNote(plan)}
            </p>

            <p className="mt-5 text-pretty text-small leading-relaxed text-text-secondary">
              {plan.summary}
            </p>

            <ul className="mt-6 flex-1 space-y-2.5">
              {plan.includes.map((item) => (
                <li key={item} className="flex gap-2.5 text-small">
                  <Check
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-primary"
                  />
                  <span className="text-pretty text-text-secondary">{item}</span>
                </li>
              ))}
            </ul>

            <Button
              asChild
              size="lg"
              variant={emphasised ? "default" : "outline"}
              className="mt-7 w-full"
            >
              <Link href="/signup">{`Start on ${plan.name}`}</Link>
            </Button>
          </div>
        );
      })}
    </div>
  );
}

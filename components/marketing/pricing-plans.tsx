// The two plans.
//
// IMPORTANT: the amounts are deliberately not filled in. docs/PRD.md §10 lists
// final pricing as an open business decision, and docs/Rules.md §9 says not to
// invent pricing. What each plan *includes* is real and comes from
// docs/PRD.md §4 and §7.1 — only the numbers are outstanding.

import { Check, Minus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

type Plan = {
  id: string;
  name: string;
  price: string;
  priceNote: string;
  summary: string;
  cta: { label: string; href: string };
  emphasised: boolean;
  includes: { text: string; included: boolean }[];
};

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "No monthly fee",
    priceNote: "Connect by scanning a QR code",
    summary:
      "For a small business with a steady trickle of messages that wants an agent answering today.",
    cta: { label: "Get started free", href: "/signup" },
    emphasised: false,
    includes: [
      { text: "One agent of your choice", included: true },
      { text: "QR-code connection to your own number", included: true },
      { text: "Live inbox with human takeover", included: true },
      { text: "Leads captured automatically", included: true },
      { text: "Knowledge base and analytics", included: true },
      { text: "Bulk sends to 25 people at a time, throttled", included: true },
      { text: "Official WhatsApp Business API", included: false },
      { text: "Large bulk sends with approved templates", included: false },
    ],
  },
  {
    id: "business",
    name: "Business API",
    price: "Being finalised",
    priceNote: "Meta also charges per message, passed through",
    summary:
      "For a business with real volume that needs the official channel and its reliability.",
    cta: { label: "Get started", href: "/signup" },
    emphasised: true,
    includes: [
      { text: "One agent of your choice", included: true },
      { text: "Official WhatsApp Business Cloud API", included: true },
      { text: "Live inbox with human takeover", included: true },
      { text: "Leads captured automatically", included: true },
      { text: "Knowledge base and analytics", included: true },
      { text: "Large bulk sends with Meta-approved templates", included: true },
      { text: "Delivery, read and reply tracking", included: true },
      { text: "Priority support", included: true },
    ],
  },
];

export function PricingPlans() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {PLANS.map((plan) => (
        <div
          key={plan.id}
          className={`flex flex-col rounded-lg border p-7 ${
            plan.emphasised
              ? "border-primary/40 bg-surface shadow-glow-lg"
              : "border-border bg-surface/50"
          }`}
        >
          <h2 className="text-h3 font-semibold text-text-primary">
            {plan.name}
          </h2>

          <p className="mt-4 text-h1 font-bold tracking-tight text-text-primary">
            {plan.price}
          </p>
          <p className="mt-1 text-small text-text-secondary">{plan.priceNote}</p>

          <p className="mt-5 text-pretty text-small leading-relaxed text-text-secondary">
            {plan.summary}
          </p>

          <ul className="mt-7 flex-1 space-y-3">
            {plan.includes.map((item) => (
              <li key={item.text} className="flex gap-3 text-small">
                {item.included ? (
                  <Check
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-primary"
                  />
                ) : (
                  <Minus
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-text-disabled"
                  />
                )}
                <span
                  className={`text-pretty ${
                    item.included ? "text-text-secondary" : "text-text-disabled"
                  }`}
                >
                  {item.text}
                  {!item.included && <span className="sr-only"> — not included</span>}
                </span>
              </li>
            ))}
          </ul>

          <Button
            asChild
            size="lg"
            variant={plan.emphasised ? "default" : "outline"}
            className="mt-8 w-full"
          >
            <Link href={plan.cta.href}>{plan.cta.label}</Link>
          </Button>
        </div>
      ))}
    </div>
  );
}

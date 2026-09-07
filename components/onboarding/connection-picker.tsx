"use client";

// Setup Step B — how this account connects to WhatsApp.
//
// One or the other, never both (docs/PRD.md §3.1). The QR tier's ban risk is
// stated here rather than buried, because this is the moment someone decides
// (docs/PRD.md §7.2).
//
// Both routes are covered by the same paid plan. The only cost difference —
// that Meta bills per conversation on the API route, directly and at its own
// rates — is stated here too, for the same reason: this is when it matters.

import { QrCode, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { OptionCard } from "@/components/onboarding/option-card";
import { StepShell } from "@/components/onboarding/step-shell";
import { formatRupees, planForConnectionType } from "@/lib/plans";

const OPTIONS = [
  {
    value: "QR",
    title: "Scan a QR code — for small businesses",
    description:
      "Works like WhatsApp Web: scan a code with your phone and you're connected in minutes. Nothing to apply for, and your plan is the whole bill.",
    icon: <QrCode className="size-5" />,
    points: [
      "Live in minutes, no application",
      "No per-message charge from anyone",
      "Bulk sends limited to 25 people at a time",
      "Unofficial route — careless messaging can get a number banned",
    ],
  },
  {
    value: "API",
    title: "WhatsApp Business API — for larger businesses",
    description:
      "Meta's official channel. Built for volume and backed by support, but you apply to Meta first and they bill you per conversation on top of your plan.",
    icon: <ShieldCheck className="size-5" />,
    points: [
      "Official, supported connection",
      "Large contact lists with approved templates",
      "Meta bills you per conversation, directly, at their own rates",
      "Needs a Meta application and business verification",
    ],
  },
] as const;

export function ConnectionPicker({
  initialConnectionType,
}: {
  initialConnectionType: string | null;
}) {
  const router = useRouter();

  const [selected, setSelected] = useState<string | null>(initialConnectionType);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!selected) {
      setError("Choose how you want to connect.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/onboarding/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionType: selected }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "We couldn't save that. Try again.");
        setIsSubmitting(false);
        return;
      }

      router.push("/onboarding/business-details");
      router.refresh();
    } catch {
      setError("We couldn't reach ChatWise. Check your connection and try again.");
      setIsSubmitting(false);
    }
  }

  const chosen = OPTIONS.find((option) => option.value === selected);

  return (
    <StepShell
      title="How should it connect to WhatsApp?"
      description="This is your plan as well as your connection — there is one of each, and no other sizes to choose between. Your account uses one, never both. If you're not sure, start with the QR code; you can move to the official API later."
      error={error}
      backHref="/onboarding/choose-bots"
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      canSubmit={Boolean(selected)}
    >
      <fieldset>
        <legend className="sr-only">Choose one connection type</legend>

        <div className="grid gap-3">
          {OPTIONS.map((option) => {
            // The plan and the connection are one choice, so the card says what
            // this option costs rather than leaving it to be discovered at the
            // billing screen. Read from lib/plans.ts, never typed in here.
            const plan = planForConnectionType(option.value);

            return (
              <OptionCard
                key={option.value}
                name="connectionType"
                value={option.value}
                checked={selected === option.value}
                onSelect={setSelected}
                title={`${option.title} — ${plan.name}, ${formatRupees(plan.monthlyPriceInRupees)} a month`}
                description={option.description}
                icon={option.icon}
                disabled={isSubmitting}
              />
            );
          })}
        </div>
      </fieldset>

      {chosen && (
        <div className="mt-6 rounded-lg border border-border bg-surface/50 p-5">
          <h2 className="text-small font-medium text-text-primary">
            What that means
          </h2>
          <ul className="mt-3 space-y-2">
            {chosen.points.map((point) => (
              <li
                key={point}
                className="flex gap-3 text-small leading-relaxed text-text-secondary"
              >
                <span
                  aria-hidden
                  className="mt-2 size-1 shrink-0 rounded-full bg-text-disabled"
                />
                <span className="text-pretty">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </StepShell>
  );
}

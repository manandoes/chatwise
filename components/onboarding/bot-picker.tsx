"use client";

// Setup Step A — choose the one agent this account runs.
//
// Single-select, always. There is no "add another" here and there never will be
// (docs/PRD.md §3.1, docs/Rules.md §6) — using radio inputs rather than
// checkboxes means the interface cannot express a second choice.

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { BotConfigSchema } from "@/bots/shared/config-types";
import { BotIcon } from "@/components/onboarding/bot-icon";
import { OptionCard } from "@/components/onboarding/option-card";
import { StepShell } from "@/components/onboarding/step-shell";

export function BotPicker({
  bots,
  initialBotType,
}: {
  bots: BotConfigSchema[];
  initialBotType: string | null;
}) {
  const router = useRouter();

  const [selected, setSelected] = useState<string | null>(initialBotType);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!selected) {
      setError("Choose an agent to carry on.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/onboarding/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botType: selected }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "We couldn't save that. Try again.");
        setIsSubmitting(false);
        return;
      }

      router.push("/onboarding/connection-type");
      router.refresh();
    } catch {
      setError("We couldn't reach ChatWise. Check your connection and try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <StepShell
      title="Which agent do you want?"
      description="Pick the job you most need doing. Your account runs this one agent — you can change which one later, but you'll never run two at once."
      error={error}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      canSubmit={Boolean(selected)}
    >
      <fieldset>
        <legend className="sr-only">Choose one agent</legend>

        <div className="grid gap-3 sm:grid-cols-2">
          {bots.map((bot) => (
            <OptionCard
              key={bot.type}
              name="botType"
              value={bot.type}
              checked={selected === bot.type}
              onSelect={setSelected}
              title={bot.name}
              description={bot.tagline}
              icon={<BotIcon name={bot.icon} className="size-5" />}
              disabled={isSubmitting}
            />
          ))}
        </div>
      </fieldset>

      <p className="mt-6 rounded-lg border border-border bg-surface/50 p-4 text-pretty text-small leading-relaxed text-text-secondary">
        <span className="font-medium text-text-primary">
          The CRM agent comes with all of them.
        </span>{" "}
        It runs quietly in the background of every conversation, keeping your
        contact records up to date. It isn&rsquo;t something you pick, and it
        doesn&rsquo;t replace the agent you choose here.
      </p>
    </StepShell>
  );
}

"use client";

// Setup Step D — how the agent should come across, and when it should stop and
// fetch a person.
//
// The escalation question is required. An agent with no way out leaves a
// customer's customer stuck talking to software with no route to a human
// (docs/Rules.md §5), so it cannot be skipped.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { OptionCard } from "@/components/onboarding/option-card";
import { QuestionField } from "@/components/onboarding/question-field";
import { StepShell } from "@/components/onboarding/step-shell";
import {
  LANGUAGE_OPTIONS,
  TONE_OPTIONS,
  isValid,
  validateBotBehavior,
  type ValidationErrors,
} from "@/lib/validation/onboarding";

export function BotBehaviorForm({
  botName,
  initial,
}: {
  botName: string;
  initial: {
    tone: string;
    language: string;
    escalationRules: string;
    escalateTo: string;
  };
}) {
  const router = useRouter();

  const [tone, setTone] = useState(initial.tone);
  const [language, setLanguage] = useState(initial.language);
  const [escalationRules, setEscalationRules] = useState(initial.escalationRules);
  const [escalateTo, setEscalateTo] = useState(initial.escalateTo);

  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const payload = { tone, language, escalationRules, escalateTo };

    const errors = validateBotBehavior(payload);
    setFieldErrors(errors);
    if (!isValid(errors)) {
      setFormError("Please check the highlighted answers.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/onboarding/behavior", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setFieldErrors(body?.error?.fields ?? {});
        setFormError(body?.error?.message ?? "We couldn't save that. Try again.");
        setIsSubmitting(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setFormError("We couldn't reach ChatWise. Check your connection and try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <StepShell
      title="How should it behave?"
      description={`The last thing. This is how your ${botName} agent comes across to customers, and when it should stop and fetch you.`}
      error={formError}
      backHref="/onboarding/business-details"
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Finish setup"
    >
      <div className="space-y-8">
        <fieldset>
          <legend className="font-medium text-text-primary">
            How should it come across?
          </legend>
          {fieldErrors.tone && (
            <p className="mt-1 text-small text-error">{fieldErrors.tone}</p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {TONE_OPTIONS.map((option) => (
              <OptionCard
                key={option.value}
                name="tone"
                value={option.value}
                checked={tone === option.value}
                onSelect={setTone}
                title={option.label}
                description={option.description}
                disabled={isSubmitting}
              />
            ))}
          </div>
        </fieldset>

        <QuestionField
          question={{
            id: "language",
            label: "What language should it reply in?",
            type: "select",
            required: true,
            options: LANGUAGE_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            })),
          }}
          value={language}
          error={fieldErrors.language}
          disabled={isSubmitting}
          onChange={setLanguage}
        />

        <div className="space-y-6 border-t border-border pt-6">
          <QuestionField
            question={{
              id: "escalationRules",
              label: "When should it stop and fetch a person?",
              hint: "Be specific. Anything you list here, it hands over rather than attempting — and it will always hand over when a customer asks for a human.",
              type: "textarea",
              placeholder:
                "Any complaint, anything about a refund, or if someone asks the same thing twice without getting an answer.",
              required: true,
            }}
            value={escalationRules}
            error={fieldErrors.escalationRules}
            disabled={isSubmitting}
            onChange={setEscalationRules}
          />

          <QuestionField
            question={{
              id: "escalateTo",
              label: "Who should it say it's fetching?",
              hint: "The name your customers would recognise. Leave blank and it'll just say someone will be in touch.",
              type: "text",
              placeholder: "Ravi",
            }}
            value={escalateTo}
            error={fieldErrors.escalateTo}
            disabled={isSubmitting}
            onChange={setEscalateTo}
          />
        </div>
      </div>
    </StepShell>
  );
}

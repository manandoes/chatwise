"use client";

// Setup Step C — about the business.
//
// The first three questions are the same for everyone. The rest come from
// whichever agent was chosen in Step A, straight out of that agent's
// config-schema.ts — which is why a Sales agent asks about pricing here and an
// Appointment agent asks about your calendar.

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { BotConfigSchema } from "@/bots/shared/config-types";
import { QuestionField } from "@/components/onboarding/question-field";
import { StepShell } from "@/components/onboarding/step-shell";
import {
  isValid,
  validateBusinessDetails,
  type ValidationErrors,
} from "@/lib/validation/onboarding";

export function BusinessDetailsForm({
  bot,
  initial,
}: {
  bot: BotConfigSchema;
  initial: {
    name: string;
    industry: string;
    about: string;
    answers: Record<string, string>;
  };
}) {
  const router = useRouter();

  const [name, setName] = useState(initial.name);
  const [industry, setIndustry] = useState(initial.industry);
  const [about, setAbout] = useState(initial.about);
  const [answers, setAnswers] = useState<Record<string, string>>(initial.answers);

  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setAnswer(id: string, value: string) {
    setAnswers((current) => ({ ...current, [id]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const payload = { name, industry, about, answers };

    const errors = validateBusinessDetails(payload, bot.questions);
    setFieldErrors(errors);
    if (!isValid(errors)) {
      setFormError("Please check the highlighted answers.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/onboarding/business", {
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

      router.push("/onboarding/bot-behavior");
      router.refresh();
    } catch {
      setFormError("We couldn't reach ChatWise. Check your connection and try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <StepShell
      title="Tell us about your business"
      description={`Your ${bot.name} agent answers only from what you write here — it won't invent an answer about your business. The more specific you are, the better it does.`}
      error={formError}
      backHref="/onboarding/connection-type"
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
    >
      <div className="space-y-6">
        <QuestionField
          question={{
            id: "name",
            label: "Business name",
            hint: "What your customers know you as.",
            type: "text",
            placeholder: "Ravi Mobile Repairs",
            required: true,
          }}
          value={name}
          error={fieldErrors.name}
          disabled={isSubmitting}
          onChange={setName}
        />

        <QuestionField
          question={{
            id: "industry",
            label: "What line of work are you in?",
            type: "text",
            placeholder: "Phone repairs",
          }}
          value={industry}
          error={fieldErrors.industry}
          disabled={isSubmitting}
          onChange={setIndustry}
        />

        <QuestionField
          question={{
            id: "about",
            label: "What does your business do?",
            hint: "A couple of sentences, as you'd explain it to a new customer.",
            type: "textarea",
            placeholder:
              "We repair phones and tablets — screens, batteries, water damage. Walk-ins welcome, most jobs done same day.",
          }}
          value={about}
          error={fieldErrors.about}
          disabled={isSubmitting}
          onChange={setAbout}
        />

        <div className="space-y-6 border-t border-border pt-6">
          <p className="text-pretty text-small leading-relaxed text-text-secondary">
            These next questions are the ones your{" "}
            <span className="font-medium text-text-primary">{bot.name}</span>{" "}
            agent needs answered to do its job.
          </p>

          {bot.questions.map((question) => (
            <QuestionField
              key={question.id}
              question={question}
              value={answers[question.id] ?? ""}
              error={fieldErrors[question.id]}
              disabled={isSubmitting}
              onChange={(value) => setAnswer(question.id, value)}
            />
          ))}
        </div>
      </div>
    </StepShell>
  );
}

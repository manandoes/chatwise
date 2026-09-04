"use client";

// Editing the account's one agent: what it knows about the business, and how it
// behaves.
//
// The questions in the first section come from the chosen agent's own
// config-schema.ts, exactly as in setup — so this screen never has to know which
// agent it is showing.

import { AlertCircle, Check, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { BotConfigSchema } from "@/bots/shared/config-types";
import { OptionCard } from "@/components/onboarding/option-card";
import { QuestionField } from "@/components/onboarding/question-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LANGUAGE_OPTIONS,
  TONE_OPTIONS,
  isValid,
  validateBotBehavior,
  validateBusinessDetails,
  type ValidationErrors,
} from "@/lib/validation/onboarding";

export type MyBotInitial = {
  name: string;
  industry: string;
  about: string;
  answers: Record<string, string>;
  tone: string;
  language: string;
  escalationRules: string;
  escalateTo: string;
};

export function MyBotForm({
  bot,
  initial,
}: {
  bot: BotConfigSchema;
  initial: MyBotInitial;
}) {
  const router = useRouter();

  const [values, setValues] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  function set<K extends keyof MyBotInitial>(key: K, value: MyBotInitial[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setJustSaved(false);
  }

  function setAnswer(id: string, value: string) {
    setValues((current) => ({
      ...current,
      answers: { ...current.answers, [id]: value },
    }));
    setJustSaved(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setJustSaved(false);

    const errors = {
      ...validateBusinessDetails(values, bot.questions),
      ...validateBotBehavior(values),
    };
    setFieldErrors(errors);

    if (!isValid(errors)) {
      setFormError("Please check the highlighted answers.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setFieldErrors(body?.error?.fields ?? {});
        setFormError(
          body?.error?.message ?? "We couldn't save that. Try again.",
        );
        setIsSaving(false);
        return;
      }

      setJustSaved(true);
      setIsSaving(false);
      router.refresh();
    } catch {
      setFormError(
        "We couldn't reach ChatWise. Check your connection and try again.",
      );
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {formError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-h3">What it knows</CardTitle>
          <CardDescription>
            Your {bot.name} agent answers only from what is here. If something
            isn&rsquo;t written down, it says so and fetches you rather than
            guessing.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <QuestionField
            question={{
              id: "name",
              label: "Business name",
              type: "text",
              required: true,
            }}
            value={values.name}
            error={fieldErrors.name}
            disabled={isSaving}
            onChange={(value) => set("name", value)}
          />

          <QuestionField
            question={{
              id: "industry",
              label: "What line of work are you in?",
              type: "text",
            }}
            value={values.industry}
            error={fieldErrors.industry}
            disabled={isSaving}
            onChange={(value) => set("industry", value)}
          />

          <QuestionField
            question={{
              id: "about",
              label: "What does your business do?",
              type: "textarea",
            }}
            value={values.about}
            error={fieldErrors.about}
            disabled={isSaving}
            onChange={(value) => set("about", value)}
          />

          {bot.questions.map((question) => (
            <QuestionField
              key={question.id}
              question={question}
              value={values.answers[question.id] ?? ""}
              error={fieldErrors[question.id]}
              disabled={isSaving}
              onChange={(value) => setAnswer(question.id, value)}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-h3">How it behaves</CardTitle>
          <CardDescription>
            How it comes across to customers, and when it should stop and fetch
            you.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
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
                  checked={values.tone === option.value}
                  onSelect={(value) => set("tone", value)}
                  title={option.label}
                  description={option.description}
                  disabled={isSaving}
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
            value={values.language}
            error={fieldErrors.language}
            disabled={isSaving}
            onChange={(value) => set("language", value)}
          />

          <QuestionField
            question={{
              id: "escalationRules",
              label: "When should it stop and fetch a person?",
              hint: "It always hands over when a customer asks for a human. This is what else should trigger it.",
              type: "textarea",
              required: true,
            }}
            value={values.escalationRules}
            error={fieldErrors.escalationRules}
            disabled={isSaving}
            onChange={(value) => set("escalationRules", value)}
          />

          <QuestionField
            question={{
              id: "escalateTo",
              label: "Who should it say it is fetching?",
              type: "text",
            }}
            value={values.escalateTo}
            error={fieldErrors.escalateTo}
            disabled={isSaving}
            onChange={(value) => set("escalateTo", value)}
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-4">
        <Button type="submit" size="lg" disabled={isSaving}>
          {isSaving ? (
            <>
              <LoaderCircle className="animate-spin" />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>

        {justSaved && (
          <p
            role="status"
            className="flex items-center gap-2 text-small text-primary"
          >
            <Check aria-hidden className="size-4" />
            Saved
          </p>
        )}
      </div>
    </form>
  );
}

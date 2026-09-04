"use client";

// One setup question on screen. Renders whatever kind the bot's config-schema
// asked for — a line, a paragraph, or a choice.

import type { BotQuestion } from "@/bots/shared/config-types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function QuestionField({
  question,
  value,
  error,
  disabled,
  onChange,
}: {
  question: BotQuestion;
  value: string;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const hintId = question.hint ? `${question.id}-hint` : undefined;
  const errorId = error ? `${question.id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  const shared = {
    id: question.id,
    name: question.id,
    value,
    disabled,
    "aria-invalid": Boolean(error),
    "aria-describedby": describedBy,
    placeholder: question.placeholder,
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={question.id} className="text-text-primary">
        {question.label}
        {!question.required && (
          <span className="ml-2 font-normal text-small text-text-secondary">
            optional
          </span>
        )}
      </Label>

      {question.hint && !error && (
        <p id={hintId} className="text-small text-text-secondary">
          {question.hint}
        </p>
      )}

      {question.type === "textarea" && (
        <Textarea
          {...shared}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {question.type === "text" && (
        <Input {...shared} onChange={(event) => onChange(event.target.value)} />
      )}

      {question.type === "select" && (
        <select
          {...shared}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full rounded-md border border-input bg-surface px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm"
        >
          <option value="">Choose one…</option>
          {question.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}

      {error && (
        <p id={errorId} className="text-small text-error">
          {error}
        </p>
      )}
    </div>
  );
}

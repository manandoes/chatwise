"use client";

// Editing the answers the agent is allowed to give.
//
// A list of questions and answers, in plain boxes, in the owner's own words —
// no JSON, no import format, no "schema" (docs/Rules.md §7). What is on screen
// is exactly what the agent will read.

import { AlertCircle, Check, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type KnowledgeRow = {
  /** Only used to keep React rows straight; never sent anywhere. */
  key: string;
  question: string;
  answer: string;
};

/** Shown in the empty boxes, so it's obvious what belongs in them. */
const EXAMPLE = {
  question: "Do you take card?",
  answer: "Yes — card, UPI and cash are all fine.",
};

let nextKey = 0;

function blankRow(): KnowledgeRow {
  nextKey += 1;

  return { key: `new-${nextKey}`, question: "", answer: "" };
}

export function KnowledgeBaseEditor({ initial }: { initial: KnowledgeRow[] }) {
  const router = useRouter();

  const [rows, setRows] = useState<KnowledgeRow[]>(
    initial.length > 0 ? initial : [blankRow()],
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  function update(index: number, patch: Partial<KnowledgeRow>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
    setJustSaved(false);
  }

  function remove(index: number) {
    setRows((current) => {
      const left = current.filter((_, i) => i !== index);

      // Never leave the page with nothing on it — an empty screen looks broken.
      return left.length > 0 ? left : [blankRow()];
    });
    setFieldErrors({});
    setJustSaved(false);
  }

  async function save() {
    setFormError(null);
    setFieldErrors({});
    setJustSaved(false);
    setIsSaving(true);

    try {
      const response = await fetch("/api/knowledge-base", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: rows.map((row) => ({
            question: row.question,
            answer: row.answer,
          })),
        }),
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

  const filledCount = rows.filter(
    (row) => row.question.trim() && row.answer.trim(),
  ).length;

  return (
    <div className="space-y-6">
      {formError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {rows.map((row, index) => {
          const questionError = fieldErrors[`question-${index}`];
          const answerError = fieldErrors[`answer-${index}`];

          return (
            <div
              key={row.key}
              className="space-y-4 rounded-lg border border-border bg-surface p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <Label
                    htmlFor={`question-${index}`}
                    className="text-text-primary"
                  >
                    When a customer asks
                  </Label>
                  <Input
                    id={`question-${index}`}
                    value={row.question}
                    placeholder={EXAMPLE.question}
                    disabled={isSaving}
                    aria-invalid={Boolean(questionError)}
                    onChange={(event) =>
                      update(index, { question: event.target.value })
                    }
                  />
                  {questionError && (
                    <p className="text-small text-error">{questionError}</p>
                  )}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-7 shrink-0 text-text-secondary hover:text-error"
                  disabled={isSaving}
                  onClick={() => remove(index)}
                  aria-label={
                    row.question.trim()
                      ? `Remove the answer to "${row.question.trim()}"`
                      : "Remove this answer"
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`answer-${index}`} className="text-text-primary">
                  Your agent says
                </Label>
                <Textarea
                  id={`answer-${index}`}
                  rows={3}
                  value={row.answer}
                  placeholder={EXAMPLE.answer}
                  disabled={isSaving}
                  aria-invalid={Boolean(answerError)}
                  onChange={(event) =>
                    update(index, { answer: event.target.value })
                  }
                />
                {answerError && (
                  <p className="text-small text-error">{answerError}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        disabled={isSaving}
        onClick={() => setRows((current) => [...current, blankRow()])}
      >
        <Plus className="size-4" />
        Add another answer
      </Button>

      <div className="flex flex-wrap items-center gap-4 border-t border-border pt-6">
        <Button type="button" onClick={save} disabled={isSaving}>
          {isSaving && <LoaderCircle className="size-4 animate-spin" />}
          {isSaving ? "Saving…" : "Save"}
        </Button>

        {justSaved && (
          <p className="flex items-center gap-2 text-small text-success">
            <Check className="size-4" />
            Saved. Your agent uses these from its next reply.
          </p>
        )}

        {!justSaved && (
          <p className="text-small text-text-secondary">
            {filledCount === 0
              ? "Nothing saved yet."
              : filledCount === 1
                ? "1 answer your agent can give."
                : `${filledCount} answers your agent can give.`}
          </p>
        )}
      </div>
    </div>
  );
}

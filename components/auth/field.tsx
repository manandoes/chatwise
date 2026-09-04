"use client";

// One labelled box on a form, with its helper text and its error message.
//
// Every field gets a plain-English label (docs/Rules.md §7), and any error is
// tied to the box with aria-describedby so screen readers announce it.

import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Field({
  id,
  label,
  hint,
  error,
  ...inputProps
}: ComponentProps<typeof Input> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-label uppercase text-text-secondary">
        {label}
      </Label>

      <Input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
        {...inputProps}
      />

      {hint && !error && (
        <p id={hintId} className="text-small text-text-secondary">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} className="text-small text-error">
          {error}
        </p>
      )}
    </div>
  );
}

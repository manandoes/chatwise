"use client";

// A large, tappable choice (Design.md §5 — option cards, not tiny checkboxes).
//
// Built on a real radio input rather than a styled div, so arrow keys move
// between options and screen readers announce it as "1 of 9" the way any other
// radio group would. The input itself is hidden; the card is its label.

import { Check } from "lucide-react";
import type { ReactNode } from "react";

export function OptionCard({
  name,
  value,
  checked,
  onSelect,
  title,
  description,
  icon,
  disabled,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  title: string;
  description: string;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={`group relative flex cursor-pointer gap-4 rounded-lg border p-5 transition-all ${
        checked
          ? "border-primary bg-surface shadow-glow"
          : "border-border bg-surface/50 hover:border-text-disabled hover:bg-surface-elevated"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""} has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
        className="sr-only"
      />

      {icon && (
        <span
          aria-hidden
          className={`mt-0.5 shrink-0 transition-colors ${
            checked ? "text-primary" : "text-text-secondary"
          }`}
        >
          {icon}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-semibold text-text-primary">{title}</span>
          {checked && (
            <Check aria-hidden className="size-4 shrink-0 text-primary" />
          )}
        </span>
        <span className="mt-1 block text-pretty text-small leading-relaxed text-text-secondary">
          {description}
        </span>
      </span>
    </label>
  );
}

"use client";

// The frame every setup step sits in: one question per screen, the heading,
// an error area, and the buttons that move you on (Design.md §5).

import { AlertCircle, ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function StepShell({
  title,
  description,
  error,
  backHref,
  onSubmit,
  isSubmitting,
  submitLabel = "Continue",
  canSubmit = true,
  children,
}: {
  title: string;
  description: string;
  error?: string | null;
  /** Omitted on the first step, where there is nothing to go back to. */
  backHref?: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  submitLabel?: string;
  canSubmit?: boolean;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <h1 className="text-balance text-h1 font-bold tracking-tight text-text-primary">
        {title}
      </h1>
      <p className="mt-3 max-w-[62ch] text-pretty leading-relaxed text-text-secondary">
        {description}
      </p>

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-8">{children}</div>

      <div className="mt-10 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        {backHref ? (
          <Button asChild variant="ghost" size="lg">
            <Link href={backHref}>
              <ArrowLeft />
              Back
            </Link>
          </Button>
        ) : (
          <span className="hidden sm:block" />
        )}

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting || !canSubmit}
          className="sm:min-w-40"
        >
          {isSubmitting ? (
            <>
              <LoaderCircle className="animate-spin" />
              Saving…
            </>
          ) : (
            <>
              {submitLabel}
              <ArrowRight />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

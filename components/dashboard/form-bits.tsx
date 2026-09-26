// Small pieces shared by the CRM and integration screens, so each new form
// looks and behaves like the ones already in the dashboard.

import { AlertCircle } from "lucide-react";
import type { ReactNode, SelectHTMLAttributes } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";

/** A plain <select> styled like the Input component. */
export function NativeSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-10 w-full rounded-md border border-border bg-surface px-3 text-small text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 ${props.className ?? ""}`}
    />
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface/50 p-8">
      <h2 className="text-h3 font-semibold text-text-primary">{title}</h2>
      <div className="mt-2 max-w-[62ch] text-pretty text-small leading-relaxed text-text-secondary">
        {children}
      </div>
    </div>
  );
}

export function Section({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h3 font-semibold text-text-primary">{title}</h2>
          {description && (
            <p className="mt-1 max-w-[68ch] text-pretty text-small text-text-secondary">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A small rounded label, e.g. a tag or a status. */
export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "primary";
}) {
  const tones = {
    neutral: "bg-surface-elevated text-text-secondary",
    good: "bg-success/15 text-success",
    warn: "bg-warning/15 text-warning",
    bad: "bg-error/15 text-error",
    primary: "bg-primary/15 text-primary",
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

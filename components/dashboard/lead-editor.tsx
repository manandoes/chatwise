"use client";

// Correcting a lead by hand.
//
// The thing this screen has to make obvious — and the reason it looks different
// from every other form in the dashboard — is that a person and an agent are
// both writing to these fields. So each one says who last had it: a field the
// agent keeps current, or a field you have taken over and it will not touch
// again (docs/Rules.md §5).
//
// Nothing is claimed just by opening the form. A field becomes yours when you
// actually change its value, which is why the badges only appear after a save.

import { AlertCircle, Check, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  LEAD_STATUS_OPTIONS,
  validateLeadEdit,
  type LeadEditErrors,
  type LeadEditInput,
} from "@/lib/validation/leads";

export function LeadEditor({
  leadId,
  initial,
  editedByHuman,
}: {
  leadId: string;
  initial: LeadEditInput;
  /** Fields a person has already taken over, from the database. */
  editedByHuman: string[];
}) {
  const router = useRouter();

  const [values, setValues] = useState(initial);
  const [mine, setMine] = useState(() => new Set(editedByHuman));
  const [errors, setErrors] = useState<LeadEditErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  function set<K extends keyof LeadEditInput>(key: K, value: LeadEditInput[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setJustSaved(false);
  }

  async function save() {
    setFormError(null);

    const checked = validateLeadEdit(values);

    if (!checked.ok) {
      setErrors(checked.errors);

      return;
    }

    setErrors({});
    setIsSaving(true);

    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setErrors(payload?.error?.fields ?? {});
        setFormError(
          payload?.error?.message ?? "We couldn't save that. Try again.",
        );

        return;
      }

      setMine((current) => {
        const next = new Set(current);

        for (const field of payload.claimed as string[]) next.add(field);

        return next;
      });

      setJustSaved(true);
      router.refresh();
    } catch {
      setFormError("We couldn't reach ChatWise. Check your connection.");
    } finally {
      setIsSaving(false);
    }
  }

  /** Says who owns a field, under its label. */
  const owner = (field: string) => (
    <Owner
      isMine={mine.has(field)}
      waived={values.letTheAgentUpdateThis}
    />
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Who they are</CardTitle>
          <CardDescription>
            Your agent fills these in from the conversation. Anything you
            correct here is yours from then on.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <Field
            id="name"
            label="Name"
            owner={owner("name")}
            error={errors.name}
          >
            <Input
              id="name"
              value={values.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Not known yet"
            />
          </Field>

          <Field
            id="email"
            label="Email"
            owner={owner("email")}
            error={errors.email}
          >
            <Input
              id="email"
              type="email"
              value={values.email}
              onChange={(event) => set("email", event.target.value)}
              placeholder="Not known yet"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Where they&rsquo;ve got to</CardTitle>
          <CardDescription>
            How promising this enquiry is, and what you&rsquo;d call it.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <Label>Status</Label>
              {owner("status")}
            </div>

            <div className="flex flex-wrap gap-2">
              {LEAD_STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => set("status", option.value)}
                  title={option.hint}
                  aria-pressed={values.status === option.value}
                  className={[
                    "rounded-full border px-3 py-1.5 text-small transition-colors",
                    values.status === option.value
                      ? "border-primary/40 bg-primary/10 text-text-primary"
                      : "border-border text-text-secondary hover:bg-surface-elevated",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {errors.status && (
              <p className="text-small text-error">{errors.status}</p>
            )}
          </div>

          <Field
            id="score"
            label="Score out of 100"
            hint="How well they match what a good enquiry looks like for you. Leave it empty if you'd rather not say."
            owner={owner("score")}
            error={errors.score}
          >
            <Input
              id="score"
              inputMode="numeric"
              value={values.score}
              onChange={(event) => set("score", event.target.value)}
              placeholder="—"
              className="max-w-28"
            />
          </Field>

          <Field
            id="tags"
            label="Tags"
            hint="Separate them with commas, e.g. wants delivery, price-sensitive."
            owner={owner("tags")}
            error={errors.tags}
          >
            <Input
              id="tags"
              value={values.tags}
              onChange={(event) => set("tags", event.target.value)}
              placeholder="No tags yet"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What they want</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <Field
            id="summary"
            label="Summary"
            hint="A sentence or two on what this person is after."
            owner={owner("summary")}
            error={errors.summary}
          >
            <Textarea
              id="summary"
              value={values.summary}
              onChange={(event) => set("summary", event.target.value)}
            />
          </Field>

          <Field
            id="nextStep"
            label="Next step"
            hint="What you should do about them."
            owner={owner("nextStep")}
            error={errors.nextStep}
          >
            <Textarea
              id="nextStep"
              value={values.nextStep}
              onChange={(event) => set("nextStep", event.target.value)}
            />
          </Field>

          <Field
            id="notes"
            label="Your notes"
            hint="Just for you. Your agent never reads or writes this."
            error={errors.notes}
          >
            <Textarea
              id="notes"
              value={values.notes}
              onChange={(event) => set("notes", event.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Who keeps this up to date</CardTitle>
          <CardDescription>
            By default, anything you edit here stops being your agent&rsquo;s
            business. Turn this on if you&rsquo;d rather it kept everything
            current, including the things you&rsquo;ve changed.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-primary"
              checked={values.letTheAgentUpdateThis}
              onChange={(event) =>
                set("letTheAgentUpdateThis", event.target.checked)
              }
            />

            <span className="text-small leading-relaxed text-text-secondary">
              Let my agent update this lead, even the fields I&rsquo;ve edited.
              <span className="mt-1 block text-xs text-text-disabled">
                Your edits are remembered either way — turn this back off and
                they&rsquo;re protected again.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      {formError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={isSaving}>
          {isSaving && <LoaderCircle className="size-4 animate-spin" />}
          {isSaving ? "Saving…" : "Save changes"}
        </Button>

        {justSaved && (
          <span className="flex items-center gap-1.5 text-small text-primary">
            <Check className="size-4" />
            Saved
          </span>
        )}
      </div>
    </div>
  );
}

/** The line under a label saying whose field this is. */
function Owner({ isMine, waived }: { isMine: boolean; waived: boolean }) {
  if (waived) {
    return (
      <span className="text-xs text-text-disabled">
        Your agent may update this
      </span>
    );
  }

  return isMine ? (
    <span className="text-xs text-primary">
      Yours — your agent won&rsquo;t change it
    </span>
  ) : (
    <span className="text-xs text-text-disabled">
      Your agent keeps this up to date
    </span>
  );
}

/** One labelled box, with a line underneath saying who owns it. */
function Field({
  id,
  label,
  hint,
  owner,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  owner?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <Label htmlFor={id}>{label}</Label>
        {owner}
      </div>

      {hint && <p className="text-xs text-text-secondary">{hint}</p>}

      {children}

      {error && <p className="text-small text-error">{error}</p>}
    </div>
  );
}

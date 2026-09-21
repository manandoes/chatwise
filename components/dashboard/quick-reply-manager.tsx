"use client";

// The saved-reply library — add, edit, and delete the things you type into
// conversations often. Mirrors the shape of components/dashboard/
// template-editor.tsx, which does the same job for campaign templates.

import { AlertCircle, Check, LoaderCircle, Plus, Trash2 } from "lucide-react";
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
import type { QuickReplyRow } from "@/lib/quick-replies";

const BLANK = { id: "", title: "", body: "" };

export function QuickReplyManager({ initial }: { initial: QuickReplyRow[] }) {
  const router = useRouter();

  const [values, setValues] = useState(BLANK);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [justSaved, setJustSaved] = useState(false);

  function set(key: "title" | "body", value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setJustSaved(false);
  }

  function edit(reply: QuickReplyRow) {
    setValues({ id: reply.id, title: reply.title, body: reply.body });
    setIsOpen(true);
    setError(null);
    setFieldErrors({});
  }

  async function save() {
    setError(null);
    setFieldErrors({});
    setIsSaving(true);

    try {
      const response = await fetch(
        values.id ? `/api/quick-replies/${values.id}` : "/api/quick-replies",
        {
          method: values.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: values.title, body: values.body }),
        },
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFieldErrors(payload?.error?.fields ?? {});
        setError(payload?.error?.message ?? "We couldn't save that.");

        return;
      }

      setValues(BLANK);
      setIsOpen(false);
      setJustSaved(true);
      router.refresh();
    } catch {
      setError("We couldn't reach ChatWise. Check your connection.");
    } finally {
      setIsSaving(false);
    }
  }

  async function remove(id: string) {
    setError(null);

    try {
      const response = await fetch(`/api/quick-replies/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setError("We couldn't delete that. Try again.");

        return;
      }

      router.refresh();
    } catch {
      setError("We couldn't reach ChatWise. Check your connection.");
    }
  }

  return (
    <div className="space-y-6">
      {initial.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {initial.map((reply) => (
            <li key={reply.id} className="space-y-2 px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-medium text-text-primary">
                  {reply.title}
                </span>

                <span className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => edit(reply)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${reply.title}`}
                    onClick={() => remove(reply.id)}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </div>

              <p className="whitespace-pre-wrap text-small leading-relaxed text-text-secondary">
                {reply.body}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        !isOpen && (
          <div className="rounded-lg border border-border bg-surface/50 p-8">
            <h2 className="text-h3 font-semibold text-text-primary">
              No saved replies yet
            </h2>
            <p className="mt-2 max-w-[62ch] text-pretty text-small leading-relaxed text-text-secondary">
              Add the things you type often — an opening line, a standard
              answer — and pick them from any conversation instead of typing
              them out again.
            </p>
          </div>
        )
      )}

      {!isOpen ? (
        <Button type="button" onClick={() => setIsOpen(true)}>
          <Plus className="size-4" />
          Add a quick reply
        </Button>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{values.id ? "Edit quick reply" : "New quick reply"}</CardTitle>
            <CardDescription>
              Give it a short name so you can find it fast, and write exactly
              what should be sent.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="quick-reply-title">Name</Label>
              <Input
                id="quick-reply-title"
                value={values.title}
                onChange={(event) => set("title", event.target.value)}
                placeholder="Opening line"
                aria-invalid={Boolean(fieldErrors.title)}
              />
              {fieldErrors.title && (
                <p className="text-small text-error">{fieldErrors.title}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-reply-body">The message</Label>
              <Textarea
                id="quick-reply-body"
                rows={4}
                value={values.body}
                onChange={(event) => set("body", event.target.value)}
                placeholder="Hi! Thanks for reaching out — how can I help?"
                aria-invalid={Boolean(fieldErrors.body)}
              />
              {fieldErrors.body && (
                <p className="text-small text-error">{fieldErrors.body}</p>
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={save} disabled={isSaving}>
                {isSaving && <LoaderCircle className="size-4 animate-spin" />}
                {isSaving ? "Saving…" : "Save quick reply"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setValues(BLANK);
                  setIsOpen(false);
                  setError(null);
                  setFieldErrors({});
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {justSaved && (
        <p className="flex items-center gap-1.5 text-small text-primary">
          <Check className="size-4" />
          Saved
        </p>
      )}

      {error && !isOpen && <p className="text-small text-error">{error}</p>}
    </div>
  );
}

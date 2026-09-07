"use client";

// The messages a business keeps to reuse.
//
// On the QR tier this is a convenience — somewhere to keep wording you send
// often. On the API tier it is closer to a record: the words live at Meta,
// under a name they approved, and this is where the account writes down what
// that name is. The form changes shape accordingly, because asking a QR-tier
// customer for a Meta template name would be asking about something they do
// not have (docs/Rules.md §7).

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
import { STARTER_TEMPLATES } from "@/campaigns/templates/starter-templates";

export type EditableTemplate = {
  id: string;
  name: string;
  body: string;
  metaName: string | null;
  metaLanguage: string | null;
  approval: string;
  approvalLabel: string;
};

const APPROVAL_CHOICES = [
  { value: "NOT_SUBMITTED", label: "Not sent to Meta yet" },
  { value: "PENDING", label: "Waiting for Meta" },
  { value: "APPROVED", label: "Approved by Meta" },
  { value: "REJECTED", label: "Rejected by Meta" },
];

const BLANK = {
  id: "",
  name: "",
  body: "",
  metaName: "",
  metaLanguage: "en_US",
  approval: "NOT_SUBMITTED",
};

export function TemplateEditor({
  templates,
  needsMetaApproval,
  optOutLine,
}: {
  templates: EditableTemplate[];
  /** True on the API tier, where a template is a thing registered at Meta. */
  needsMetaApproval: boolean;
  optOutLine: string;
}) {
  const router = useRouter();

  const [values, setValues] = useState(BLANK);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  function set(key: keyof typeof BLANK, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setJustSaved(false);
  }

  function edit(template: EditableTemplate) {
    setValues({
      id: template.id,
      name: template.name,
      body: template.body,
      metaName: template.metaName ?? "",
      metaLanguage: template.metaLanguage ?? "en_US",
      approval: template.approval,
    });
    setIsOpen(true);
    setError(null);
  }

  async function save() {
    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, id: values.id || undefined }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
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
      const response = await fetch(`/api/templates/${id}`, { method: "DELETE" });

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
      {templates.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {templates.map((template) => (
            <li key={template.id} className="space-y-2 px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-medium text-text-primary">
                  {template.name}
                </span>

                <span className="flex items-center gap-3">
                  {needsMetaApproval && (
                    <span className="text-xs text-text-secondary">
                      {template.approvalLabel}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => edit(template)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${template.name}`}
                    onClick={() => remove(template.id)}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </div>

              <p className="whitespace-pre-wrap text-small leading-relaxed text-text-secondary">
                {template.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      {!isOpen ? (
        <Button type="button" onClick={() => setIsOpen(true)}>
          <Plus className="size-4" />
          Add a template
        </Button>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{values.id ? "Edit template" : "New template"}</CardTitle>
            <CardDescription>
              {needsMetaApproval
                ? "Meta has to approve the words before they can be sent. Write down here what you registered with them."
                : "Write it once, use it whenever. {name} is filled in for each person."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="template-name">Name</Label>
              <Input
                id="template-name"
                value={values.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="Monthly offer"
              />
            </div>

            {!values.id && (
              <div className="space-y-2">
                <Label>Start from one of ours</Label>
                <div className="flex flex-wrap gap-2">
                  {STARTER_TEMPLATES.map((starter) => (
                    <button
                      key={starter.id}
                      type="button"
                      onClick={() => {
                        set("body", starter.body);
                        if (!values.name) set("name", starter.name);
                      }}
                      className="rounded-full border border-border px-3 py-1.5 text-small text-text-secondary transition-colors hover:bg-surface-elevated"
                    >
                      {starter.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="template-body">The message</Label>
              <Textarea
                id="template-body"
                rows={4}
                value={values.body}
                onChange={(event) => set("body", event.target.value)}
                placeholder="Hi {name}, …"
              />
              {needsMetaApproval && (
                <p className="text-xs text-text-secondary">
                  It has to tell people how to stop hearing from you — something
                  like &ldquo;{optOutLine}&rdquo; — because we can&rsquo;t add
                  that to an approved template afterwards.
                </p>
              )}
            </div>

            {needsMetaApproval && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="template-meta-name">
                    Its name in Meta
                  </Label>
                  <p className="text-xs text-text-secondary">
                    Exactly as it appears in your WhatsApp Manager — lower-case
                    letters, numbers and underscores.
                  </p>
                  <Input
                    id="template-meta-name"
                    value={values.metaName}
                    onChange={(event) => set("metaName", event.target.value)}
                    placeholder="october_offer"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-language">Language code</Label>
                  <Input
                    id="template-language"
                    value={values.metaLanguage}
                    onChange={(event) => set("metaLanguage", event.target.value)}
                    placeholder="en_US"
                    className="max-w-40"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Where Meta has got to</Label>
                  <div className="flex flex-wrap gap-2">
                    {APPROVAL_CHOICES.map((choice) => (
                      <button
                        key={choice.value}
                        type="button"
                        onClick={() => set("approval", choice.value)}
                        aria-pressed={values.approval === choice.value}
                        className={[
                          "rounded-full border px-3 py-1.5 text-small transition-colors",
                          values.approval === choice.value
                            ? "border-primary/40 bg-primary/10 text-text-primary"
                            : "border-border text-text-secondary hover:bg-surface-elevated",
                        ].join(" ")}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-text-secondary">
                    We can&rsquo;t see inside your Meta account, so we go by what
                    you tell us. Only approved templates can be sent — and Meta
                    will refuse an unapproved one regardless.
                  </p>
                </div>
              </>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={save} disabled={isSaving}>
                {isSaving && <LoaderCircle className="size-4 animate-spin" />}
                {isSaving ? "Saving…" : "Save template"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setValues(BLANK);
                  setIsOpen(false);
                  setError(null);
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

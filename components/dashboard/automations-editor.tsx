"use client";

// Switching automated WhatsApp messages on and off, and editing what they say.
//
// Each message saves on its own, so a half-edited message never holds up
// switching another one on.

import { Check, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorNote, NativeSelect, Pill } from "@/components/dashboard/form-bits";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callApi } from "@/lib/client-api";

type Automation = {
  kind: string;
  label: string;
  description: string;
  group: string;
  placeholders: string[];
  defaultDelayMinutes?: number;
  enabled: boolean;
  body: string;
  delayMinutes: number | null;
  templateId: string | null;
};

type Template = { id: string; name: string };

export function AutomationsEditor({
  automations,
  templates,
  isBusinessApi,
}: {
  automations: Automation[];
  templates: Template[];
  isBusinessApi: boolean;
}) {
  const groups = [...new Set(automations.map((automation) => automation.group))];

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group} className="space-y-3">
          <h3 className="text-small font-semibold uppercase tracking-wide text-text-secondary">{group}</h3>
          <ul className="space-y-3">
            {automations
              .filter((automation) => automation.group === group)
              .map((automation) => (
                <AutomationRow
                  key={automation.kind}
                  automation={automation}
                  templates={templates}
                  isBusinessApi={isBusinessApi}
                />
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function AutomationRow({
  automation,
  templates,
  isBusinessApi,
}: {
  automation: Automation;
  templates: Template[];
  isBusinessApi: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(automation.enabled);
  const [body, setBody] = useState(automation.body);
  const [templateId, setTemplateId] = useState(automation.templateId ?? "");
  const [delay, setDelay] = useState(String(automation.delayMinutes ?? ""));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(changes: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setSaved(false);

    const result = await callApi(`/api/automations/${automation.kind}`, { method: "PATCH", body: changes });

    setBusy(false);

    if (!result.ok) {
      setError(Object.values(result.fields)[0] ?? result.message);
      return false;
    }

    setSaved(true);
    router.refresh();
    return true;
  }

  async function toggle(next: boolean) {
    setEnabled(next);

    if (!(await save({ enabled: next }))) setEnabled(!next);
  }

  const id = `automation-${automation.kind}`;
  const hasDelay = automation.defaultDelayMinutes !== undefined;

  return (
    <li className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-text-primary">{automation.label}</p>
            <Pill tone={enabled ? "good" : "neutral"}>{enabled ? "On" : "Off"}</Pill>
          </div>
          <p className="mt-1 text-small text-text-secondary">{automation.description}</p>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-small text-text-primary">
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy}
              onChange={(event) => toggle(event.target.checked)}
              className="size-4 rounded border-border"
            />
            Send this
          </label>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? "Close" : "Edit"}
          </Button>
        </div>
      </div>

      {open && (
        <form
          className="mt-4 space-y-4 border-t border-border pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save({
              body,
              templateId: templateId || null,
              ...(hasDelay ? { delayMinutes: Number(delay) } : {}),
            });
          }}
        >
          <ErrorNote message={error} />

          <div className="space-y-2">
            <Label htmlFor={`${id}-body`}>Message</Label>
            <Textarea
              id={`${id}-body`}
              value={body}
              rows={3}
              onChange={(event) => {
                setBody(event.target.value);
                setSaved(false);
              }}
            />
            <p className="text-xs text-text-secondary">
              You can use {automation.placeholders.map((name) => `{${name}}`).join(", ")}.
            </p>
          </div>

          {hasDelay && (
            <div className="max-w-xs space-y-2">
              <Label htmlFor={`${id}-delay`}>Wait before sending (minutes)</Label>
              <input
                id={`${id}-delay`}
                type="number"
                min={15}
                max={10080}
                value={delay}
                onChange={(event) => setDelay(event.target.value)}
                className="h-10 w-full rounded-md border border-border bg-surface px-3 text-small text-text-primary"
              />
            </div>
          )}

          {isBusinessApi && (
            <div className="max-w-md space-y-2">
              <Label htmlFor={`${id}-template`}>Approved template for later messages</Label>
              <NativeSelect
                id={`${id}-template`}
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
              >
                <option value="">None — only send within 24 hours of their last message</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-xs text-text-secondary">
                WhatsApp only lets you message someone with your own words within 24 hours of
                their last message. After that it needs a template Meta has approved.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy && <LoaderCircle className="animate-spin" />}
              Save
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-small text-success">
                <Check className="size-4" /> Saved
              </span>
            )}
          </div>
        </form>
      )}
    </li>
  );
}

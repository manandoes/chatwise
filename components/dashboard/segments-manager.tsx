"use client";

// Saved segments and auto-tag rules. Both are built with the same filter
// form (segment-filter-form.tsx) because both are the same filter language.

import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorNote, Pill } from "@/components/dashboard/form-bits";
import {
  EMPTY_DRAFT,
  fromFilter,
  SegmentFilterForm,
  toFilter,
  type FilterDraft,
} from "@/components/dashboard/segment-filter-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi } from "@/lib/client-api";

export type SegmentRow = {
  id: string;
  name: string;
  description: string;
  count: number | null;
  filter: Record<string, unknown>;
};

export type RuleRow = {
  id: string;
  name: string;
  tagName: string;
  description: string;
  enabled: boolean;
  lastRun: string | null;
  filter: Record<string, unknown>;
};

type Editing = { kind: "segment" | "rule"; id: string | null; name: string; tagName: string; draft: FilterDraft };

export function SegmentsManager({
  segments,
  rules,
  canEditRules,
}: {
  segments: SegmentRow[];
  rules: RuleRow[];
  canEditRules: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);

    const result = await callApi(url, { method, body });

    setBusy(false);

    if (!result.ok) {
      setError(Object.values(result.fields)[0] ?? result.message);
      return false;
    }

    router.refresh();
    return true;
  }

  async function save() {
    if (!editing) return;

    const filter = toFilter(editing.draft);
    const ok =
      editing.kind === "segment"
        ? editing.id
          ? await act(`/api/segments/${editing.id}`, "PATCH", { name: editing.name, filter })
          : await act("/api/segments", "POST", { name: editing.name, filter })
        : editing.id
          ? await act(`/api/tag-rules/${editing.id}`, "PATCH", { name: editing.name, filter })
          : await act("/api/tag-rules", "POST", { name: editing.name, tagName: editing.tagName, filter });

    if (ok) setEditing(null);
  }

  const editor = editing && (
    <div className="space-y-4 rounded-lg border border-primary/40 bg-surface p-5">
      <h3 className="font-semibold text-text-primary">
        {editing.id ? "Edit" : "New"} {editing.kind === "segment" ? "segment" : "auto-tag rule"}
      </h3>
      <ErrorNote message={error} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="edit-name">Name</Label>
          <Input
            id="edit-name"
            value={editing.name}
            onChange={(event) => setEditing({ ...editing, name: event.target.value })}
            placeholder={editing.kind === "segment" ? "Big spenders" : "Tag lapsed customers"}
          />
        </div>
        {editing.kind === "rule" && !editing.id && (
          <div className="space-y-1">
            <Label htmlFor="edit-tag">Tag to add</Label>
            <Input
              id="edit-tag"
              value={editing.tagName}
              onChange={(event) => setEditing({ ...editing, tagName: event.target.value })}
              placeholder="lapsed"
            />
          </div>
        )}
      </div>

      <SegmentFilterForm
        idPrefix="edit"
        draft={editing.draft}
        onChange={(draft) => setEditing({ ...editing, draft })}
      />

      {editing.kind === "rule" && (
        <p className="text-xs text-text-secondary">
          Contacts who match get the tag; anyone who stops matching loses it again. A tag you add
          to someone by hand is never taken off by a rule. Rules re-check every day and whenever an
          order arrives.
        </p>
      )}

      <div className="flex gap-2">
        <Button type="button" onClick={save} disabled={busy}>
          {busy && <LoaderCircle className="animate-spin" />}
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-h3 font-semibold text-text-primary">Segments</h2>
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditing({ kind: "segment", id: null, name: "", tagName: "", draft: EMPTY_DRAFT })}
          >
            <Plus /> New segment
          </Button>
        </div>

        {editing?.kind === "segment" && editor}
        {!editing && <ErrorNote message={error} />}

        {segments.length === 0 ? (
          <p className="text-small text-text-secondary">
            No segments yet. A segment is a saved filter — &ldquo;spent over 5,000 and ordered in the
            last 90 days&rdquo; — that you can send a campaign to, export, or browse.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {segments.map((segment) => (
              <li key={segment.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text-primary">
                    {segment.name}{" "}
                    <span className="text-small font-normal text-text-secondary">
                      · {segment.count === null ? "can't be read" : `${segment.count.toLocaleString("en-IN")} contacts`}
                    </span>
                  </p>
                  <p className="text-small text-text-secondary">{segment.description}</p>
                </div>
                <Link href={`/dashboard/contacts?segment=${segment.id}`} className="text-small text-primary underline">
                  View contacts
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${segment.name}`}
                  onClick={() =>
                    setEditing({ kind: "segment", id: segment.id, name: segment.name, tagName: "", draft: fromFilter(segment.filter) })
                  }
                >
                  <Pencil />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${segment.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete the segment "${segment.name}"? Contacts aren't affected.`)) {
                      void act(`/api/segments/${segment.id}`, "DELETE");
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-h3 font-semibold text-text-primary">Auto-tag rules</h2>
            <p className="text-small text-text-secondary">Tags that keep themselves up to date.</p>
          </div>
          {canEditRules && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing({ kind: "rule", id: null, name: "", tagName: "", draft: EMPTY_DRAFT })}
            >
              <Plus /> New rule
            </Button>
          )}
        </div>

        {editing?.kind === "rule" && editor}

        {rules.length === 0 ? (
          <p className="text-small text-text-secondary">
            No rules yet. For example: tag everyone with no order in 60 days as &ldquo;lapsed&rdquo;.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-text-primary">
                    {rule.name} <Pill tone="primary">{rule.tagName}</Pill>
                    {!rule.enabled && <Pill>Off</Pill>}
                  </p>
                  <p className="text-small text-text-secondary">
                    {rule.description}
                    {rule.lastRun ? ` · last applied ${rule.lastRun}` : " · waiting to run"}
                  </p>
                </div>
                {canEditRules && (
                  <>
                    <label className="flex items-center gap-2 text-small text-text-primary">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={rule.enabled}
                        disabled={busy}
                        onChange={(event) => act(`/api/tag-rules/${rule.id}`, "PATCH", { enabled: event.target.checked })}
                      />
                      On
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${rule.name}`}
                      onClick={() =>
                        setEditing({ kind: "rule", id: rule.id, name: rule.name, tagName: rule.tagName, draft: fromFilter(rule.filter) })
                      }
                    >
                      <Pencil />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${rule.name}`}
                      onClick={() => {
                        if (window.confirm(`Delete "${rule.name}"? The "${rule.tagName}" tags it added are taken off; ones added by hand stay.`)) {
                          void act(`/api/tag-rules/${rule.id}`, "DELETE");
                        }
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

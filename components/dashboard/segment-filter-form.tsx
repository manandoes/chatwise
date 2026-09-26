"use client";

// The controls for building a segment filter — used by Segments and by
// auto-tag rules, which share one filter language (lib/segments.ts).
//
// Every box is optional; only the ones filled in become conditions. As the
// filter changes, the server says how many contacts match and reads the
// filter back in plain English, so nobody saves a filter they misread.

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi } from "@/lib/client-api";

/** What the form holds: strings, as typed. `toFilter` turns it into the real filter. */
export type FilterDraft = {
  tagsAny: string;
  tagsAll: string;
  tagsNone: string;
  optIn: "" | "OPTED_IN" | "PENDING_OR_IN" | "OPTED_OUT";
  languages: string;
  minTotalSpent: string;
  maxTotalSpent: string;
  minOrders: string;
  maxOrders: string;
  orderedWithinDays: string;
  noOrderForDays: string;
  neverOrdered: boolean;
  addedWithinDays: string;
  abandonedCartHours: string;
};

export const EMPTY_DRAFT: FilterDraft = {
  tagsAny: "",
  tagsAll: "",
  tagsNone: "",
  optIn: "",
  languages: "",
  minTotalSpent: "",
  maxTotalSpent: "",
  minOrders: "",
  maxOrders: "",
  orderedWithinDays: "",
  noOrderForDays: "",
  neverOrdered: false,
  addedWithinDays: "",
  abandonedCartHours: "",
};

function list(text: string) {
  return text.split(",").map((item) => item.trim()).filter(Boolean);
}

function num(text: string) {
  return text.trim() === "" ? undefined : Number(text);
}

/** The draft as the filter object the API expects. Blank boxes are left out. */
export function toFilter(draft: FilterDraft): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (list(draft.tagsAny).length) filter.tagsAny = list(draft.tagsAny);
  if (list(draft.tagsAll).length) filter.tagsAll = list(draft.tagsAll);
  if (list(draft.tagsNone).length) filter.tagsNone = list(draft.tagsNone);
  if (draft.optIn === "OPTED_IN") filter.optInStatus = ["OPTED_IN"];
  if (draft.optIn === "PENDING_OR_IN") filter.optInStatus = ["PENDING", "OPTED_IN"];
  if (draft.optIn === "OPTED_OUT") filter.optInStatus = ["OPTED_OUT"];
  if (list(draft.languages).length) filter.languages = list(draft.languages);

  for (const key of ["minTotalSpent", "maxTotalSpent", "minOrders", "maxOrders"] as const) {
    const value = num(draft[key]);

    if (value !== undefined) filter[key] = value;
  }

  const within = num(draft.orderedWithinDays);
  const older = num(draft.noOrderForDays);

  if (within !== undefined || older !== undefined) {
    filter.lastOrder = { ...(within !== undefined ? { withinDays: within } : {}), ...(older !== undefined ? { olderThanDays: older } : {}) };
  }

  if (draft.neverOrdered) filter.neverOrdered = true;

  const added = num(draft.addedWithinDays);

  if (added !== undefined) filter.created = { withinDays: added };

  const hours = num(draft.abandonedCartHours);

  if (hours !== undefined) filter.abandonedCartOlderThanHours = hours;

  return filter;
}

/** A stored filter back into the form, for editing. */
export function fromFilter(filter: Record<string, unknown>): FilterDraft {
  const f = filter as {
    tagsAny?: string[];
    tagsAll?: string[];
    tagsNone?: string[];
    optInStatus?: string[];
    languages?: string[];
    minTotalSpent?: number;
    maxTotalSpent?: number;
    minOrders?: number;
    maxOrders?: number;
    lastOrder?: { withinDays?: number; olderThanDays?: number };
    neverOrdered?: boolean;
    created?: { withinDays?: number };
    abandonedCartOlderThanHours?: number;
  };
  const status = [...(f.optInStatus ?? [])].sort().join(",");
  const str = (value: number | undefined) => (value === undefined ? "" : String(value));

  return {
    tagsAny: (f.tagsAny ?? []).join(", "),
    tagsAll: (f.tagsAll ?? []).join(", "),
    tagsNone: (f.tagsNone ?? []).join(", "),
    optIn:
      status === "OPTED_IN" ? "OPTED_IN" : status === "OPTED_IN,PENDING" ? "PENDING_OR_IN" : status === "OPTED_OUT" ? "OPTED_OUT" : "",
    languages: (f.languages ?? []).join(", "),
    minTotalSpent: str(f.minTotalSpent),
    maxTotalSpent: str(f.maxTotalSpent),
    minOrders: str(f.minOrders),
    maxOrders: str(f.maxOrders),
    orderedWithinDays: str(f.lastOrder?.withinDays),
    noOrderForDays: str(f.lastOrder?.olderThanDays),
    neverOrdered: Boolean(f.neverOrdered),
    addedWithinDays: str(f.created?.withinDays),
    abandonedCartHours: str(f.abandonedCartOlderThanHours),
  };
}

type Preview = { count: number; optedIn: number; description: string } | { error: string } | null;

export function SegmentFilterForm({
  draft,
  onChange,
  idPrefix,
}: {
  draft: FilterDraft;
  onChange: (draft: FilterDraft) => void;
  idPrefix: string;
}) {
  const [preview, setPreview] = useState<Preview>(null);

  // Asks the server after typing pauses, so each keystroke isn't a query.
  useEffect(() => {
    const timer = setTimeout(async () => {
      const result = await callApi<{ count: number; optedIn: number; description: string }>(
        "/api/segments/preview",
        { body: { filter: toFilter(draft) } },
      );

      setPreview(result.ok ? result.data : { error: result.message });
    }, 400);

    return () => clearTimeout(timer);
  }, [draft]);

  function set<K extends keyof FilterDraft>(key: K, value: FilterDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  const box = (key: keyof FilterDraft, label: string, placeholder = "", numeric = false) => (
    <div className="space-y-1">
      <Label htmlFor={`${idPrefix}-${key}`} className="text-xs">
        {label}
      </Label>
      <Input
        id={`${idPrefix}-${key}`}
        value={draft[key] as string}
        inputMode={numeric ? "decimal" : undefined}
        placeholder={placeholder}
        onChange={(event) => set(key, event.target.value as never)}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-small font-medium text-text-primary">Tags (separate with commas)</legend>
        {box("tagsAny", "Has any of", "VIP, wholesale")}
        {box("tagsAll", "Has all of")}
        {box("tagsNone", "Has none of")}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-4">
        <legend className="mb-2 text-small font-medium text-text-primary">Spend and orders</legend>
        {box("minTotalSpent", "Spent at least", "", true)}
        {box("maxTotalSpent", "Spent at most", "", true)}
        {box("minOrders", "At least … orders", "", true)}
        {box("maxOrders", "At most … orders", "", true)}
        {box("orderedWithinDays", "Ordered in the last … days", "", true)}
        {box("noOrderForDays", "No order for … days", "", true)}
        {box("abandonedCartHours", "Left a cart over … hours ago", "", true)}
        <label className="flex items-end gap-2 pb-2 text-small text-text-primary">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={draft.neverOrdered}
            onChange={(event) => set("neverOrdered", event.target.checked)}
          />
          Never ordered
        </label>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-small font-medium text-text-primary">Everything else</legend>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-optIn`} className="text-xs">
            Consent
          </Label>
          <select
            id={`${idPrefix}-optIn`}
            value={draft.optIn}
            onChange={(event) => set("optIn", event.target.value as FilterDraft["optIn"])}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-small text-text-primary"
          >
            <option value="">Anyone</option>
            <option value="OPTED_IN">Opted in</option>
            <option value="PENDING_OR_IN">Not opted out</option>
            <option value="OPTED_OUT">Opted out</option>
          </select>
        </div>
        {box("languages", "Writes in (language codes)", "en, hi")}
        {box("addedWithinDays", "Added in the last … days", "", true)}
      </fieldset>

      <div className="rounded-md bg-surface-elevated px-4 py-3 text-small" aria-live="polite">
        {!preview ? (
          <span className="text-text-secondary">Counting…</span>
        ) : "error" in preview ? (
          <span className="text-error">{preview.error}</span>
        ) : (
          <span className="text-text-primary">
            <strong>{preview.count.toLocaleString("en-IN")}</strong> contacts match
            {preview.count > 0 && ` (${preview.optedIn.toLocaleString("en-IN")} opted in)`}:{" "}
            <span className="text-text-secondary">{preview.description}.</span>
          </span>
        )}
      </div>
    </div>
  );
}

"use client";

// Google Sheets on the Integrations screen: connecting a Google account,
// exporting contacts (once, daily or weekly), and the scheduled exports.
// Importing lives in sheets-import.tsx, shown underneath.

import { Check, ExternalLink, LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorNote, NativeSelect, Pill } from "@/components/dashboard/form-bits";
import { SheetsImport, type ImportRow } from "@/components/dashboard/sheets-import";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi } from "@/lib/client-api";

export type ScheduledRow = {
  id: string;
  url: string;
  sheetName: string;
  segmentName: string | null;
  frequency: "DAILY" | "WEEKLY";
  mode: string;
  enabled: boolean;
  nextRun: string;
  lastRun: string | null;
  lastError: string | null;
};

export function GoogleSheetsPanel({
  available,
  result,
  connection,
  segments,
  scheduled,
  imports,
}: {
  available: boolean;
  result: { tone: "good" | "bad"; text: string } | null;
  connection: { email: string | null; connectedWhen: string } | null;
  segments: { id: string; name: string }[];
  scheduled: ScheduledRow[];
  imports: ImportRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const banner = result && (
    <Alert variant={result.tone === "bad" ? "destructive" : "default"}>
      <AlertDescription>{result.text}</AlertDescription>
    </Alert>
  );

  if (!available) {
    return (
      <div className="space-y-4">
        {banner}
        <p className="text-small text-text-secondary">
          Google Sheets isn&apos;t switched on for this ChatWise installation yet.
        </p>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="space-y-4">
        {banner}
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-5">
          <p className="min-w-60 flex-1 text-small text-text-secondary">
            Connect a Google account to export your contacts to a spreadsheet — once, or every day
            or week — and to import contacts from one. We only ever touch the spreadsheets you point
            us at.
          </p>
          <Button asChild>
            <a href="/api/google/connect">Connect Google Sheets</a>
          </Button>
        </div>
      </div>
    );
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Google Sheets? Scheduled exports will pause until you reconnect.")) return;

    setBusy(true);
    setError(null);

    const response = await callApi("/api/google/disconnect", { method: "POST" });

    setBusy(false);

    if (!response.ok) setError(response.message);
    else router.refresh();
  }

  return (
    <div className="space-y-8">
      {banner}
      <ErrorNote message={error} />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-5">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium text-text-primary">
            {connection.email ?? "Google account"} <Pill tone="good">Connected</Pill>
          </p>
          <p className="text-small text-text-secondary">Connected {connection.connectedWhen}.</p>
        </div>
        <Button type="button" variant="outline" onClick={disconnect} disabled={busy}>
          Disconnect
        </Button>
      </div>

      <ExportForm segments={segments} />

      {scheduled.length > 0 && <ScheduledList rows={scheduled} />}

      <SheetsImport imports={imports} />
    </div>
  );
}

function ExportForm({ segments }: { segments: { id: string; name: string }[] }) {
  const router = useRouter();
  const [segmentId, setSegmentId] = useState("");
  const [spreadsheet, setSpreadsheet] = useState("");
  const [sheetName, setSheetName] = useState("Contacts");
  const [mode, setMode] = useState<"REPLACE" | "APPEND">("REPLACE");
  const [frequency, setFrequency] = useState<"ONCE" | "DAILY" | "WEEKLY">("ONCE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ rows: number; url: string } | null>(null);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);

    const body = { segmentId, spreadsheet, sheetName, mode, ...(frequency !== "ONCE" ? { frequency } : {}) };
    const result = await callApi<{ rows: number; url: string }>(
      frequency === "ONCE" ? "/api/sheets/export" : "/api/sheets/scheduled",
      { body },
    );

    setBusy(false);

    if (!result.ok) {
      setError(Object.values(result.fields)[0] ?? result.message);
      return;
    }

    setDone(result.data);
    router.refresh();
  }

  return (
    <form onSubmit={run} className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <h3 className="font-semibold text-text-primary">Export contacts</h3>
      <ErrorNote message={error} />

      {done && (
        <p className="flex flex-wrap items-center gap-2 text-small text-success">
          <Check className="size-4" /> Exported {done.rows.toLocaleString("en-IN")} contacts.
          <a href={done.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
            Open the spreadsheet <ExternalLink className="size-3.5" />
          </a>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="export-segment">Who</Label>
          <NativeSelect id="export-segment" value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
            <option value="">Every contact</option>
            {segments.map((segment) => (
              <option key={segment.id} value={segment.id}>
                Segment: {segment.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="export-frequency">When</Label>
          <NativeSelect id="export-frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}>
            <option value="ONCE">Just now</option>
            <option value="DAILY">Now, then every day</option>
            <option value="WEEKLY">Now, then every week</option>
          </NativeSelect>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="export-spreadsheet">Spreadsheet link (leave blank for a new one)</Label>
          <Input
            id="export-spreadsheet"
            value={spreadsheet}
            onChange={(e) => setSpreadsheet(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="export-tab">Tab</Label>
          <Input id="export-tab" value={sheetName} onChange={(e) => setSheetName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="export-mode">If the tab has rows already</Label>
          <NativeSelect id="export-mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="REPLACE">Replace them</option>
            <option value="APPEND">Add underneath</option>
          </NativeSelect>
        </div>
      </div>

      <Button type="submit" disabled={busy}>
        {busy && <LoaderCircle className="animate-spin" />}
        {frequency === "ONCE" ? "Export" : "Export and schedule"}
      </Button>
    </form>
  );
}

function ScheduledList({ rows }: { rows: ScheduledRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function act(url: string, method: string, body?: unknown) {
    setError(null);

    const result = await callApi(url, { method, body });

    if (!result.ok) setError(result.message);
    else router.refresh();
  }

  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-text-primary">Scheduled exports</h3>
      <ErrorNote message={error} />
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
            <div className="min-w-0 flex-1 text-small">
              <p className="flex flex-wrap items-center gap-2 font-medium text-text-primary">
                {row.segmentName ? `Segment: ${row.segmentName}` : "Every contact"} →{" "}
                <a href={row.url} target="_blank" rel="noreferrer" className="text-primary underline">
                  {row.sheetName}
                </a>
                <Pill>{row.frequency === "DAILY" ? "Daily" : "Weekly"}</Pill>
                {!row.enabled && <Pill>Paused</Pill>}
              </p>
              <p className="text-text-secondary">
                {row.mode === "APPEND" ? "Adds rows underneath" : "Replaces the tab"} ·{" "}
                {row.enabled ? `next ${row.nextRun}` : "paused"}
                {row.lastRun ? ` · last ran ${row.lastRun}` : ""}
              </p>
              {row.lastError && <p className="text-error">Last run failed: {row.lastError}</p>}
            </div>
            <label className="flex items-center gap-2 text-small text-text-primary">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={row.enabled}
                onChange={(event) => act(`/api/sheets/scheduled/${row.id}`, "PATCH", { enabled: event.target.checked })}
              />
              On
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Delete this scheduled export"
              onClick={() => {
                if (window.confirm("Stop and delete this scheduled export? The spreadsheet itself is kept.")) {
                  void act(`/api/sheets/scheduled/${row.id}`, "DELETE");
                }
              }}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

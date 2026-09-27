"use client";

// Importing contacts from a Google Sheet, in two steps: read the sheet and
// show the first rows with a guess at which column is which; the owner
// confirms, and the import runs in the background as one batch. Past imports
// are listed with what they did, their problem rows, and an Undo.

import { LoaderCircle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ErrorNote, NativeSelect, Pill } from "@/components/dashboard/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi } from "@/lib/client-api";

export type ImportRow = {
  id: string;
  when: string;
  source: string;
  status: "PROCESSING" | "COMPLETED" | "FAILED" | "ROLLED_BACK";
  rowCount: number;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  errors: { row: number; reason: string }[];
};

type Preview = {
  spreadsheetId: string;
  title: string;
  tabs: string[];
  tab: string;
  headers: string[];
  sample: string[][];
  rowCount: number;
  guess: Partial<Record<Field, number>>;
};

const FIELDS = [
  { key: "phone", label: "Phone number (required)" },
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "tags", label: "Tags (comma-separated)" },
  { key: "language", label: "Language" },
  { key: "consent", label: "Agreed to messages? (yes / no)" },
] as const;

type Field = (typeof FIELDS)[number]["key"];

const STATUS = {
  PROCESSING: { label: "Importing…", tone: "primary" },
  COMPLETED: { label: "Done", tone: "good" },
  FAILED: { label: "Failed", tone: "bad" },
  ROLLED_BACK: { label: "Undone", tone: "neutral" },
} as const;

export function SheetsImport({ imports }: { imports: ImportRow[] }) {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<Field, string>>>({});
  const [countryCode, setCountryCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const running = imports.some((row) => row.status === "PROCESSING");

  // While an import runs, look again every few seconds so its counts appear.
  useEffect(() => {
    if (!running) return;

    const timer = setInterval(() => router.refresh(), 4_000);

    return () => clearInterval(timer);
  }, [running, router]);

  async function load(tab?: string) {
    setBusy(true);
    setError(null);
    setNote(null);

    const result = await callApi<Preview>("/api/sheets/import/preview", {
      body: { spreadsheet: link, sheetName: tab ?? null },
    });

    setBusy(false);

    if (!result.ok) {
      setError(Object.values(result.fields)[0] ?? result.message);
      return;
    }

    setPreview(result.data);
    setMapping(
      Object.fromEntries(Object.entries(result.data.guess).map(([key, index]) => [key, String(index)])) as Partial<
        Record<Field, string>
      >,
    );
  }

  async function start() {
    if (!preview) return;

    setBusy(true);
    setError(null);

    const result = await callApi<{ batchId: string }>("/api/sheets/import", {
      body: {
        spreadsheetId: preview.spreadsheetId,
        sheetName: preview.tab,
        mapping: Object.fromEntries(FIELDS.map(({ key }) => [key, mapping[key] ? Number(mapping[key]) : null])),
        defaultCountryCode: countryCode,
      },
    });

    setBusy(false);

    if (!result.ok) {
      setError(Object.values(result.fields)[0] ?? result.message);
      return;
    }

    setPreview(null);
    setLink("");
    setNote("Import started. It appears below as it runs.");
    router.refresh();
  }

  async function undo(row: ImportRow) {
    if (!window.confirm(`Undo this import? Contacts it added are removed, unless they've been messaged or ordered since.`)) {
      return;
    }

    setError(null);

    const result = await callApi<{ removed: number; kept: number }>(`/api/sheets/import/${row.id}/rollback`, { method: "POST" });

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setNote(
      `Removed ${result.data.removed} contacts${result.data.kept ? `; kept ${result.data.kept} who've been in touch since` : ""}.`,
    );
    router.refresh();
  }

  return (
    <section className="space-y-4">
      <h3 className="font-semibold text-text-primary">Import contacts from a sheet</h3>
      <ErrorNote message={error} />
      {note && <p className="text-small text-success">{note}</p>}

      <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <div className="min-w-64 flex-1 space-y-1">
            <Label htmlFor="import-link">Spreadsheet link</Label>
            <Input
              id="import-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              required
            />
          </div>
          <Button type="submit" variant="outline" disabled={busy || running}>
            {busy && !preview && <LoaderCircle className="animate-spin" />}
            Preview
          </Button>
        </form>
        <p className="text-xs text-text-secondary">
          The first row should be column headings. The connected Google account needs to be able to
          open the sheet.
        </p>

        {preview && (
          <div className="space-y-4 border-t border-border pt-4">
            <div className="flex flex-wrap items-center gap-3 text-small">
              <span className="font-medium text-text-primary">{preview.title}</span>
              {preview.tabs.length > 1 && (
                <NativeSelect aria-label="Tab" className="w-48" value={preview.tab} onChange={(e) => load(e.target.value)}>
                  {preview.tabs.map((tab) => (
                    <option key={tab} value={tab}>
                      {tab}
                    </option>
                  ))}
                </NativeSelect>
              )}
              <span className="text-text-secondary">{preview.rowCount.toLocaleString("en-IN")} rows</span>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-elevated text-text-secondary">
                  <tr>
                    {preview.headers.map((header, index) => (
                      <th key={index} className="whitespace-nowrap px-3 py-2 font-medium">
                        {header || `Column ${index + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.sample.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {preview.headers.map((_, index) => (
                        <td key={index} className="max-w-48 truncate px-3 py-1.5 text-text-primary">
                          {row[index] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {FIELDS.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`map-${key}`} className="text-xs">
                    {label}
                  </Label>
                  <NativeSelect
                    id={`map-${key}`}
                    value={mapping[key] ?? ""}
                    onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                  >
                    <option value="">{key === "phone" ? "Choose a column" : "Don't import"}</option>
                    {preview.headers.map((header, index) => (
                      <option key={index} value={String(index)}>
                        {header || `Column ${index + 1}`}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ))}
              <div className="space-y-1">
                <Label htmlFor="import-country" className="text-xs">
                  Country code for numbers without one
                </Label>
                <Input
                  id="import-country"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  placeholder="e.g. 91 (optional)"
                  inputMode="numeric"
                />
              </div>
            </div>

            <p className="text-xs text-text-secondary">
              Existing contacts are matched by phone number and only have blanks filled in — nothing
              you&apos;ve typed in ChatWise is overwritten. A &ldquo;no&rdquo; in the consent column
              opts someone out; a &ldquo;yes&rdquo; opts in only people who haven&apos;t been asked.
            </p>

            <div className="flex gap-2">
              <Button type="button" onClick={start} disabled={busy || !mapping.phone}>
                {busy && <LoaderCircle className="animate-spin" />}
                Import {preview.rowCount.toLocaleString("en-IN")} rows
              </Button>
              <Button type="button" variant="ghost" onClick={() => setPreview(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {imports.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {imports.map((row) => (
            <li key={row.id} className="space-y-2 px-5 py-4 text-small">
              <div className="flex flex-wrap items-center gap-3">
                <Pill tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Pill>
                <span className="text-text-primary">
                  {row.status === "PROCESSING"
                    ? "Reading the sheet…"
                    : `${row.createdCount} added, ${row.updatedCount} already known${row.errorCount ? `, ${row.errorCount} problems` : ""}`}
                </span>
                <span className="ml-auto text-text-secondary">{row.when}</span>
                {row.status === "COMPLETED" && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => undo(row)}>
                    <RotateCcw /> Undo
                  </Button>
                )}
              </div>
              {row.errors.length > 0 && (
                <details className="text-text-secondary">
                  <summary className="cursor-pointer text-primary">
                    {row.errorCount} {row.errorCount === 1 ? "row wasn't" : "rows weren't"} imported
                  </summary>
                  <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                    {row.errors.map((problem, index) => (
                      <li key={index}>
                        {problem.row > 0 ? `Row ${problem.row}: ` : ""}
                        {problem.reason}
                      </li>
                    ))}
                  </ul>
                  {row.errorCount > row.errors.length && <p>…and {row.errorCount - row.errors.length} more.</p>}
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

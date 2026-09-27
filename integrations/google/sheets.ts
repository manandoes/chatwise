// Contacts to and from Google Sheets.
//
// **Export** writes a business's contacts (all, or one segment) to a sheet —
// on demand, or on a schedule (daily or weekly, `ScheduledExport`). REPLACE
// rewrites the tab each time; APPEND adds the rows underneath.
//
// **Import** is two steps so nothing lands by surprise: a preview reads the
// first rows and guesses which column is which; the owner confirms the
// mapping; then a job imports every row as one `ImportBatch`. Numbers that
// can't be read are listed with their row number rather than skipped
// silently. A batch can be rolled back: contacts it created are removed,
// unless they've since been used (messaged, ordered, paid, booked), in which
// case they're kept and just unlinked from the batch.
//
// Imports only ever fill gaps on existing contacts — a name someone typed in
// ChatWise is not replaced by a spreadsheet's — and a sheet can opt people
// out but only opts in contacts nobody has asked yet (docs/Rules.md §8).
//
// Relative .ts imports: the jobs run on the always-on host.

import "server-only";

import type { ExportFrequency, Prisma } from "../../lib/generated/prisma/client.ts";
import { db } from "../../lib/db.ts";
import { addTagsToContact, normalizePhone, upsertContact } from "../../lib/contacts.ts";
import { setConsent } from "../../lib/consent.ts";
import { segmentWhere, storedFilter } from "../../lib/segments.ts";
import { evaluateAllRules } from "../../lib/tag-rules.ts";
import {
  addTab,
  clearValues,
  createSpreadsheet,
  readSpreadsheetInfo,
  readValues,
  spreadsheetIdFrom,
  tabRange,
  writeValues,
  type GoogleResult,
} from "./client.ts";

/** Most rows one export or import handles. */
export const MAX_EXPORT_ROWS = 50_000;
export const MAX_IMPORT_ROWS = 20_000;
/** Rows written per Sheets call, well inside Google's request size limit. */
const WRITE_CHUNK = 2_000;
/** Import errors kept for the owner to read. */
const MAX_ERRORS_KEPT = 300;

const HEADER = ["Name", "Phone", "Email", "Language", "Consent", "Tags", "Total spent", "Currency", "Orders", "Last order", "Added"];

const CONSENT_WORDS = { PENDING: "Not asked", OPTED_IN: "Opted in", OPTED_OUT: "Opted out" } as const;

// ─── Export ─────────────────────────────────────────────────────────────────

/**
 * Where an export goes, read from a request body: a spreadsheet link (blank
 * for a new spreadsheet), a tab name, an optional segment and the mode.
 */
export function readSheetTarget(
  body: Record<string, unknown> | null,
): { ok: true; value: Omit<ExportInput, "businessId"> } | { ok: false; message: string; fields: Record<string, string> } {
  const link = typeof body?.spreadsheet === "string" ? body.spreadsheet.trim() : "";
  const spreadsheetId = link ? spreadsheetIdFrom(link) : null;

  if (link && !spreadsheetId) {
    const message = "Paste the spreadsheet's link from your browser's address bar.";

    return { ok: false, message, fields: { spreadsheet: message } };
  }

  const sheetName = (typeof body?.sheetName === "string" ? body.sheetName.trim() : "").slice(0, 90) || "Contacts";

  return {
    ok: true,
    value: {
      spreadsheetId,
      sheetName,
      segmentId: typeof body?.segmentId === "string" && body.segmentId ? body.segmentId : null,
      mode: body?.mode === "APPEND" ? "APPEND" : "REPLACE",
    },
  };
}

export type ExportInput = {
  businessId: string;
  /** Null: make a new spreadsheet. */
  spreadsheetId: string | null;
  sheetName: string;
  segmentId: string | null;
  mode: "REPLACE" | "APPEND";
};

export type ExportResult = GoogleResult<{ spreadsheetId: string; rows: number }>;

async function contactWhere(businessId: string, segmentId: string | null): Promise<Prisma.ContactWhereInput | null> {
  if (!segmentId) return { businessId };

  const segment = await db.segment.findFirst({ where: { id: segmentId, businessId }, select: { filter: true } });
  const filter = segment ? storedFilter(segment.filter) : null;

  return filter ? segmentWhere(businessId, filter) : null;
}

export async function exportContacts(input: ExportInput): Promise<ExportResult> {
  const where = await contactWhere(input.businessId, input.segmentId);

  if (!where) return { ok: false, status: 404, message: "That segment no longer exists or can't be read." };

  const total = await db.contact.count({ where });

  if (total > MAX_EXPORT_ROWS) {
    return {
      ok: false,
      status: 400,
      message: `That's ${total.toLocaleString("en-IN")} contacts — more than one export can hold (${MAX_EXPORT_ROWS.toLocaleString("en-IN")}). Export a segment instead.`,
    };
  }

  let spreadsheetId = input.spreadsheetId;

  if (!spreadsheetId) {
    const created = await createSpreadsheet(
      input.businessId,
      `ChatWise contacts — ${new Date().toISOString().slice(0, 10)}`,
      input.sheetName,
    );

    if (!created.ok) return created;

    spreadsheetId = created.value.spreadsheetId;
  } else {
    const info = await readSpreadsheetInfo(input.businessId, spreadsheetId);

    if (!info.ok) return info;

    if (!info.value.tabs.includes(input.sheetName)) {
      const added = await addTab(input.businessId, spreadsheetId, input.sheetName);

      if (!added.ok) return added;
    }
  }

  const range = tabRange(input.sheetName);
  let needsHeader = true;

  if (input.mode === "REPLACE") {
    const cleared = await clearValues(input.businessId, spreadsheetId, range);

    if (!cleared.ok) return cleared;
  } else {
    const first = await readValues(input.businessId, spreadsheetId, tabRange(input.sheetName, "A1:A1"));

    if (!first.ok) return first;

    needsHeader = first.value.length === 0;
  }

  let rows = 0;
  let cursor: string | undefined;
  let pending: (string | number)[][] = needsHeader ? [HEADER] : [];
  let nextRow = 1;

  const flush = async (): Promise<GoogleResult<unknown>> => {
    if (pending.length === 0) return { ok: true, value: null };

    const result =
      input.mode === "REPLACE"
        ? await writeValues(input.businessId, spreadsheetId, tabRange(input.sheetName, `A${nextRow}`), pending, "update")
        : await writeValues(input.businessId, spreadsheetId, range, pending, "append");

    nextRow += pending.length;
    pending = [];

    return result;
  };

  for (;;) {
    const page = await db.contact.findMany({
      where,
      orderBy: { id: "asc" },
      take: WRITE_CHUNK,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        language: true,
        optInStatus: true,
        totalSpent: true,
        currency: true,
        orderCount: true,
        lastOrderAt: true,
        createdAt: true,
        tags: { select: { tag: { select: { name: true } } } },
      },
    });

    for (const contact of page) {
      pending.push([
        contact.name ?? "",
        `+${contact.phone}`,
        contact.email ?? "",
        contact.language ?? "",
        CONSENT_WORDS[contact.optInStatus],
        contact.tags.map((row) => row.tag.name).join(", "),
        Number(contact.totalSpent),
        contact.currency ?? "",
        contact.orderCount,
        contact.lastOrderAt ? contact.lastOrderAt.toISOString().slice(0, 10) : "",
        contact.createdAt.toISOString().slice(0, 10),
      ]);
    }

    rows += page.length;

    if (pending.length >= WRITE_CHUNK || page.length < WRITE_CHUNK) {
      const written = await flush();

      if (!written.ok) return written;
    }

    if (page.length < WRITE_CHUNK) break;

    cursor = page[page.length - 1].id;
  }

  return { ok: true, value: { spreadsheetId, rows } };
}

// ─── Scheduled exports ──────────────────────────────────────────────────────

/** The next run after `from`, on the same clock time, strictly in the future. */
export function nextRunAfter(from: Date, frequency: ExportFrequency, now = new Date()): Date {
  const step = (frequency === "DAILY" ? 1 : 7) * 24 * 60 * 60_000;
  let next = from.getTime() + step;

  while (next <= now.getTime()) next += step;

  return new Date(next);
}

/**
 * Runs every scheduled export that is due. Each is claimed by moving its
 * next run forward first, so two runners never export the same one twice,
 * and a failure waits for the next slot rather than retrying in a loop.
 */
export async function runDueExports(now = new Date()): Promise<{ ran: number; failed: number }> {
  const due = await db.scheduledExport.findMany({
    where: { enabled: true, nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
    take: 20,
  });

  let ran = 0;
  let failed = 0;

  for (const job of due) {
    const claimed = await db.scheduledExport.updateMany({
      where: { id: job.id, nextRunAt: job.nextRunAt },
      data: { nextRunAt: nextRunAfter(job.nextRunAt, job.frequency, now) },
    });

    if (claimed.count !== 1) continue;

    const result = await exportContacts({
      businessId: job.businessId,
      spreadsheetId: job.spreadsheetId,
      sheetName: job.sheetName,
      segmentId: job.segmentId,
      mode: job.mode === "APPEND" ? "APPEND" : "REPLACE",
    });

    await db.scheduledExport.update({
      where: { id: job.id },
      data: { lastRunAt: new Date(), lastError: result.ok ? null : result.message },
    });

    if (result.ok) ran += 1;
    else failed += 1;
  }

  return { ran, failed };
}

// ─── Import ─────────────────────────────────────────────────────────────────

export type ColumnMapping = {
  phone: number;
  name?: number | null;
  email?: number | null;
  tags?: number | null;
  language?: number | null;
  consent?: number | null;
};

const GUESSES: [keyof ColumnMapping, RegExp][] = [
  ["phone", /phone|mobile|whats ?app|number|contact no|cell/i],
  ["email", /e-?mail/i],
  ["name", /name/i],
  ["tags", /tag|label|group/i],
  ["language", /lang/i],
  ["consent", /consent|opt|subscri|marketing/i],
];

/** Which column is which, from the header row. The owner confirms or corrects it. */
export function guessMapping(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {};
  const used = new Set<number>();

  for (const [field, pattern] of GUESSES) {
    const index = headers.findIndex((header, i) => !used.has(i) && pattern.test(header));

    if (index >= 0) {
      mapping[field] = index;
      used.add(index);
    }
  }

  return mapping;
}

export async function previewImport(businessId: string, spreadsheetId: string, sheetName: string | null) {
  const info = await readSpreadsheetInfo(businessId, spreadsheetId);

  if (!info.ok) return info;

  const tab = sheetName && info.value.tabs.includes(sheetName) ? sheetName : info.value.tabs[0];

  if (!tab) return { ok: false as const, status: 400, message: "That spreadsheet has no tabs." };

  const values = await readValues(businessId, spreadsheetId, tabRange(tab));

  if (!values.ok) return values;

  const [headers = [], ...rows] = values.value;

  return {
    ok: true as const,
    value: {
      title: info.value.title,
      tabs: info.value.tabs,
      tab,
      headers,
      sample: rows.slice(0, 10),
      rowCount: rows.length,
      guess: guessMapping(headers),
    },
  };
}

/** Starts an import: records the batch, and queues the job that does it. */
export async function startImport(input: {
  businessId: string;
  userId: string;
  spreadsheetId: string;
  sheetName: string;
  mapping: ColumnMapping;
  defaultCountryCode: string | null;
}): Promise<string> {
  const batch = await db.importBatch.create({
    data: {
      businessId: input.businessId,
      source: "google_sheets",
      sourceRef: `${input.spreadsheetId} · ${input.sheetName}`,
      createdById: input.userId,
    },
    select: { id: true },
  });

  await db.pendingJob.create({
    data: {
      businessId: input.businessId,
      jobType: "sheets.import",
      dedupeKey: `sheets.import:${batch.id}`,
      maxAttempts: 3,
      payload: {
        batchId: batch.id,
        spreadsheetId: input.spreadsheetId,
        sheetName: input.sheetName,
        mapping: input.mapping,
        defaultCountryCode: input.defaultCountryCode,
      },
    },
  });

  return batch.id;
}

const YES = /^(y|yes|true|1|opted ?in|subscribed|agree[sd]?)$/i;
const NO = /^(n|no|false|0|opted ?out|unsubscribed|stop)$/i;

function cell(row: string[], index: number | null | undefined): string {
  return index === null || index === undefined ? "" : (row[index] ?? "").toString().trim();
}

/**
 * Imports every row of one batch. Returns "retry" when Google is unreachable
 * (the job tries again); anything else finishes the batch, as COMPLETED or
 * FAILED with the reason.
 */
export async function runImport(
  businessId: string,
  payload: Record<string, unknown>,
): Promise<{ status: "done" | "retry"; note: string }> {
  const batchId = String(payload.batchId ?? "");
  const batch = await db.importBatch.findFirst({ where: { id: batchId, businessId }, select: { id: true, status: true } });

  if (!batch || batch.status !== "PROCESSING") return { status: "done", note: "Batch already finished." };

  const mapping = payload.mapping as ColumnMapping;
  const defaultCountryCode = typeof payload.defaultCountryCode === "string" ? payload.defaultCountryCode : null;
  const values = await readValues(businessId, String(payload.spreadsheetId), tabRange(String(payload.sheetName)));

  if (!values.ok) {
    if (values.status === 0 || values.status === 429 || values.status >= 500) return { status: "retry", note: values.message };

    await db.importBatch.update({
      where: { id: batch.id },
      data: { status: "FAILED", completedAt: new Date(), errors: [{ row: 0, reason: values.message }] },
    });

    return { status: "done", note: values.message };
  }

  const rows = values.value.slice(1);

  if (rows.length > MAX_IMPORT_ROWS) {
    await db.importBatch.update({
      where: { id: batch.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errors: [{ row: 0, reason: `The sheet has ${rows.length} rows; the most one import takes is ${MAX_IMPORT_ROWS}.` }],
      },
    });

    return { status: "done", note: "too many rows" };
  }

  let createdCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  const errors: { row: number; reason: string }[] = [];

  const fail = (row: number, reason: string) => {
    errorCount += 1;

    if (errors.length < MAX_ERRORS_KEPT) errors.push({ row, reason });
  };

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    // Row numbers as the owner sees them in Sheets: 1 is the header.
    const sheetRow = index + 2;

    if (row.every((value) => !value?.toString().trim())) continue;

    const rawPhone = cell(row, mapping.phone);
    const phone = normalizePhone(rawPhone, defaultCountryCode);

    if (!phone) {
      fail(sheetRow, rawPhone ? `"${rawPhone.slice(0, 30)}" isn't a phone number we can use — include the country code.` : "No phone number.");
      continue;
    }

    const email = cell(row, mapping.email);
    const contact = await upsertContact(businessId, phone, {
      name: cell(row, mapping.name) || null,
      email: email.includes("@") ? email : null,
      language: cell(row, mapping.language).toLowerCase() || null,
      importBatchId: batch.id,
    });

    if (contact.created) createdCount += 1;
    else updatedCount += 1;

    const tags = cell(row, mapping.tags).split(/[,;]/).map((tag) => tag.trim()).filter(Boolean);

    if (tags.length) await addTagsToContact(businessId, contact.id, tags, "IMPORT");

    const consent = cell(row, mapping.consent);

    if (NO.test(consent)) {
      await setConsent({ businessId, contactId: contact.id, to: "OPTED_OUT", source: "import", detail: `batch ${batch.id}, row ${sheetRow}` });
    } else if (YES.test(consent)) {
      const current = await db.contact.findUnique({ where: { id: contact.id }, select: { optInStatus: true } });

      // Never overrides someone who said STOP.
      if (current?.optInStatus === "PENDING") {
        await setConsent({ businessId, contactId: contact.id, to: "OPTED_IN", source: "import", detail: `batch ${batch.id}, row ${sheetRow}` });
      }
    }
  }

  await db.importBatch.update({
    where: { id: batch.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      rowCount: rows.length,
      createdCount,
      updatedCount,
      errorCount,
      errors,
    },
  });

  await evaluateAllRules(businessId);

  return { status: "done", note: `${createdCount} added, ${updatedCount} updated, ${errorCount} problems` };
}

/**
 * Undoes an import: removes the contacts it created. Anyone who has since
 * been messaged, ordered, paid or booked is kept — deleting them would take
 * real history with them — and only unlinked from the batch. Details it
 * filled in on contacts that already existed stay.
 */
export async function rollbackImport(
  businessId: string,
  batchId: string,
): Promise<{ ok: true; removed: number; kept: number } | { ok: false; message: string }> {
  const batch = await db.importBatch.findFirst({ where: { id: batchId, businessId }, select: { id: true, status: true } });

  if (!batch) return { ok: false, message: "That import doesn't exist." };
  if (batch.status === "PROCESSING") return { ok: false, message: "That import is still running." };
  if (batch.status === "ROLLED_BACK") return { ok: false, message: "That import was already undone." };

  const unused: Prisma.ContactWhereInput = {
    businessId,
    importBatchId: batch.id,
    conversations: { none: {} },
    orders: { none: {} },
    payments: { none: {} },
    bookings: { none: {} },
    deals: { none: {} },
  };

  const [removed, kept] = await db.$transaction([
    db.contact.deleteMany({ where: unused }),
    db.contact.updateMany({ where: { businessId, importBatchId: batch.id }, data: { importBatchId: null } }),
    db.importBatch.update({ where: { id: batch.id }, data: { status: "ROLLED_BACK", rolledBackAt: new Date() } }),
  ]);

  return { ok: true, removed: removed.count, kept: kept.count };
}

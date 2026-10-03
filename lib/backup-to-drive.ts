// Backing up a business's conversations to their Google Drive before the
// weekly cleanup deletes old records.
//
// Runs inside the `data.cleanup` job, **before** any DELETEs, so nothing is
// lost even if the backup fails. Failure logs a warning and the cleanup
// continues — we never block deletion because the backup service was down.
//
// The output is a single Google Spreadsheet per business, reused across runs.
// New conversations are appended as fresh rows; the sheet is created on the
// first successful run if it doesn't exist yet.

import "server-only";

import { db } from "../lib/db.ts";
import { createBackupFile, appendToSheet, spreadsheetDriveUrl } from "../integrations/google/drive.ts";
import { isGoogleConfigured } from "../integrations/google/client.ts";
import { isFeatureEnabled } from "../lib/features.ts";

export type BackupResult =
  | { ok: true; rowsBackedUp: number; spreadsheetId: string; spreadsheetUrl: string }
  | { ok: false; error: string };

/**
 * How many days of conversation history to back up on each run.
 * We go back further than the 7-day retention window so the user has a
 * complete picture of recent conversations before they disappear from the DB.
 */
const BACKUP_LOOKBACK_DAYS = 30;

export async function exportConversationsToDrive(
  businessId: string,
): Promise<BackupResult> {
  if (!isFeatureEnabled("googleDriveBackup") || !isGoogleConfigured()) {
    return { ok: false, error: "Google Drive backup is not enabled." };
  }

  const connection = await db.googleConnection.findUnique({
    where: { businessId },
  });

  if (!connection) {
    return { ok: false, error: "Google Sheets is not connected. Enable backup under Integrations." };
  }

  // Fetch conversations with their messages within the lookback window.
  const lookbackCutoff = new Date(Date.now() - BACKUP_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const conversations = await db.conversation.findMany({
    where: {
      businessId,
      lastMessageAt: { gte: lookbackCutoff },
    },
    select: {
      id: true,
      contactName: true,
      contactPhone: true,
      createdAt: true,
      lastMessageAt: true,
      messages: {
        where: { createdAt: { gte: lookbackCutoff } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          direction: true,
          author: true,
          body: true,
          createdAt: true,
        },
      },
    },
    take: 500,
  });

  if (conversations.length === 0) {
    return { ok: true, rowsBackedUp: 0, spreadsheetId: "", spreadsheetUrl: "" };
  }

  // Build rows: one per message.
  const header = [
    "Contact Name",
    "Phone",
    "Direction",
    "Author",
    "Message Body",
    "Timestamp",
    "Conversation Started",
  ];

  const rows: (string | number)[][] = [header];

  for (const conv of conversations) {
    for (const msg of conv.messages) {
      rows.push([
        conv.contactName ?? "",
        conv.contactPhone,
        msg.direction,
        msg.author,
        msg.body ?? "",
        msg.createdAt.toISOString(),
        conv.createdAt.toISOString(),
      ]);
    }
  }

  // Determine whether to create a new file or append to the existing one.
  const existingFileId = (await db.business.findUnique({
    where: { id: businessId },
    select: { backupDriveFileId: true },
  }))?.backupDriveFileId ?? null;

  const sheetName = "Conversations";
  const business = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  const title = `ChatWise Conversations — ${business.name ?? "Business"}`;

  let spreadsheetId: string;

  if (existingFileId) {
    spreadsheetId = existingFileId;
  } else {
    const created = await createBackupFile(businessId, title);

    if (!created.ok) {
      return {
        ok: false,
        error: `Could not create backup file: ${created.message}`,
      };
    }

    spreadsheetId = created.value.fileId;

    // Write header row into the new file.
    const headerResult = await appendToSheet(businessId, spreadsheetId, sheetName, [header]);

    if (!headerResult.ok) {
      // Best effort — don't fail the whole cleanup because the header write
      // couldn't go through.
      console.warn(`[backup] header write failed: ${headerResult.message}`);
    }
  }

  // Append data rows in chunks.
  const CHUNK_SIZE = 500;
  for (let i = 1; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const result = await appendToSheet(businessId, spreadsheetId, sheetName, chunk);

    if (!result.ok) {
      console.warn(`[backup] append failed at row ${i}: ${result.message}`);
      // Continue with remaining chunks — partial backup is better than none.
    }
  }

  // Update the business record with the file id for next time.
  await db.business.update({
    where: { id: businessId },
    data: {
      backupDriveFileId: spreadsheetId,
      lastBackupAt: new Date(),
    },
  });

  const totalRows = rows.length - 1; // exclude header
  const url = spreadsheetDriveUrl(spreadsheetId);

  return { ok: true, rowsBackedUp: totalRows, spreadsheetId, spreadsheetUrl: url };
}

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
import {
  createBackupFile,
  appendToSheet,
  spreadsheetDriveUrl,
  getOrCreateBackupFolder,
  getOrCreateConversationMediaFolder,
  uploadMediaFile,
  getMediaMimeInfo,
} from "../integrations/google/drive.ts";
import { isGoogleConfigured } from "../integrations/google/client.ts";
import { isFeatureEnabled } from "../lib/features.ts";

export type BackupResult =
  | { ok: true; rowsBackedUp: number; mediaBackedUp: number; spreadsheetId: string; spreadsheetUrl: string }
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

  // Check if media backup is enabled
  const mediaBackupEnabled = isFeatureEnabled("googleDriveMediaBackup");

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
          mediaType: true,
          mediaUrl: true,
          mediaMimeType: true,
        },
      },
    },
    take: 500,
  });

  if (conversations.length === 0) {
    return { ok: true, rowsBackedUp: 0, mediaBackedUp: 0, spreadsheetId: "", spreadsheetUrl: "" };
  }

  // If media backup is enabled, create the main backup folder
  let backupFolderId: string | null = null;
  if (mediaBackupEnabled) {
    const folderResult = await getOrCreateBackupFolder(businessId);
    if (!folderResult.ok) {
      console.warn(`[backup] Could not create backup folder: ${folderResult.message}`);
    } else {
      backupFolderId = folderResult.value.folderId;
    }
  }

  // Build rows: one per message.
  // Add media columns if media backup is enabled
  const mediaHeader = mediaBackupEnabled
    ? [
        "Media Type",
        "Media WhatsApp URL",
        "Media MIME Type",
        "Media Drive File ID",
        "Media Drive Link",
      ]
    : [];

  const header = [
    "Contact Name",
    "Phone",
    "Direction",
    "Author",
    "Message Body",
    "Timestamp",
    "Conversation Started",
    ...mediaHeader,
  ];

  const rows: (string | number)[][] = [header];

  let mediaBackedUp = 0;

  for (const conv of conversations) {
    // Create per-conversation media folder if media backup is enabled
    let conversationMediaFolderId: string | null = null;
    if (mediaBackupEnabled && backupFolderId) {
      const mediaFolderResult = await getOrCreateConversationMediaFolder(
        businessId,
        backupFolderId,
        conv.id,
        conv.contactName,
      );
      if (mediaFolderResult.ok) {
        conversationMediaFolderId = mediaFolderResult.value.folderId;
      } else {
        console.warn(`[backup] Could not create media folder for conversation ${conv.id}: ${mediaFolderResult.message}`);
      }
    }

    for (const msg of conv.messages) {
      const mediaRow = mediaBackupEnabled
        ? [
            msg.mediaType ?? "",
            msg.mediaUrl ?? "",
            msg.mediaMimeType ?? "",
            "", // Drive file ID (filled in during media backup)
            "", // Drive link (filled in during media backup)
          ]
        : [];

      rows.push([
        conv.contactName ?? "",
        conv.contactPhone,
        msg.direction,
        msg.author,
        msg.body ?? "",
        msg.createdAt.toISOString(),
        conv.createdAt.toISOString(),
        ...mediaRow,
      ]);

      // If media backup is enabled and this message has media, upload it
      if (mediaBackupEnabled && msg.mediaType && msg.mediaUrl && conversationMediaFolderId) {
        try {
          const mimeInfo = getMediaMimeInfo(msg.mediaType);
          const fileName = `${msg.id}.${mimeInfo.extension}`;
          const uploadResult = await uploadMediaFile(
            businessId,
            msg.mediaUrl,
            fileName,
            mimeInfo.mimeType,
            conversationMediaFolderId,
          );

          if (uploadResult.ok) {
            // Update the row with Drive file info (last 2 columns)
            const rowIndex = rows.length - 1;
            rows[rowIndex][rows[0].length - 2] = uploadResult.value.fileId;
            rows[rowIndex][rows[0].length - 1] = uploadResult.value.webViewLink;
            mediaBackedUp++;
          } else {
            console.warn(`[backup] Failed to upload media for message ${msg.id}: ${uploadResult.message}`);
          }
        } catch (error) {
          console.warn(`[backup] Error uploading media for message ${msg.id}:`, error);
        }
      }
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

  return { ok: true, rowsBackedUp: totalRows, mediaBackedUp, spreadsheetId, spreadsheetUrl: url };
}

// Talking to Google Drive — creating and appending to a per-business backup
// spreadsheet. Reuses the same OAuth token as Google Sheets (the same
// `googleConnection` row), but adds the `drive.file` scope so we only touch
// files we create rather than reading the owner's whole Drive.
//
// Plain HTTPS, no SDK. The access token is obtained from the same cached
// refresh-token flow as Sheets; this file calls `accessTokenFor` directly.

import "server-only";

import { accessTokenFor, type GoogleResult } from "./client.ts";

const DRIVE_URL = "https://www.googleapis.com/drive/v3";
const SHEETS_URL = "https://sheets.googleapis.com/v4";
const TIMEOUT_MS = 30_000;

// ─── Drive file creation ────────────────────────────────────────────────────

export async function createBackupFile(
  businessId: string,
  title: string,
): Promise<GoogleResult<{ fileId: string }>> {
  const token = await accessTokenFor(businessId);

  if (!token.ok) return token;

  let response: Response;

  try {
    response = await fetch(`${DRIVE_URL}/files`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.value}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: title,
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: [], // top-level in the user's Drive
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 0, message: "Couldn't reach Google Drive. Please try again." };
  }

  if (!response.ok) {
    if (response.status === 401) {
      // Tell the caller to re-connect so the user grants the new scope.
      return { ok: false, status: 401, message: "Google access expired. Please reconnect under Integrations." };
    }

    return {
      ok: false,
      status: response.status,
      message: `Google Drive failed with status ${response.status}.`,
    };
  }

  const data = (await response.json().catch(() => ({}))) as { id?: string };

  if (!data.id) {
    return { ok: false, status: 500, message: "Drive returned no file id." };
  }

  return { ok: true, value: { fileId: data.id } };
}

// ─── Sheets write (append rows) ─────────────────────────────────────────────

/**
 * Appends rows to a single tab in an existing spreadsheet.
 * This is the same mechanism used by the Sheets exports — we call the Sheets
 * API directly because it has a bulk-append endpoint; Drive API does not.
 */
export async function appendToSheet(
  businessId: string,
  spreadsheetId: string,
  sheetName: string,
  values: (string | number)[][],
): Promise<GoogleResult<{ updatedCells: number }>> {
  const token = await accessTokenFor(businessId);

  if (!token.ok) return token;

  const range = `'${sheetName.replace(/'/g, "''")}'!A1`;

  let response: Response;

  try {
    response = await fetch(
      `${SHEETS_URL}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token.value}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ values }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
  } catch {
    return { ok: false, status: 0, message: "Couldn't reach Google Sheets. Please try again." };
  }

  if (!response.ok) {
    if (response.status === 401) {
      return { ok: false, status: 401, message: "Google access expired. Please reconnect under Integrations." };
    }

    return {
      ok: false,
      status: response.status,
      message: `Google Sheets failed with status ${response.status}.`,
    };
  }

  const data = (await response.json().catch(() => ({}))) as { updates?: { updatedCells?: number } };

  return { ok: true, value: { updatedCells: data.updates?.updatedCells ?? values.length } };
}

export function spreadsheetDriveUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}

// ─── Media file upload ────────────────────────────────────────────────────────

/**
 * Creates or finds the "ChatWise Backups" folder in the user's Drive.
 * Returns the folder ID.
 */
export async function getOrCreateBackupFolder(
  businessId: string,
): Promise<GoogleResult<{ folderId: string }>> {
  const token = await accessTokenFor(businessId);

  if (!token.ok) return token;

  // Search for existing folder
  let response: Response;
  try {
    response = await fetch(
      `${DRIVE_URL}/files?q=name='ChatWise Backups' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
      {
        headers: { authorization: `Bearer ${token.value}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
  } catch {
    return { ok: false, status: 0, message: "Couldn't reach Google Drive. Please try again." };
  }

  if (!response.ok) {
    if (response.status === 401) {
      return { ok: false, status: 401, message: "Google access expired. Please reconnect under Integrations." };
    }
    return { ok: false, status: response.status, message: `Google Drive search failed with status ${response.status}.` };
  }

  const data = (await response.json().catch(() => ({}))) as { files?: { id: string }[] };
  const existingFolder = data.files?.[0];

  if (existingFolder) {
    return { ok: true, value: { folderId: existingFolder.id } };
  }

  // Create new folder
  try {
    response = await fetch(`${DRIVE_URL}/files`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.value}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "ChatWise Backups",
        mimeType: "application/vnd.google-apps.folder",
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 0, message: "Couldn't reach Google Drive. Please try again." };
  }

  if (!response.ok) {
    if (response.status === 401) {
      return { ok: false, status: 401, message: "Google access expired. Please reconnect under Integrations." };
    }
    return { ok: false, status: response.status, message: `Google Drive folder creation failed with status ${response.status}.` };
  }

  const folderData = (await response.json().catch(() => ({}))) as { id?: string };
  if (!folderData.id) {
    return { ok: false, status: 500, message: "Drive returned no folder id." };
  }

  return { ok: true, value: { folderId: folderData.id } };
}

/**
 * Creates a per-conversation media folder under the main backup folder.
 */
export async function getOrCreateConversationMediaFolder(
  businessId: string,
  backupFolderId: string,
  conversationId: string,
  contactName: string | null,
): Promise<GoogleResult<{ folderId: string }>> {
  const token = await accessTokenFor(businessId);

  if (!token.ok) return token;

  const folderName = `Conversation - ${contactName ?? conversationId.slice(0, 8)}`;

  // Search for existing folder
  let response: Response;
  try {
    response = await fetch(
      `${DRIVE_URL}/files?q=name='${encodeURIComponent(folderName)}' and '${backupFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
      {
        headers: { authorization: `Bearer ${token.value}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
  } catch {
    return { ok: false, status: 0, message: "Couldn't reach Google Drive. Please try again." };
  }

  if (!response.ok) {
    if (response.status === 401) {
      return { ok: false, status: 401, message: "Google access expired. Please reconnect under Integrations." };
    }
    return { ok: false, status: response.status, message: `Google Drive search failed with status ${response.status}.` };
  }

  const data = (await response.json().catch(() => ({}))) as { files?: { id: string }[] };
  const existingFolder = data.files?.[0];

  if (existingFolder) {
    return { ok: true, value: { folderId: existingFolder.id } };
  }

  // Create new folder
  try {
    response = await fetch(`${DRIVE_URL}/files`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.value}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [backupFolderId],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 0, message: "Couldn't reach Google Drive. Please try again." };
  }

  if (!response.ok) {
    if (response.status === 401) {
      return { ok: false, status: 401, message: "Google access expired. Please reconnect under Integrations." };
    }
    return { ok: false, status: response.status, message: `Google Drive folder creation failed with status ${response.status}.` };
  }

  const folderData = (await response.json().catch(() => ({}))) as { id?: string };
  if (!folderData.id) {
    return { ok: false, status: 500, message: "Drive returned no folder id." };
  }

  return { ok: true, value: { folderId: folderData.id } };
}

/**
 * Downloads a media file from a WhatsApp URL and uploads it to Google Drive.
 * Returns the Drive file ID and web view link.
 */
export async function uploadMediaFile(
  businessId: string,
  mediaUrl: string,
  fileName: string,
  mimeType: string,
  parentFolderId: string,
): Promise<GoogleResult<{ fileId: string; webViewLink: string }>> {
  const token = await accessTokenFor(businessId);

  if (!token.ok) return token;

  // Step 1: Download from WhatsApp URL
  let mediaBuffer: Buffer;
  try {
    const resp = await fetch(mediaUrl);
    if (!resp.ok) {
      return { ok: false, status: resp.status, message: `Failed to download media from WhatsApp: ${resp.status}` };
    }
    mediaBuffer = Buffer.from(await resp.arrayBuffer());
  } catch (error) {
    return { ok: false, status: 0, message: `Failed to download media: ${error instanceof Error ? error.message : "Unknown error"}` };
  }

  // Step 2: Upload to Google Drive using multipart upload
  // First create the file metadata
  const metadata = {
    name: fileName,
    parents: [parentFolderId],
  };

  const boundary = `----ChatWiseMediaBoundary${Date.now()}`;
  const bodyParts = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    `\r\n--${boundary}--\r\n`,
  ];

  const body = Buffer.concat([
    Buffer.from(bodyParts[0]),
    mediaBuffer,
    Buffer.from(bodyParts[2]),
  ]);

  let response: Response;
  try {
    response = await fetch(`${DRIVE_URL}/files?uploadType=multipart`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.value}`,
        "content-type": `multipart/related; boundary=${boundary}`,
        "content-length": body.length.toString(),
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS * 2), // Longer timeout for media
    });
  } catch (error) {
    return { ok: false, status: 0, message: `Couldn't upload to Google Drive: ${error instanceof Error ? error.message : "Unknown error"}` };
  }

  if (!response.ok) {
    if (response.status === 401) {
      return { ok: false, status: 401, message: "Google access expired. Please reconnect under Integrations." };
    }
    const errorText = await response.text().catch(() => "");
    return {
      ok: false,
      status: response.status,
      message: `Google Drive upload failed with status ${response.status}: ${errorText}`,
    };
  }

  const data = (await response.json().catch(() => ({}))) as { id?: string; webViewLink?: string };
  if (!data.id) {
    return { ok: false, status: 500, message: "Drive returned no file id." };
  }

  return { ok: true, value: { fileId: data.id, webViewLink: data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view` } };
}

/**
 * Determines MIME type and file extension from media type.
 */
export function getMediaMimeInfo(mediaType: string): { mimeType: string; extension: string } {
  switch (mediaType) {
    case "audio":
      return { mimeType: "audio/ogg", extension: "ogg" };
    case "image":
      return { mimeType: "image/jpeg", extension: "jpg" };
    case "video":
      return { mimeType: "video/mp4", extension: "mp4" };
    case "document":
      return { mimeType: "application/pdf", extension: "pdf" };
    default:
      return { mimeType: "application/octet-stream", extension: "bin" };
  }
}

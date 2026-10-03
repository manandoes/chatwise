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

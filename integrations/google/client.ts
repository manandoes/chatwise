// Talking to Google: connecting an account for Sheets, and the Sheets API.
//
// This is a separate connection from "Sign in with Google" (lib/auth.ts).
// Signing in only asks who you are; this asks for spreadsheet access, and it
// belongs to the business rather than to whichever team member logs in. It
// reuses the same Google OAuth client (GOOGLE_CLIENT_ID/SECRET) with its own
// redirect address, so there's one Google project to set up — and a Google
// Calendar integration later can ask for its scope the same way.
//
// Only the refresh token is stored, encrypted. Access tokens live an hour and
// are kept in memory only. Nothing here is logged beyond a status code.
//
// Plain HTTPS, no SDK. Relative .ts imports: scheduled exports run on the
// always-on host.

import "server-only";

import { db } from "../../lib/db.ts";
import { decryptText } from "../../lib/encryption.ts";
import { publicAppUrl } from "../../lib/features.ts";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const SHEETS_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const TIMEOUT_MS = 20_000;

/**
 * Read and write spreadsheets, plus who the account is. Google Calendar
 * would add its own scope here later.
 */
export const GOOGLE_SHEETS_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/spreadsheets"];

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(): string {
  return `${publicAppUrl()}/api/google/callback`;
}

export function googleAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SHEETS_SCOPES.join(" "),
    // A refresh token, so scheduled exports keep working after the hour.
    access_type: "offline",
    // Google only hands out a refresh token on consent; ask every time so a
    // reconnect always gets one.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });

  return `${AUTH_URL}?${params.toString()}`;
}

export type GoogleResult<T> = { ok: true; value: T } | { ok: false; message: string; status: number };

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string };

async function tokenRequest(body: Record<string, string>): Promise<GoogleResult<TokenResponse>> {
  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        ...body,
      }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const json = (await response.json().catch(() => null)) as (TokenResponse & { error?: string }) | null;

    if (!response.ok || !json?.access_token) {
      console.error(`[google] token request returned ${response.status} ${json?.error ?? ""}`);

      return {
        ok: false,
        status: response.status,
        message:
          json?.error === "invalid_grant"
            ? "Google no longer accepts this connection. Reconnect Google Sheets under Integrations."
            : "Google didn't answer properly. Please try again.",
      };
    }

    return { ok: true, value: json };
  } catch {
    return { ok: false, status: 0, message: "Couldn't reach Google. Please try again." };
  }
}

/** Trades the code from Google's redirect for tokens, and reads the account's email. */
export async function exchangeGoogleCode(code: string) {
  const result = await tokenRequest({
    code,
    grant_type: "authorization_code",
    redirect_uri: googleRedirectUri(),
  });

  if (!result.ok) return result;

  // The id_token came straight from Google's token endpoint over TLS, so its
  // payload can be read without checking the signature.
  let email: string | null = null;

  try {
    const payload = result.value.id_token?.split(".")[1];

    email = payload ? ((JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string }).email ?? null) : null;
  } catch {
    email = null;
  }

  return {
    ok: true as const,
    value: {
      refreshToken: result.value.refresh_token ?? null,
      scopes: (result.value.scope ?? "").split(" ").filter(Boolean),
      email,
    },
  };
}

/** Best effort: tells Google to forget the grant. */
export async function revokeGoogleToken(token: string): Promise<void> {
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // The stored token is deleted either way.
  }
}

// ─── Access tokens, per business ────────────────────────────────────────────

const cached = new Map<string, { token: string; expiresAt: number }>();

/** An access token for this business's Google connection, refreshed as needed. */
export async function accessTokenFor(businessId: string): Promise<GoogleResult<string>> {
  const hit = cached.get(businessId);

  if (hit && hit.expiresAt > Date.now() + 60_000) return { ok: true, value: hit.token };

  const connection = await db.googleConnection.findUnique({
    where: { businessId },
    select: { refreshToken: true },
  });

  if (!connection) {
    return { ok: false, status: 404, message: "Google Sheets isn't connected. Connect it under Integrations." };
  }

  const result = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: decryptText(Buffer.from(connection.refreshToken)),
  });

  if (!result.ok) return result;

  const token = result.value.access_token as string;

  cached.set(businessId, { token, expiresAt: Date.now() + (result.value.expires_in ?? 3600) * 1000 });

  return { ok: true, value: token };
}

export function forgetAccessToken(businessId: string) {
  cached.delete(businessId);
}

// ─── Sheets ─────────────────────────────────────────────────────────────────

/** The spreadsheet id in a Google Sheets link, or the id itself. */
export function spreadsheetIdFrom(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);

  if (fromUrl) return fromUrl[1];

  return /^[a-zA-Z0-9_-]{20,}$/.test(trimmed) ? trimmed : null;
}

export function spreadsheetUrl(spreadsheetId: string) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

/** A range naming a whole tab, quoted as Sheets requires: 'My tab'!A1:Z. */
export function tabRange(sheetName: string, cells = "") {
  return `'${sheetName.replace(/'/g, "''")}'${cells ? `!${cells}` : ""}`;
}

async function sheetsCall<T>(
  businessId: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<GoogleResult<T>> {
  const token = await accessTokenFor(businessId);

  if (!token.ok) return token;

  let response: Response;

  try {
    response = await fetch(`${SHEETS_URL}${path}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${token.value}`,
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 0, message: "Couldn't reach Google Sheets. Please try again." };
  }

  if (!response.ok) {
    console.error(`[google] sheets ${init.method ?? "GET"} returned ${response.status}`);

    if (response.status === 401) forgetAccessToken(businessId);

    const message =
      response.status === 404
        ? "That spreadsheet doesn't exist, or the connected Google account can't open it."
        : response.status === 403
          ? "The connected Google account doesn't have access to that spreadsheet. Share it with them, or reconnect."
          : response.status === 429
            ? "Google Sheets is busy. We'll try again shortly."
            : "Google Sheets couldn't do that right now.";

    return { ok: false, status: response.status, message };
  }

  return { ok: true, value: (await response.json().catch(() => ({}))) as T };
}

export async function createSpreadsheet(businessId: string, title: string, sheetName: string) {
  return sheetsCall<{ spreadsheetId: string }>(businessId, "", {
    method: "POST",
    body: { properties: { title }, sheets: [{ properties: { title: sheetName } }] },
  });
}

/** The spreadsheet's title and its tabs' names. */
export async function readSpreadsheetInfo(businessId: string, spreadsheetId: string) {
  const result = await sheetsCall<{ properties?: { title?: string }; sheets?: { properties?: { title?: string } }[] }>(
    businessId,
    `/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties.title`,
  );

  if (!result.ok) return result;

  return {
    ok: true as const,
    value: {
      title: result.value.properties?.title ?? "Spreadsheet",
      tabs: (result.value.sheets ?? []).map((sheet) => sheet.properties?.title ?? "").filter(Boolean),
    },
  };
}

export async function addTab(businessId: string, spreadsheetId: string, sheetName: string) {
  return sheetsCall(businessId, `/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: "POST",
    body: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
  });
}

export async function readValues(businessId: string, spreadsheetId: string, range: string) {
  const result = await sheetsCall<{ values?: string[][] }>(
    businessId,
    `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
  );

  if (!result.ok) return result;

  return { ok: true as const, value: result.value.values ?? [] };
}

export async function clearValues(businessId: string, spreadsheetId: string, range: string) {
  return sheetsCall(businessId, `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:clear`, {
    method: "POST",
    body: {},
  });
}

/**
 * Writes rows. RAW, never USER_ENTERED: a customer name of "=HYPERLINK(…)"
 * stays text instead of becoming a live formula in the owner's sheet.
 */
export async function writeValues(
  businessId: string,
  spreadsheetId: string,
  range: string,
  values: (string | number)[][],
  mode: "update" | "append",
) {
  const path =
    mode === "update"
      ? `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`
      : `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

  return sheetsCall(businessId, path, { method: mode === "update" ? "PUT" : "POST", body: { values } });
}

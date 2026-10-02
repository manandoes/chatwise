// Talking to Calendly: checking a personal access token, registering the
// webhook that tells us when somebody books or cancels, and checking that a
// webhook really came from Calendly.
//
// Calendly needs very little from ChatWise. The booking page link is all it
// takes to *send* someone a link; the token is needed only to hear back when
// they book, which is what confirmations and reminders run on. Calendly only
// offers webhooks on its paid plans, so a free Calendly account can still be
// connected — it just gets links without confirmations or reminders.
//
// The token is stored encrypted and used only here. The webhook signing key
// is one we choose and give Calendly, so we never need to ask for it.
//
// Plain HTTPS, no SDK. Relative .ts imports: the job runner uses this.

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://api.calendly.com";
const TIMEOUT_MS = 15_000;
/** How old a signed webhook may be before it's treated as a replay. */
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export const CALENDLY_EVENTS = ["invitee.created", "invitee.canceled"];

export type CalendlyResult<T> = { ok: true; value: T } | { ok: false; message: string; status: number };

/**
 * A general-purpose call helper exported so agents and background jobs can
 * reach Calendly without duplicating the auth logic (Gap 4 — Appointment bot).
 */
export async function callCalendly<T>(
  token: string,
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<CalendlyResult<T>> {
  let response: Response;

  try {
    response = await fetch(url.startsWith("https://") ? url : `${BASE}${url}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 0, message: "Calendly didn't answer. Please try again." };
  }

  if (response.status === 401) {
    return { ok: false, status: 401, message: "Calendly didn't accept that token. Create a new personal access token and paste it again." };
  }

  const body = (await response.json().catch(() => null)) as (T & { message?: string; title?: string }) | null;

  if (!response.ok) {
    console.error(`[calendly] ${init.method ?? "GET"} ${url.replace(/[?#].*/, "").split("/").slice(0, 4).join("/")} returned ${response.status}`);

    if (response.status === 403) {
      return {
        ok: false,
        status: 403,
        message: "Calendly only sends booking updates on its paid plans. Your link still works; confirmations and reminders need a paid Calendly plan.",
      };
    }

    return { ok: false, status: response.status, message: body?.message ?? "Calendly couldn't do that right now." };
  }

  return { ok: true, value: (body ?? {}) as T };
}

async function call<T>(token: string, url: string, init: { method?: string; body?: unknown } = {}): Promise<CalendlyResult<T>> {
  let response: Response;

  try {
    response = await fetch(url.startsWith("https://") ? url : `${BASE}${url}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 0, message: "Calendly didn't answer. Please try again." };
  }

  if (response.status === 401) {
    return { ok: false, status: 401, message: "Calendly didn't accept that token. Create a new personal access token and paste it again." };
  }

  const body = (await response.json().catch(() => null)) as (T & { message?: string; title?: string }) | null;

  if (!response.ok) {
    console.error(`[calendly] ${init.method ?? "GET"} ${url.replace(/[?#].*/, "").split("/").slice(0, 4).join("/")} returned ${response.status}`);

    if (response.status === 403) {
      return {
        ok: false,
        status: 403,
        message: "Calendly only sends booking updates on its paid plans. Your link still works; confirmations and reminders need a paid Calendly plan.",
      };
    }

    return { ok: false, status: response.status, message: body?.message ?? "Calendly couldn't do that right now." };
  }

  return { ok: true, value: (body ?? {}) as T };
}

/** Who the token belongs to: their user and organisation, and their booking page. */
export async function readCalendlyUser(token: string) {
  const result = await call<{ resource?: { uri?: string; current_organization?: string; scheduling_url?: string } }>(token, "/users/me");

  if (!result.ok) return result;

  const resource = result.value.resource;

  if (!resource?.uri || !resource.current_organization) {
    return { ok: false as const, status: 500, message: "Calendly answered in a way we didn't expect." };
  }

  return {
    ok: true as const,
    value: { userUri: resource.uri, organizationUri: resource.current_organization, schedulingUrl: resource.scheduling_url ?? null },
  };
}

/** Asks Calendly to tell us about bookings and cancellations for this user. */
export async function createCalendlyWebhook(
  token: string,
  input: { url: string; userUri: string; organizationUri: string; signingKey: string },
) {
  const result = await call<{ resource?: { uri?: string } }>(token, "/webhook_subscriptions", {
    method: "POST",
    body: {
      url: input.url,
      events: CALENDLY_EVENTS,
      organization: input.organizationUri,
      user: input.userUri,
      scope: "user",
      signing_key: input.signingKey,
    },
  });

  if (!result.ok) return result;

  const uri = result.value.resource?.uri;

  return uri ? { ok: true as const, value: uri } : { ok: false as const, status: 500, message: "Calendly didn't confirm the webhook." };
}

/** Best effort: stops Calendly sending to an old webhook address. */
export async function deleteCalendlyWebhook(token: string, webhookUri: string): Promise<void> {
  if (!webhookUri.startsWith(`${BASE}/webhook_subscriptions/`)) return;

  await call(token, webhookUri, { method: "DELETE" });
}

/**
 * Checks Calendly-Webhook-Signature: "t=<time>,v1=<hmac>", where the HMAC
 * covers "<time>.<raw body>" with our signing key. Old timestamps are refused
 * so a captured request can't be replayed later.
 */
export function verifyCalendlyWebhook(rawBody: string, header: string | null, signingKey: string, now = Date.now()): boolean {
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const index = part.indexOf("=");

      return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
    }),
  );
  const timestamp = Number(parts.t);

  if (!Number.isFinite(timestamp) || !parts.v1) return false;
  if (Math.abs(now / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = Buffer.from(createHmac("sha256", signingKey).update(`${timestamp}.${rawBody}`).digest("hex"));
  const given = Buffer.from(parts.v1);

  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** A booking page link is on calendly.com (or a subdomain of it), over HTTPS. */
export function normalizeBookingUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);

    if (url.protocol !== "https:") return null;
    if (url.hostname !== "calendly.com" && !url.hostname.endsWith(".calendly.com")) return null;
    if (url.pathname === "/" || url.pathname === "") return null;

    url.hash = "";

    return url.toString();
  } catch {
    return null;
  }
}

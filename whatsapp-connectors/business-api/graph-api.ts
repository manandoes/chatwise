// Talking to Meta's Graph API.
//
// Unlike the QR tier, this needs no browser and no worker process — it is
// ordinary HTTPS calls, so it runs happily inside the web app.
//
// Everything here is server-side. An access token must never reach the browser
// (docs/Rules.md §3).

import "server-only";

/**
 * Which version of Meta's API to call.
 *
 * Meta dates its API versions and retires old ones on its own schedule, so this
 * is configurable rather than baked in — when a version is retired, this is the
 * one thing that needs changing.
 */
export const GRAPH_API_VERSION =
  process.env.META_GRAPH_API_VERSION ?? "v21.0";

const GRAPH_BASE = "https://graph.facebook.com";

/** How long to wait on Meta before giving up. */
const REQUEST_TIMEOUT_MS = 15_000;

export type GraphResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

/**
 * Calls the Graph API and turns whatever comes back into something the rest of
 * the app can act on.
 *
 * Meta's error bodies are detailed and developer-facing. The `message` returned
 * here is passed to the customer, so it is deliberately short and free of
 * anything sensitive — the full response goes to the server log instead
 * (docs/Rules.md §4).
 */
export async function graphRequest<T>(
  path: string,
  {
    accessToken,
    method = "GET",
    body,
  }: { accessToken: string; method?: "GET" | "POST"; body?: unknown },
): Promise<GraphResult<T>> {
  const url = `${GRAPH_BASE}/${GRAPH_API_VERSION}/${path}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as
      | (T & { error?: { message?: string; code?: number; type?: string } })
      | null;

    if (!response.ok) {
      // Log the detail for developers; hand the customer something readable.
      console.error("[business-api] Meta rejected a request", {
        path,
        status: response.status,
        code: payload?.error?.code,
        type: payload?.error?.type,
      });

      return {
        ok: false,
        status: response.status,
        message: friendlyError(response.status, payload?.error?.code),
      };
    }

    return { ok: true, data: payload as T };
  } catch (error) {
    console.error("[business-api] could not reach Meta", error);

    return {
      ok: false,
      status: 503,
      message:
        "We couldn't reach WhatsApp just now. This is usually temporary — try again shortly.",
    };
  }
}

/**
 * Plain-English versions of the failures a customer can actually do something
 * about.
 *
 * Deliberately cautious: it says what we observed and what to check, not what
 * Meta's rules are. Stating their policy as fact is exactly what
 * docs/Rules.md §8 warns against.
 */
function friendlyError(status: number, code?: number): string {
  if (status === 401 || code === 190) {
    return "That access token was rejected. It may have expired or been revoked — generate a new one and paste it in again.";
  }

  if (status === 403) {
    return "Those credentials don't have permission to send from that number. Check the number is added to your app and the token has WhatsApp messaging permissions.";
  }

  if (status === 404) {
    return "That phone number ID wasn't found. Check you copied it from the WhatsApp section of your Meta app.";
  }

  if (status === 429) {
    return "WhatsApp is rate-limiting this number right now. Wait a little and try again.";
  }

  if (status >= 500) {
    return "WhatsApp is having trouble at their end. Try again shortly.";
  }

  return "WhatsApp rejected that request. Double-check your credentials and try again.";
}

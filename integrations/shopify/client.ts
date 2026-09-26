// Talking to Shopify: OAuth, signatures, and the Admin REST API.
//
// Nothing else in ChatWise calls Shopify directly — the same one-file rule as
// lib/razorpay.ts, and no SDK for the same reason: this is ordinary HTTPS.
//
// Three things here matter for safety:
//
//   * Every request that claims to come from Shopify is checked against our
//     app secret before anything is read from it (`verifyOAuthQuery` for the
//     install redirect, `verifyWebhook` for webhooks).
//   * A store's access token is only ever handled decrypted inside this file
//     and never logged. Errors log a status code and the shop's domain.
//   * Shopify's REST API allows about two requests a second per store. Calls
//     are spaced to stay under that, and a 429 is waited out, not hammered.
//
// Relative .ts imports: the job runner on the always-on host uses this.

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { decryptText } from "../../lib/encryption.ts";

/** Which Admin API version to call. Shopify retires versions quarterly. */
export function shopifyApiVersion(): string {
  return process.env.SHOPIFY_API_VERSION || "2026-07";
}

/**
 * The scopes ChatWise asks a store for — read-only, because nothing here
 * changes anything in the store. Checkout webhooks come under read_orders.
 */
export const SHOPIFY_SCOPES = ["read_orders", "read_customers", "read_products"];

export function isShopifyConfigured(): boolean {
  return Boolean(process.env.SHOPIFY_API_KEY && process.env.SHOPIFY_API_SECRET);
}

function apiSecret(): string {
  const secret = process.env.SHOPIFY_API_SECRET;

  if (!secret) throw new Error("SHOPIFY_API_SECRET is not set.");

  return secret;
}

/**
 * A store's permanent domain, or null if this isn't one.
 *
 * Only `*.myshopify.com` is accepted. The domain ends up in URLs we call with
 * a secret attached, so anything else — a custom domain, a lookalike, a
 * domain with a path smuggled in — is refused outright.
 */
export function normalizeShopDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let value = raw.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  if (!value.includes(".")) value = `${value}.myshopify.com`;

  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value) ? value : null;
}

export function authorizeUrl(shop: string, state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY ?? "",
    scope: SHOPIFY_SCOPES.join(","),
    redirect_uri: redirectUri,
    state,
  });

  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Checks the `hmac` Shopify puts on the redirect back from the install
 * screen: every other query parameter, sorted, signed with our app secret.
 */
export function verifyOAuthQuery(query: URLSearchParams): boolean {
  const hmac = query.get("hmac");

  if (!hmac) return false;

  const entries = [...query.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const message = new URLSearchParams(entries).toString();
  const expected = createHmac("sha256", apiSecret()).update(message).digest("hex");

  return safeEqual(expected, hmac);
}

/** Checks X-Shopify-Hmac-Sha256 against the raw request body. */
export function verifyWebhook(rawBody: string, hmacHeader: string | null): boolean {
  if (!hmacHeader || !isShopifyConfigured()) return false;

  const expected = createHmac("sha256", apiSecret()).update(rawBody, "utf8").digest("base64");

  return safeEqual(expected, hmacHeader);
}

/** Trades the one-time code from the install redirect for a permanent token. */
export async function exchangeCodeForToken(
  shop: string,
  code: string,
): Promise<{ ok: true; accessToken: string; scope: string } | { ok: false }> {
  try {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: apiSecret(),
        code,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      console.error(`[shopify] token exchange for ${shop} returned ${response.status}`);
      return { ok: false };
    }

    const body = (await response.json()) as { access_token?: string; scope?: string };

    if (!body.access_token) return { ok: false };

    return { ok: true, accessToken: body.access_token, scope: body.scope ?? "" };
  } catch (error) {
    console.error(`[shopify] token exchange for ${shop} failed:`, error instanceof Error ? error.name : "error");
    return { ok: false };
  }
}

// ─── The Admin REST API, paced ──────────────────────────────────────────────

/** Two requests a second per store is Shopify's REST allowance. */
const MIN_GAP_MS = 550;
const lastCallAt = new Map<string, number>();

async function paceFor(shop: string) {
  const since = Date.now() - (lastCallAt.get(shop) ?? 0);

  if (since < MIN_GAP_MS) await sleep(MIN_GAP_MS - since);

  lastCallAt.set(shop, Date.now());
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A plain field rather than a `readonly status` constructor parameter: the
// always-on host runs this file with Node's type stripping, which can't
// compile TypeScript-only syntax like parameter properties.
export class ShopifyApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type ShopCredentials = { shopDomain: string; accessToken: Uint8Array | Buffer };

export type ShopifyResponse<T> = { body: T; nextPageInfo: string | null };

/**
 * One Admin API call. Retries a 429 (after Shopify's Retry-After) and a 5xx
 * a few times; anything else is thrown as a ShopifyApiError with the status.
 */
export async function shopifyRequest<T>(
  shop: ShopCredentials,
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<ShopifyResponse<T>> {
  const token = decryptText(Buffer.from(shop.accessToken));
  const query = options.query ? `?${new URLSearchParams(options.query).toString()}` : "";
  const url = `https://${shop.shopDomain}/admin/api/${shopifyApiVersion()}/${path}${query}`;

  for (let attempt = 1; ; attempt += 1) {
    await paceFor(shop.shopDomain);

    let response: Response;

    try {
      response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          "X-Shopify-Access-Token": token,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      if (attempt < 3) {
        await sleep(1_000 * attempt);
        continue;
      }

      throw new ShopifyApiError("Shopify didn't answer.", 0);
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt < 4) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 2_000 * attempt);
        continue;
      }
    }

    if (!response.ok) {
      console.error(`[shopify] ${options.method ?? "GET"} ${path.split("?")[0]} on ${shop.shopDomain} returned ${response.status}`);
      throw new ShopifyApiError(`Shopify returned ${response.status}.`, response.status);
    }

    const body = (response.status === 204 ? {} : await response.json()) as T;

    return { body, nextPageInfo: readNextPageInfo(response.headers.get("link")) };
  }
}

/** Shopify paginates with a Link header carrying `page_info` for rel="next". */
export function readNextPageInfo(link: string | null): string | null {
  if (!link) return null;

  for (const part of link.split(",")) {
    if (!part.includes('rel="next"')) continue;

    const match = part.match(/[?&]page_info=([^&>]+)/);

    if (match) return decodeURIComponent(match[1]);
  }

  return null;
}

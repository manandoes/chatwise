// The short-lived cookie that ties a provider's OAuth redirect back to the
// browser that started it — Shopify, Google, and any later one.
//
// Before sending someone to the provider we put a random value in an
// httpOnly cookie and the same value in the `state` the provider echoes back.
// The callback accepts only a redirect whose state matches the cookie (and,
// optionally, whose extra value — the Shopify store, the business — matches
// what this browser asked for). That stops anyone tricking a signed-in owner
// into connecting an account the attacker controls (login CSRF).
//
// Used only by web-app routes, never by the always-on host.

import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

const MAX_AGE_SECONDS = 10 * 60;

export type OAuthFlow = { cookie: string; path: string };

export const SHOPIFY_OAUTH: OAuthFlow = { cookie: "chatwise_shopify_oauth", path: "/api/shopify" };
export const GOOGLE_OAUTH: OAuthFlow = { cookie: "chatwise_google_oauth", path: "/api/google" };

/** Starts a connection attempt, returning the state to send the provider. */
export async function beginOAuth(flow: OAuthFlow, boundTo: string): Promise<string> {
  const state = randomBytes(24).toString("base64url");
  const store = await cookies();

  store.set(flow.cookie, `${state}.${boundTo}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax, not Strict: the callback is a top-level redirect from the
    // provider, and a Strict cookie would not be sent with it.
    sameSite: "lax",
    path: flow.path,
    maxAge: MAX_AGE_SECONDS,
  });

  return state;
}

/** True when `state` and `boundTo` match what this browser started. Always clears the cookie. */
export async function finishOAuth(flow: OAuthFlow, state: string | null, boundTo: string): Promise<boolean> {
  const store = await cookies();
  const saved = store.get(flow.cookie)?.value ?? "";

  store.delete({ name: flow.cookie, path: flow.path });

  const dot = saved.indexOf(".");

  if (!state || dot < 0) return false;

  const savedState = Buffer.from(saved.slice(0, dot));
  const given = Buffer.from(state);

  return savedState.length === given.length && timingSafeEqual(savedState, given) && saved.slice(dot + 1) === boundTo;
}

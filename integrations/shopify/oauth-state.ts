// The short-lived cookie that ties Shopify's redirect back to the person who
// started it.
//
// Before sending the owner to Shopify we put a random value in an httpOnly
// cookie and the same value in the `state` Shopify echoes back. The callback
// accepts only a redirect whose state matches the cookie and whose store is
// the one this browser asked for — so nobody can trick a signed-in owner's
// browser into connecting a store the attacker controls (login CSRF).
//
// Only the web app uses this, so "@/" imports are fine.

import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

const COOKIE = "chatwise_shopify_oauth";
const MAX_AGE_SECONDS = 10 * 60;

/** Starts a connection attempt for `shop`, returning the state to send. */
export async function beginShopifyOAuth(shop: string): Promise<string> {
  const state = randomBytes(24).toString("base64url");
  const store = await cookies();

  store.set(COOKIE, `${state}.${shop}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax, not Strict: the callback is a top-level redirect from Shopify, and
    // a Strict cookie would not be sent with it.
    sameSite: "lax",
    path: "/api/shopify",
    maxAge: MAX_AGE_SECONDS,
  });

  return state;
}

/** True when `state` and `shop` match what this browser started. Always clears the cookie. */
export async function finishShopifyOAuth(state: string | null, shop: string): Promise<boolean> {
  const store = await cookies();
  const saved = store.get(COOKIE)?.value ?? "";

  store.delete({ name: COOKIE, path: "/api/shopify" });

  const dot = saved.indexOf(".");

  if (!state || dot < 0) return false;

  const savedState = Buffer.from(saved.slice(0, dot));
  const given = Buffer.from(state);

  return (
    savedState.length === given.length &&
    timingSafeEqual(savedState, given) &&
    saved.slice(dot + 1) === shop
  );
}

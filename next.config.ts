import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Headers sent with every page (Phase 14).
 *
 * These are the browser-side half of security: the routes already check who
 * owns what (docs/Rules.md §3), and these stop a browser being talked into
 * doing something on a signed-in customer's behalf.
 *
 * Each one is here for a specific reason rather than because a checklist said
 * so:
 *
 *   * **frame-ancestors 'none'** — nobody may put the dashboard in an invisible
 *     iframe on their own site and trick a signed-in owner into clicking
 *     "Disconnect" or "Send campaign". `X-Frame-Options` says the same thing
 *     for older browsers.
 *   * **Referrer-Policy** — an address here can contain a conversation or lead
 *     id. Following an outward link (a customer's website, an invoice on
 *     Razorpay) must not hand that id to whoever is on the other end.
 *   * **X-Content-Type-Options** — stops a browser deciding for itself that
 *     something a customer uploaded is a script.
 *   * **Permissions-Policy** — nothing here needs a camera, a microphone or
 *     somebody's location, so nothing embedded in it should be able to ask.
 *
 * The Content-Security-Policy is deliberately narrow but not absolute:
 * `'unsafe-inline'` remains for styles because Tailwind and Next's own
 * streaming both inject them, and `'unsafe-inline'` for scripts is required by
 * Next's hydration payload unless every page is given a nonce. Tightening those
 * two means adding a nonce in `proxy.ts`, which is a real change rather than a
 * header tweak — noted in docs/Memory.md rather than half-done here.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // Razorpay's hosted payment page is a full redirect, not an embed, so it
  // needs nothing here. This is only the app talking to itself.
  "connect-src 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    // Only meaningful over HTTPS, which is everywhere this is deployed.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // Pin the project root so the bundler doesn't walk up into parent folders
  // looking for a lockfile.
  turbopack: {
    root: projectRoot,
  },

  // whatsapp-web.js drives a real Chromium browser and only ever runs on the
  // worker host, never inside the web app. Listing it here keeps the bundler
  // from trying to pull it (and Puppeteer) into a serverless build.
  serverExternalPackages: ["whatsapp-web.js", "puppeteer", "puppeteer-core"],

  // Never send the framework's version to the public.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;

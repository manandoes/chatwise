// Gates every protected route behind an active subscription.
//
// Runs on every incoming request before the page or API handler executes.
// Public routes (marketing pages, auth, billing/webhook) pass through.
// Signed-in users with a live subscription continue normally.
// Everyone else is redirected according to where they were going:
//
//   * Unauthenticated users → /login?next=<original>
//   * Authenticated but unsubscribed → /paywall?next=<original>
//
// The subscription check is done once per request and cached for the duration
// of that request via `readAccountPlan`. The check reads the subscription row
// directly from the database — it does not depend on the session cookie.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { readAccountPlan } from "@/lib/subscription";
import { isPaidPlan } from "@/lib/plans";

// ─── What the middleware sees ────────────────────────────────────────────────

/**
 * Routes the middleware always lets through, regardless of auth or subscription.
 *
 * The billing webhook must be reachable from Razorpay's servers, so it cannot
 * be gated. Auth screens need to stay reachable so people can sign in.
 */
const PUBLIC_PATHS = [
  "/",
  "/pricing",
  "/features",
  "/faq",
  "/login",
  "/signup",
  "/paywall",
  "/api/auth/",
  "/api/billing/webhook",
  "/api/billing/subscription",
  "/api/payments",
  "/api/shopify",
  "/api/google",
  "/join/",
  "/receipts/",
];

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some(
    (prefix) => path === prefix || path.startsWith(prefix),
  );
}

// ─── The check ───────────────────────────────────────────────────────────────

async function getSubscriptionStatus(userId: string | undefined): Promise<
  | { ok: true; paid: boolean }
  | { ok: false; reason: "not-signed-in" | "no-business" | "not-paid" }
> {
  if (!userId) {
    return { ok: false, reason: "not-signed-in" };
  }

  // The subscription lives on the business, not the user. We need the business
  // id to check the plan. If the user has no business yet they are mid-setup
  // and allowed through — setup pages themselves gate on subscription when
  // the business tries to send.
  const { db } = await import("@/lib/db");
  const membership = await db.businessMember.findUnique({
    where: { userId },
    select: { businessId: true },
  });

  if (!membership) {
    // Still setting up — let them through; the dashboard layout will catch
    // them once they try to reach the main dashboard.
    return { ok: true, paid: true };
  }

  const account = await readAccountPlan(membership.businessId);

  if (!isPaidPlan(account.plan)) {
    return { ok: true, paid: false };
  }

  return { ok: true, paid: true };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes always pass through.
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // All other routes require both authentication and an active subscription.
  const session = await auth();
  const userId = session?.user?.id;

  const subscription = await getSubscriptionStatus(userId);

  if (!subscription.ok) {
    // Not signed in — send to login.
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (!subscription.paid) {
    // Signed in but no active plan — send to paywall.
    const url = new URL("/paywall", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// ─── Runtime ─────────────────────────────────────────────────────────────────
// Run middleware on Node.js instead of edge. Edge runtime doesn't support
// `node:util/types` which pg 8.x relies on for date/buffer handling.
// This is safe because middleware only reads the session cookie and DB —
// both work fine on Node.js.
export const config = {
  runtime: 'nodejs',
  matcher: [
    // Skip Next.js internals and all static files
    "/((?!_next|static|favicon.ico|.*\\..*).*)",
  ],
};

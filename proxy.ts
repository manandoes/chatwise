// Who is allowed where.
//
// This runs before a page loads and decides whether the person asking for it is
// allowed to see it:
//
//   • The dashboard and the setup wizard need someone signed in.
//     If they aren't, send them to the login screen — and remember where they
//     were headed so they land there after logging in.
//   • The login and sign-up screens are for people who are signed out.
//     Someone already signed in gets sent on to their dashboard.
//   • Everything else — the public website — is open to everyone.
//
// This is a first gate, not the only one. Pages and API routes still check for
// themselves that the signed-in user owns what they're touching
// (docs/Rules.md §3).
//
// (In Next.js 16 this file used to be called `middleware.ts`.)

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

/** Needs a signed-in user. */
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding"];

/** Only makes sense when signed out. */
const SIGNED_OUT_ONLY_PATHS = ["/login", "/signup"];

export const proxy = auth((request) => {
  const { pathname, search } = request.nextUrl;
  const isSignedIn = Boolean(request.auth?.user);

  const needsSignIn = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (needsSignIn && !isSignedIn) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    // Remember where they were going, so logging in continues the journey
    // rather than dumping them on a generic page.
    loginUrl.searchParams.set("next", `${pathname}${search}`);

    return NextResponse.redirect(loginUrl);
  }

  if (isSignedIn && SIGNED_OUT_ONLY_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/login", "/signup"],
};

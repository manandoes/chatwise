// Health check — confirms the app is running, can reach its database, and
// can sign people in. Used to prove the deployment pipeline works, and by
// uptime monitoring.
//
// Sign-in needs AUTH_SECRET. Without it every login fails with Auth.js's
// "problem with the server configuration" while the rest of the site looks
// fine, so it is checked here too (a deploy on 2026-09-28 had exactly that).
// Only whether it is set is reported — never the value.

import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;

    if (!process.env.AUTH_SECRET?.trim()) {
      console.error("[health] AUTH_SECRET is not set, so nobody can sign in");

      return Response.json(
        {
          status: "degraded",
          database: "connected",
          signIn: "not configured",
          error: {
            message: "Sign-in isn't set up on this server: the AUTH_SECRET environment variable is missing.",
            code: "UNEXPECTED_ERROR",
          },
        },
        { status: 503 },
      );
    }

    return Response.json({ status: "ok", database: "connected", signIn: "configured" });
  } catch (error) {
    // Log the real reason for developers, but never leak connection details
    // (which can contain credentials) in the response (docs/Rules.md §3, §4).
    console.error("[health] database check failed", error);

    return Response.json(
      {
        error: {
          message: "Could not reach the database.",
          code: "DATABASE_UNAVAILABLE",
        },
      },
      { status: 503 },
    );
  }
}

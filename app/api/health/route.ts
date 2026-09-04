// Health check — confirms the app is running and can reach its database.
// Used to prove the deployment pipeline works, and by uptime monitoring later.

import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;

    return Response.json({ status: "ok", database: "connected" });
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

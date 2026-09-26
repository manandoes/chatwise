// Runs due background jobs, for deployments driven by a scheduler.
//
// The always-on WhatsApp host already runs jobs/pending-job-runner.ts on a
// timer. This route is the alternative for anyone who would rather point a
// cron service (Vercel Cron, Cloud Scheduler, …) at the web app: each call
// runs one batch and returns. Both can run at once without doing a job twice.
//
// Public by design, but refuses anybody who does not present CRON_SECRET as a
// bearer token. With no CRON_SECRET set, the route is simply off.

import { timingSafeEqual } from "node:crypto";

import { apiError, unexpectedError } from "@/lib/api-response";
import { runDueJobs } from "@/jobs/pending-job-runner";
import { enqueueRecurringJobs } from "@/jobs/recurring-jobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;

    if (!secret) {
      return apiError("Scheduled jobs aren't set up on this server.", "NOT_FOUND", 404);
    }

    const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const expected = Buffer.from(secret);
    const actual = Buffer.from(given);

    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return apiError("Not allowed.", "NOT_AUTHORIZED", 401);
    }

    await enqueueRecurringJobs();
    const summary = await runDueJobs(50);

    return Response.json(summary);
  } catch (error) {
    return unexpectedError("cron/jobs", error);
  }
}

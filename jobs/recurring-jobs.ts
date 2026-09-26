// Jobs that run on a clock rather than because something happened.
//
// Each is queued into `pending_jobs` with a dedupe key naming its time slot
// ("bookings.reminders at 10:35"), so however many runners call this — the
// always-on host every minute, a cron hitting /api/cron/jobs — each slot
// produces exactly one job.

import "server-only";

import { enqueueJob } from "../lib/jobs.ts";
import { JOB_HANDLERS } from "./job-handlers.ts";

type Recurring = { jobType: string; everyMs: number };

const MINUTE = 60_000;

export const RECURRING_JOBS: Recurring[] = [
  // Reminders go 24h and 1h before a booking; a five-minute sweep keeps them
  // within a few minutes of that.
  { jobType: "bookings.reminders", everyMs: 5 * MINUTE },
  { jobType: "sheets.scheduled_exports", everyMs: 15 * MINUTE },
  { jobType: "tags.evaluate_all_rules", everyMs: 24 * 60 * MINUTE },
  { jobType: "templates.sync_all", everyMs: 6 * 60 * MINUTE },
];

export async function enqueueRecurringJobs(now = Date.now()): Promise<void> {
  for (const job of RECURRING_JOBS) {
    // Only what this build can actually run.
    if (!JOB_HANDLERS[job.jobType]) continue;

    const slot = Math.floor(now / job.everyMs);

    await enqueueJob({
      businessId: null,
      jobType: job.jobType,
      runAt: new Date(slot * job.everyMs),
      dedupeKey: `recurring:${job.jobType}:${slot}`,
      maxAttempts: 2,
    });
  }
}

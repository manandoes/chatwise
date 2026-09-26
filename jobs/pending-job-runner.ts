// The worker that empties the `pending_jobs` queue.
//
// Runs on the always-on host, next to the campaign sender
// (whatsapp-connectors/web-qr/session-manager.ts starts both), and can also be
// driven by a scheduler hitting /api/cron/jobs for deployments without an
// always-on host. Both call `runDueJobs`, and two of them running at once is
// safe: a job is claimed with `FOR UPDATE SKIP LOCKED`, so each row goes to
// exactly one runner.
//
// **Retries.** A job that throws, or asks to be retried, runs again later with
// a growing gap (30s, 2m, 8m, 32m…) until it runs out of attempts, when it is
// marked FAILED and listed on the Integrations screen for the owner to see
// (docs/Rules.md §4).
//
// **Nothing is sent twice.** A job still RUNNING after ten minutes means the
// runner died part-way. Jobs whose handler says it is safe to repeat go back
// to PENDING; jobs that send WhatsApp messages are failed instead, for the same
// reason the campaign sender fails an interrupted send: "possibly sent twice"
// is worse than "definitely not sent".

import "server-only";

import { db } from "../lib/db.ts";
import { JOB_HANDLERS, type JobOutcome } from "./job-handlers.ts";
import { enqueueRecurringJobs } from "./recurring-jobs.ts";

/** How often the always-on host looks for due jobs. */
const TICK_MS = 5_000;
/** How many jobs one tick takes on. */
const BATCH_SIZE = 20;
/** A job RUNNING longer than this is assumed abandoned. */
const STUCK_AFTER_MS = 10 * 60_000;

type ClaimedJob = {
  id: string;
  jobType: string;
  businessId: string | null;
  shopId: string | null;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
};

export type RunSummary = { done: number; retried: number; failed: number };

/** Runs every job that is due now, up to `limit`. */
export async function runDueJobs(limit = BATCH_SIZE): Promise<RunSummary> {
  const summary: RunSummary = { done: 0, retried: 0, failed: 0 };

  await recoverStuckJobs();

  // Raw SQL because Prisma has no way to say SKIP LOCKED, and without it two
  // runners would both pick up the same job.
  const claimed = await db.$queryRaw<ClaimedJob[]>`
    UPDATE "pending_jobs"
    SET "status" = 'RUNNING', "lockedAt" = NOW(), "attempts" = "attempts" + 1, "updatedAt" = NOW()
    WHERE "id" IN (
      SELECT "id" FROM "pending_jobs"
      WHERE "status" = 'PENDING' AND "runAt" <= NOW()
      ORDER BY "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "jobType", "businessId", "shopId", "payload", "attempts", "maxAttempts"
  `;

  for (const job of claimed) {
    const outcome = await runOne(job);

    if (outcome === "done") summary.done += 1;
    else if (outcome === "retried") summary.retried += 1;
    else summary.failed += 1;
  }

  return summary;
}

async function runOne(job: ClaimedJob): Promise<"done" | "retried" | "failed"> {
  const handler = JOB_HANDLERS[job.jobType];

  if (!handler) {
    await finish(job.id, "FAILED", `No handler for job type "${job.jobType}".`);

    return "failed";
  }

  let outcome: JobOutcome;

  try {
    outcome =
      (await handler.run({
        id: job.id,
        businessId: job.businessId,
        shopId: job.shopId,
        payload: (job.payload ?? {}) as Record<string, unknown>,
        attempt: job.attempts,
      })) ?? { status: "done" };
  } catch (error) {
    // The error's message only — never a payload, which can hold a
    // customer's details (docs/Rules.md §4).
    const message = error instanceof Error ? error.message : "Unknown error";

    console.error(`[jobs] ${job.jobType} ${job.id} threw:`, message);
    outcome = { status: "retry", error: message };
  }

  if (outcome.status === "done") {
    // A job that finished without doing anything (a message skipped because
    // the contact opted out) keeps its reason, so the owner can see why.
    await finish(job.id, "DONE", outcome.note ?? null);

    return "done";
  }

  if (outcome.status === "failed" || job.attempts >= job.maxAttempts) {
    await finish(job.id, "FAILED", outcome.error ?? "Gave up after several attempts.");

    return "failed";
  }

  const delay = outcome.delayMs ?? backoffMs(job.attempts);

  await db.pendingJob.update({
    where: { id: job.id },
    data: {
      status: "PENDING",
      lockedAt: null,
      lastError: outcome.error?.slice(0, 500) ?? null,
      runAt: new Date(Date.now() + delay),
    },
  });

  return "retried";
}

/** 30s, 2m, 8m, 32m, ~2h — capped at six hours. */
export function backoffMs(attempt: number): number {
  return Math.min(30_000 * 4 ** Math.max(0, attempt - 1), 6 * 60 * 60_000);
}

async function finish(id: string, status: "DONE" | "FAILED", error: string | null) {
  await db.pendingJob.update({
    where: { id },
    data: {
      status,
      lockedAt: null,
      finishedAt: new Date(),
      ...(error ? { lastError: error.slice(0, 500) } : {}),
    },
  });
}

async function recoverStuckJobs() {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS);

  const stuck = await db.pendingJob.findMany({
    where: { status: "RUNNING", lockedAt: { lt: cutoff } },
    select: { id: true, jobType: true },
    take: 100,
  });

  for (const job of stuck) {
    const repeatable = JOB_HANDLERS[job.jobType]?.safeToRepeat ?? false;

    await db.pendingJob.updateMany({
      where: { id: job.id, status: "RUNNING" },
      data: repeatable
        ? { status: "PENDING", lockedAt: null, lastError: "Interrupted; trying again." }
        : {
            status: "FAILED",
            lockedAt: null,
            finishedAt: new Date(),
            lastError:
              "Interrupted part-way. It may or may not have gone out, so it wasn't tried again.",
          },
    });
  }
}

// ─── The always-on loop ─────────────────────────────────────────────────────

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let lastRecurringAt = 0;
/** How often to queue the clock-driven jobs (they dedupe per time slot). */
const RECURRING_CHECK_MS = 60_000;

/** Starts looking for due jobs. Safe to call twice. */
export function startPendingJobRunner(): void {
  if (running) return;

  running = true;
  schedule();

  console.log("[jobs] runner started");
}

export function stopPendingJobRunner(): void {
  running = false;

  if (timer) clearTimeout(timer);
  timer = null;
}

function schedule() {
  if (!running) return;

  timer = setTimeout(async () => {
    try {
      if (Date.now() - lastRecurringAt >= RECURRING_CHECK_MS) {
        lastRecurringAt = Date.now();
        await enqueueRecurringJobs();
      }

      const summary = await runDueJobs();

      if (summary.done + summary.retried + summary.failed > 0) {
        console.log(
          `[jobs] done ${summary.done}, retrying ${summary.retried}, failed ${summary.failed}`,
        );
      }
    } catch (error) {
      console.error("[jobs] tick failed:", error instanceof Error ? error.message : error);
    } finally {
      schedule();
    }
  }, TICK_MS);
}

// Putting work on the queue, and taking it off again.
//
// The queue is the `pending_jobs` table (prisma/schema.prisma explains why it
// lives in Postgres). Webhooks call `enqueueJob` and return straight away;
// jobs/pending-job-runner.ts on the always-on host does the work later.
//
// Relative .ts imports: loaded by the web app and by the always-on host.

import "server-only";

import type { Prisma } from "./generated/prisma/client.ts";
import { db } from "./db.ts";

export type NewJob = {
  businessId: string | null;
  shopId?: string | null;
  jobType: string;
  payload?: Prisma.InputJsonValue;
  /** When it may run. Defaults to now. */
  runAt?: Date;
  /**
   * A job with the same key is not queued twice. Use it whenever the trigger
   * can be delivered more than once — every webhook can.
   */
  dedupeKey?: string | null;
  maxAttempts?: number;
};

/** Queues a job. Returns false when an identical job (same dedupeKey) exists. */
export async function enqueueJob(job: NewJob): Promise<boolean> {
  // createMany with skipDuplicates rather than create-and-catch: a repeat is
  // an ordinary event (every provider re-sends webhooks) and should not put a
  // database error in the logs each time.
  const created = await db.pendingJob.createMany({
    data: [
      {
        businessId: job.businessId,
        shopId: job.shopId ?? null,
        jobType: job.jobType,
        payload: job.payload ?? {},
        runAt: job.runAt ?? new Date(),
        dedupeKey: job.dedupeKey ?? null,
        maxAttempts: job.maxAttempts ?? 5,
      },
    ],
    skipDuplicates: true,
  });

  return created.count === 1;
}

/** Cancels every job still waiting for a Shopify store (app/uninstalled). */
export async function cancelJobsForShop(shopId: string): Promise<number> {
  const cancelled = await db.pendingJob.updateMany({
    where: { shopId, status: "PENDING" },
    data: { status: "CANCELLED", finishedAt: new Date(), lastError: "The store was disconnected." },
  });

  return cancelled.count;
}

/** Cancels one waiting job by its dedupe key, e.g. a booking reminder. */
export async function cancelJobByKey(dedupeKey: string, reason: string): Promise<boolean> {
  const cancelled = await db.pendingJob.updateMany({
    where: { dedupeKey, status: "PENDING" },
    data: { status: "CANCELLED", finishedAt: new Date(), lastError: reason },
  });

  return cancelled.count > 0;
}

/** The latest jobs that gave up, for the owner to see (docs/Rules.md §4). */
export async function listFailedJobs(businessId: string, take = 20) {
  return db.pendingJob.findMany({
    where: { businessId, status: "FAILED" },
    orderBy: { updatedAt: "desc" },
    take,
    select: { id: true, jobType: true, lastError: true, attempts: true, updatedAt: true },
  });
}

/** Words for a job type, for that list. Unknown types show as themselves. */
export function describeJobType(jobType: string): string {
  return JOB_LABELS[jobType] ?? jobType;
}

const JOB_LABELS: Record<string, string> = {
  "shopify.webhook": "Processing a Shopify update",
  "shopify.backfill": "Importing past Shopify data",
  "shopify.register_webhooks": "Connecting Shopify notifications",
  "automation.send": "Sending an automated WhatsApp message",
  "shopify.abandoned_cart": "Abandoned-cart reminder",
  "shopify.compliance": "Handling a Shopify privacy request",
  "payments.webhook": "Processing a payment update",
  "calendly.webhook": "Processing a Calendly booking",
  "bookings.reminders": "Sending booking reminders",
  "sheets.scheduled_exports": "Scheduled Google Sheets exports",
  "sheets.import": "Importing contacts from Google Sheets",
  "tags.evaluate_rules": "Applying auto-tag rules",
  "tags.evaluate_all_rules": "Daily auto-tag refresh",
  "templates.sync": "Checking template approval with Meta",
  "templates.sync_all": "Checking template approval with Meta",
  "ai.summarize": "Summarising a conversation",
  "catalog.embed": "Indexing products for the assistant",
};

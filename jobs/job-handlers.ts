// Which code runs for which kind of queued job.
//
// A job row names its type ("shopify.webhook", "automation.send", …); this
// file maps each name to the function that does the work, and says whether
// that work may safely be repeated if the runner dies part-way through (see
// jobs/pending-job-runner.ts). Anything that sends a WhatsApp message is not.
//
// Relative .ts imports throughout: this runs on the always-on host.

import "server-only";

import type { AutomationKind } from "../lib/generated/prisma/client.ts";
import { sendAutomatedMessage } from "../lib/automations.ts";

export type JobContext = {
  id: string;
  businessId: string | null;
  shopId: string | null;
  payload: Record<string, unknown>;
  /** 1 on the first run. */
  attempt: number;
};

export type JobOutcome =
  | { status: "done"; note?: string }
  | { status: "retry"; error?: string; delayMs?: number }
  | { status: "failed"; error: string };

export type JobHandler = {
  run(job: JobContext): Promise<JobOutcome | void>;
  /** May this run again if it was interrupted? False for anything that sends. */
  safeToRepeat: boolean;
};

/**
 * Sends one automated message. Payload: { kind, contactId, variables, manual }.
 *
 * A message skipped for a good reason (opted out, switched off, outside the
 * 24-hour window) is a finished job, not a failure — the reason is kept on
 * the row so the owner can see why.
 */
export const automationSendHandler: JobHandler = {
  safeToRepeat: false,
  async run(job) {
    if (!job.businessId) return { status: "failed", error: "No business on this job." };

    const outcome = await sendAutomatedMessage({
      businessId: job.businessId,
      contactId: String(job.payload.contactId ?? ""),
      kind: job.payload.kind as AutomationKind,
      variables: (job.payload.variables ?? {}) as Record<string, string>,
      manual: job.payload.manual === true,
    });

    if (outcome.status === "sent") return { status: "done" };
    if (outcome.status === "retry") return { status: "retry", error: outcome.reason };
    if (outcome.status === "failed") return { status: "failed", error: outcome.reason };

    return { status: "done", note: outcome.reason };
  },
};

export const JOB_HANDLERS: Record<string, JobHandler> = {
  "automation.send": automationSendHandler,
};


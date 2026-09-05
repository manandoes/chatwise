// The numbers behind the Analytics and Overview screens.
//
// Everything here is counted from what actually happened — the Conversation,
// Message and Lead rows the earlier phases have been filling in. Nothing is
// estimated, projected or rounded up, and where a number cannot honestly be
// worked out it is returned as null so the screen can say "not enough yet"
// rather than print a confident zero (docs/Rules.md §4).
//
// Two things are worth knowing before reading a number off one of these
// screens, and both are said on the screen too:
//
//   * **The period governs activity, not the pipeline.** Messages, answer times
//     and leads captured are counted inside the chosen window. The lead
//     pipeline is not: a lead first seen six weeks ago can become a customer
//     today, so counting statuses inside a window would quietly hide the ones
//     that took a while.
//   * **Answer time is a median, not an average.** One reply written the next
//     morning drags a mean into uselessness. The median says what a typical
//     customer waited, which is the question being asked.

import "server-only";

import { db } from "@/lib/db";

/** How far back a screen is looking. */
export const PERIODS = ["7d", "30d", "all"] as const;
export type Period = (typeof PERIODS)[number];

export function isPeriod(value: unknown): value is Period {
  return typeof value === "string" && (PERIODS as readonly string[]).includes(value);
}

export const PERIOD_LABEL: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

const DAY = 24 * 60 * 60 * 1000;

/** How long people waited, and how many waits that is based on. */
export type Waiting = {
  /** Milliseconds. The middle wait, not the average one. */
  median: number;
  /** How many replies this is measured over — the screen shows it, so nobody
   *  reads a confident number that came from two data points. */
  count: number;
};

export type BusinessNumbers = {
  period: Period;
  /** Null for all time. */
  since: Date | null;
  messages: {
    total: number;
    fromCustomers: number;
    sent: number;
  };
  /** Which of the possible authors sent each outbound message (docs/PRD.md §6). */
  repliedBy: {
    agent: number;
    you: number;
    chatwise: number;
    /** Bulk messages (Phase 12). Not replies at all — see the note below. */
    campaigns: number;
  };
  conversations: {
    /** Threads with something said in them during the period. */
    active: number;
    /** Every thread this account has ever had. */
    total: number;
    /** Right now, not during the period — it is a state, not an event. */
    waitingForYou: number;
  };
  answerTime: {
    agent: Waiting | null;
    you: Waiting | null;
  };
  leads: {
    /** First seen during the period. */
    captured: number;
    /** Every lead, whenever it arrived — the pipeline is not a window. */
    total: number;
    byStatus: Record<string, number>;
    customers: number;
    /** Customers ÷ leads. Null until there is a lead to divide by. */
    conversionRate: number | null;
  };
};

/**
 * Works out every number both screens need, for one business.
 *
 * One call rather than a function per tile: the screens want them all at once,
 * and half of them come out of queries that answer two questions each.
 */
export async function readBusinessNumbers(
  businessId: string,
  period: Period = "30d",
): Promise<BusinessNumbers> {
  const since =
    period === "all"
      ? null
      : new Date(Date.now() - (period === "7d" ? 7 : 30) * DAY);

  const inPeriod = {
    conversation: { businessId },
    ...(since ? { createdAt: { gte: since } } : {}),
  };

  const [byAuthor, activeConversations, totalConversations, waitingForYou, leadsCaptured, totalLeads, leadsByStatus, answerTime] =
    await Promise.all([
      db.message.groupBy({
        by: ["direction", "author"],
        where: inPeriod,
        _count: { _all: true },
      }),
      db.conversation.count({
        where: { businessId, ...(since ? { lastMessageAt: { gte: since } } : {}) },
      }),
      db.conversation.count({ where: { businessId } }),
      db.conversation.count({ where: { businessId, escalatedAt: { not: null } } }),
      db.lead.count({
        where: { businessId, ...(since ? { createdAt: { gte: since } } : {}) },
      }),
      db.lead.count({ where: { businessId } }),
      db.lead.groupBy({
        by: ["status"],
        where: { businessId },
        _count: { _all: true },
      }),
      measureAnswerTime(businessId, since),
    ]);

  const count = (direction: string, author?: string) =>
    byAuthor
      .filter(
        (row) =>
          row.direction === direction && (!author || row.author === author),
      )
      .reduce((sum, row) => sum + row._count._all, 0);

  const fromCustomers = count("INBOUND");
  const sent = count("OUTBOUND");

  const byStatus = Object.fromEntries(
    leadsByStatus.map((row) => [row.status, row._count._all]),
  );

  const customers = byStatus.CUSTOMER ?? 0;

  return {
    period,
    since,
    messages: { total: fromCustomers + sent, fromCustomers, sent },
    repliedBy: {
      agent: count("OUTBOUND", "AGENT"),
      you: count("OUTBOUND", "HUMAN"),
      chatwise: count("OUTBOUND", "SYSTEM"),
      campaigns: count("OUTBOUND", "CAMPAIGN"),
    },
    conversations: {
      active: activeConversations,
      total: totalConversations,
      waitingForYou,
    },
    answerTime,
    leads: {
      captured: leadsCaptured,
      total: totalLeads,
      byStatus,
      customers,
      conversionRate: totalLeads > 0 ? customers / totalLeads : null,
    },
  };
}

/**
 * How long a customer waited to be answered, and by whom.
 *
 * Measured as the gap between a customer's message and the next reply in that
 * same thread. Where somebody sends three messages in a row and then gets an
 * answer, the wait is counted from the **first** of them — that is when they
 * started waiting.
 *
 * A reply from ChatWise itself ("I can't answer right now") ends a wait like
 * any other. Something did come back, and pretending otherwise would flatter
 * the agent's numbers on exactly the occasions it failed.
 *
 * A bulk message does **not** end a wait. A broadcast that happens to land
 * while somebody is waiting for an answer is not an answer, and counting it as
 * one would quietly turn "we never replied" into an excellent response time.
 */
async function measureAnswerTime(
  businessId: string,
  since: Date | null,
): Promise<{ agent: Waiting | null; you: Waiting | null }> {
  // Newest first and capped: a busy account should not pull its whole history
  // into memory to draw one tile. Reversed below so the walk runs forwards.
  const rows = await db.message.findMany({
    where: {
      conversation: { businessId },
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 5_000,
    select: {
      conversationId: true,
      direction: true,
      author: true,
      createdAt: true,
    },
  });

  const waitingSince = new Map<string, number>();
  const gaps: { agent: number[]; you: number[] } = { agent: [], you: [] };

  for (const row of rows.reverse()) {
    const at = row.createdAt.getTime();

    if (row.direction === "INBOUND") {
      // Only the first of a run counts — that is when they started waiting.
      if (!waitingSince.has(row.conversationId)) {
        waitingSince.set(row.conversationId, at);
      }

      continue;
    }

    // A campaign message is the business broadcasting, not answering. Skipped
    // entirely rather than `continue`d after taking the wait, so the person is
    // still recorded as waiting for a real reply.
    if (row.author === "CAMPAIGN") continue;

    const started = waitingSince.get(row.conversationId);

    // An outbound message nobody was waiting for is the business writing first.
    // Real, and not an answer time.
    if (started === undefined) continue;

    waitingSince.delete(row.conversationId);

    if (row.author === "HUMAN") gaps.you.push(at - started);
    else gaps.agent.push(at - started);
  }

  return { agent: summarise(gaps.agent), you: summarise(gaps.you) };
}

/** The middle wait, or null when there is nothing to be middle of. */
function summarise(gaps: number[]): Waiting | null {
  if (gaps.length === 0) return null;

  const sorted = [...gaps].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return {
    median:
      sorted.length % 2 === 0
        ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
        : sorted[middle],
    count: gaps.length,
  };
}

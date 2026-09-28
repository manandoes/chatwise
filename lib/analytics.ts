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
import { Prisma } from "@/lib/generated/prisma/client";

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
    /** Order updates, receipts, reminders (2026-09-26). Not replies either. */
    automations: number;
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
      automations: count("OUTBOUND", "AUTOMATION"),
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
    if (row.author === "CAMPAIGN" || row.author === "AUTOMATION") continue;

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

// ─── The campaign funnel ────────────────────────────────────────────────────

/**
 * How long after a campaign message an order or payment still counts as
 * having come from it.
 */
export const CONVERSION_WINDOW_DAYS = 7;

export type FunnelCounts = {
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  /** Paid for an order or payment link within CONVERSION_WINDOW_DAYS of it. */
  converted: number;
};

export type CampaignFunnel = FunnelCounts & {
  /**
   * False when none of these messages went out on the Business API. The QR
   * connection reports no deliveries or reads, so those two steps can't be
   * counted, and the screen says so instead of showing zeros.
   */
  deliveryTracked: boolean;
  /**
   * What delivered and read are out of: messages sent on the Business API
   * only, since those are the only ones WhatsApp reports on.
   */
  deliveryBase: number;
  campaigns: (FunnelCounts & { id: string; name: string; tier: "QR" | "API"; startedAt: string })[];
};

type FunnelRow = {
  campaignId: string;
  sent: bigint;
  delivered: bigint;
  read: bigint;
  replied: bigint;
  converted: bigint;
};

/**
 * Sent → delivered → read → replied → converted, for campaign messages sent
 * in the period, overall and per campaign (the latest ten).
 *
 * Each step counts people, not events, and later steps imply earlier ones —
 * someone who replied was delivered to, even if the receipt never arrived.
 */
export async function readCampaignFunnel(businessId: string, period: Period = "30d"): Promise<CampaignFunnel> {
  const since = period === "all" ? null : new Date(Date.now() - (period === "7d" ? 7 : 30) * DAY);

  // Raw SQL: "paid within seven days of *this* message" compares each
  // recipient's own send time with orders and payments, which Prisma's query
  // builder can't express. Everything is scoped by the business id.
  const rows = await db.$queryRaw<FunnelRow[]>`
    SELECT r."campaignId" AS "campaignId",
      COUNT(*) FILTER (WHERE r."sentAt" IS NOT NULL) AS "sent",
      COUNT(*) FILTER (WHERE r."sentAt" IS NOT NULL AND (r."deliveredAt" IS NOT NULL OR r."status" IN ('DELIVERED', 'READ', 'REPLIED'))) AS "delivered",
      COUNT(*) FILTER (WHERE r."sentAt" IS NOT NULL AND (r."readAt" IS NOT NULL OR r."status" IN ('READ', 'REPLIED'))) AS "read",
      COUNT(*) FILTER (WHERE r."sentAt" IS NOT NULL AND (r."repliedAt" IS NOT NULL OR r."status" = 'REPLIED')) AS "replied",
      COUNT(*) FILTER (WHERE r."sentAt" IS NOT NULL AND c."contactId" IS NOT NULL AND (
        EXISTS (
          SELECT 1 FROM "orders" o
          WHERE o."businessId" = ${businessId} AND o."contactId" = c."contactId"
            AND o."status" IN ('PAID', 'FULFILLED', 'PARTIALLY_REFUNDED')
            AND o."placedAt" >= r."sentAt"
            AND o."placedAt" < r."sentAt" + make_interval(days => ${CONVERSION_WINDOW_DAYS})
        ) OR EXISTS (
          SELECT 1 FROM "payments" p
          WHERE p."businessId" = ${businessId} AND p."contactId" = c."contactId"
            AND p."paidAt" >= r."sentAt"
            AND p."paidAt" < r."sentAt" + make_interval(days => ${CONVERSION_WINDOW_DAYS})
        )
      )) AS "converted"
    FROM "campaign_recipients" r
    JOIN "campaigns" k ON k."id" = r."campaignId"
    JOIN "conversations" c ON c."id" = r."conversationId"
    WHERE k."businessId" = ${businessId}
      ${since ? Prisma.sql`AND r."sentAt" >= ${since}` : Prisma.empty}
    GROUP BY r."campaignId"
  `;

  const campaigns = await db.campaign.findMany({
    where: { businessId, id: { in: rows.map((row) => row.campaignId) } },
    select: { id: true, name: true, tier: true, startedAt: true, scheduledFor: true, createdAt: true },
  });
  const byId = new Map(campaigns.map((campaign) => [campaign.id, campaign]));

  const counted = rows
    .map((row) => {
      const campaign = byId.get(row.campaignId);

      if (!campaign) return null;

      return {
        id: campaign.id,
        name: campaign.name,
        tier: campaign.tier,
        startedAt: (campaign.startedAt ?? campaign.scheduledFor ?? campaign.createdAt).toISOString(),
        sent: Number(row.sent),
        delivered: Number(row.delivered),
        read: Number(row.read),
        replied: Number(row.replied),
        converted: Number(row.converted),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null && row.sent > 0)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const total = (key: keyof FunnelCounts, rowsToCount = counted) => rowsToCount.reduce((sum, row) => sum + row[key], 0);
  const onApi = counted.filter((row) => row.tier === "API");

  return {
    sent: total("sent"),
    delivered: total("delivered", onApi),
    read: total("read", onApi),
    replied: total("replied"),
    converted: total("converted"),
    deliveryTracked: onApi.length > 0,
    deliveryBase: total("sent", onApi),
    campaigns: counted.slice(0, 10),
  };
}

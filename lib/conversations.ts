// The inbox: reading a thread, taking it over, and typing back yourself.
//
// Phase 7 could only show what had already been said. Phase 9 is the half that
// makes it an inbox rather than a transcript — a person can step into a
// conversation the agent is having, answer it themselves, and hand it back
// (docs/PRD.md §6, docs/Phases.md Phase 9).
//
// Everything here takes a `businessId` that came from the signed-in session and
// puts it in the WHERE clause alongside the conversation id, so a thread
// belonging to another account matches nothing and changes nothing. There is no
// separate ownership check anywhere that could be forgotten (docs/Rules.md §3).
//
// One rule underpins the whole file: **the agent and a person never talk at the
// same time.** A thread is either the agent's or a person's, and
// `Conversation.escalatedAt` is the single thing the message router checks
// before it replies. Taking over sets it; letting the agent carry on clears it.

import "server-only";

import { db } from "@/lib/db";
import { connectorFor } from "@/whatsapp-connectors";

/**
 * The longest message this will send.
 *
 * WhatsApp's own limit for a text message. Refusing here means a person gets a
 * plain sentence about it in the box they are typing in, rather than a
 * rejection from Meta after the fact.
 */
export const MAX_MESSAGE_LENGTH = 4096;

/** One row in the inbox list. */
export type InboxRow = {
  id: string;
  contactName: string | null;
  contactPhone: string;
  lastMessageAt: string;
  escalatedAt: string | null;
  escalatedBy: "AGENT" | "HUMAN" | null;
  escalationReason: string | null;
  unreadCount: number;
  /** The last thing said, whoever said it. Null on a brand-new thread. */
  preview: { body: string; fromCustomer: boolean } | null;
};

/** One message as the inbox draws it. */
export type ThreadMessage = {
  id: string;
  body: string;
  fromCustomer: boolean;
  author: "CONTACT" | "AGENT" | "HUMAN" | "SYSTEM" | "CAMPAIGN";
  failureReason: string | null;
  at: string;
};

/** Whether the agent is answering this thread, and why not if it isn't. */
export type ThreadState = {
  escalatedAt: string | null;
  escalatedBy: "AGENT" | "HUMAN" | null;
  escalationReason: string | null;
};

/**
 * Every thread this business has, newest first.
 *
 * Capped at 100. Searching and paging through an older archive is not
 * something an inbox this size needs yet, and a screen that quietly loads
 * thousands of rows is worse than one that says what it shows.
 */
export async function listInbox(businessId: string): Promise<InboxRow[]> {
  const rows = await db.conversation.findMany({
    where: { businessId },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    select: {
      id: true,
      contactName: true,
      contactPhone: true,
      lastMessageAt: true,
      escalatedAt: true,
      escalatedBy: true,
      escalationReason: true,
      unreadCount: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, direction: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    lastMessageAt: row.lastMessageAt.toISOString(),
    escalatedAt: row.escalatedAt?.toISOString() ?? null,
    escalatedBy: row.escalatedBy,
    escalationReason: row.escalationReason,
    unreadCount: row.unreadCount,
    preview: row.messages[0]
      ? {
          body: row.messages[0].body,
          fromCustomer: row.messages[0].direction === "INBOUND",
        }
      : null,
  }));
}

/** One thread and everything said in it, or null if it isn't this account's. */
export async function readThread(businessId: string, id: string) {
  const conversation = await db.conversation.findFirst({
    where: { id, businessId },
    select: {
      id: true,
      contactName: true,
      contactPhone: true,
      escalatedAt: true,
      escalatedBy: true,
      escalationReason: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          direction: true,
          author: true,
          failureReason: true,
          createdAt: true,
        },
      },
    },
  });

  if (!conversation) return null;

  return {
    id: conversation.id,
    contactName: conversation.contactName,
    contactPhone: conversation.contactPhone,
    state: toState(conversation),
    messages: conversation.messages.map(toThreadMessage),
  };
}

/**
 * What has been said in a thread since the browser last looked.
 *
 * The inbox polls this every few seconds. It asks for messages *after* a time
 * it already has rather than the whole thread, so a conversation left open on a
 * screen all afternoon does not get re-sent every five seconds.
 *
 * The cutoff is inclusive on purpose. Two messages written in the same
 * millisecond would let an exclusive one slip past unnoticed until somebody
 * reloaded; including it costs one message per poll, and the screen throws away
 * anything it already has by id.
 */
export async function readThreadSince(
  businessId: string,
  id: string,
  after: Date | null,
): Promise<{ state: ThreadState; messages: ThreadMessage[] } | null> {
  const conversation = await db.conversation.findFirst({
    where: { id, businessId },
    select: {
      escalatedAt: true,
      escalatedBy: true,
      escalationReason: true,
      messages: {
        where: after ? { createdAt: { gte: after } } : undefined,
        orderBy: { createdAt: "asc" },
        take: 200,
        select: {
          id: true,
          body: true,
          direction: true,
          author: true,
          failureReason: true,
          createdAt: true,
        },
      },
    },
  });

  if (!conversation) return null;

  return {
    state: toState(conversation),
    messages: conversation.messages.map(toThreadMessage),
  };
}

/**
 * "I'll take this one."
 *
 * Stops the agent replying in this thread until somebody hands it back. A
 * thread the agent already handed over stays as it was — it is already quiet,
 * and overwriting the reason would throw away the one sentence explaining why
 * it is sitting there.
 */
export async function takeOverThread(
  businessId: string,
  id: string,
): Promise<boolean> {
  const result = await db.conversation.updateMany({
    where: { id, businessId, escalatedAt: null },
    data: {
      escalatedAt: new Date(),
      escalatedBy: "HUMAN",
      escalationReason: "You took this conversation over.",
    },
  });

  if (result.count > 0) return true;

  // Nothing changed either because the thread is already quiet — fine, that is
  // the state being asked for — or because it isn't this account's.
  const exists = await db.conversation.count({ where: { id, businessId } });

  return exists > 0;
}

/** "My agent can carry on." Hands the thread back. */
export async function letTheAgentCarryOn(
  businessId: string,
  id: string,
): Promise<boolean> {
  const result = await db.conversation.updateMany({
    where: { id, businessId },
    data: { escalatedAt: null, escalatedBy: null, escalationReason: null },
  });

  return result.count > 0;
}

/** Clears the "new messages" count, once somebody has actually looked. */
export async function markThreadRead(
  businessId: string,
  id: string,
): Promise<void> {
  await db.conversation.updateMany({
    where: { id, businessId, unreadCount: { gt: 0 } },
    data: { unreadCount: 0 },
  });
}

/** What became of a person's own reply. */
export type HumanReplyResult =
  | { ok: true; message: ThreadMessage; state: ThreadState }
  | { ok: false; message: string; code: "NOT_FOUND" | "NOT_SENT" };

/**
 * Sends a message typed by a person at the business, and records it.
 *
 * Two things are deliberate here:
 *
 * **Typing a reply takes the thread over.** Somebody who has just answered a
 * customer themselves does not want the agent answering the next message over
 * the top of them (docs/Rules.md §5). Pressing Take over first is the same
 * thing said explicitly; this is the same thing meant.
 *
 * **A message that did not go is not written down.** The router does record
 * failed sends, because by then there is nobody to tell. Here the person is
 * sitting in front of the screen: they get the reason, their words stay in the
 * box, and the thread does not fill up with things the customer never saw.
 */
export async function sendHumanReply({
  businessId,
  conversationId,
  body,
}: {
  businessId: string;
  conversationId: string;
  body: string;
}): Promise<HumanReplyResult> {
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, businessId },
    select: { id: true, contactPhone: true },
  });

  if (!conversation) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "That conversation doesn't exist.",
    };
  }

  const connection = await db.whatsAppConnection.findUnique({
    where: { businessId },
    select: { id: true, type: true },
  });

  if (!connection) {
    return {
      ok: false,
      code: "NOT_SENT",
      message:
        "Connect your WhatsApp number before replying from here.",
    };
  }

  const outcome = await connectorFor(connection.type).sendText({
    connectionId: connection.id,
    to: conversation.contactPhone,
    body,
  });

  if (outcome.status === "failed" || outcome.status === "unavailable") {
    return { ok: false, code: "NOT_SENT", message: outcome.message };
  }

  const now = new Date();

  const saved = await db.message.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      author: "HUMAN",
      body,
      // No `externalId`, deliberately, and the router does the same for
      // everything it sends. That column is UNIQUE because it is what stops a
      // webhook Meta re-sends becoming a second copy of an inbound message —
      // so putting an outbound id in it means a message the customer has
      // already received could fail to be written down. Nothing reads outbound
      // ids yet; delivery receipts can add their own column when they arrive.
    },
    select: {
      id: true,
      body: true,
      direction: true,
      author: true,
      failureReason: true,
      createdAt: true,
    },
  });

  // Answering by hand is taking over — but only if the thread was still the
  // agent's. The `escalatedAt: null` guard is what makes that decision atomic:
  // if the agent handed the thread over a moment ago, its reason is the one
  // worth keeping, not this one.
  await db.conversation.updateMany({
    where: { id: conversation.id, escalatedAt: null },
    data: {
      escalatedAt: now,
      escalatedBy: "HUMAN",
      escalationReason: "You replied to this conversation yourself.",
    },
  });

  const updated = await db.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: now },
    select: {
      escalatedAt: true,
      escalatedBy: true,
      escalationReason: true,
    },
  });

  return {
    ok: true,
    message: toThreadMessage(saved),
    state: toState(updated),
  };
}

/** Checks a typed message before anything is sent. */
export function checkMessageBody(
  value: unknown,
): { ok: true; body: string } | { ok: false; message: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, message: "Type a message first." };
  }

  const body = value.trim();

  if (body.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      message: `That's longer than WhatsApp allows in one message (${MAX_MESSAGE_LENGTH} characters).`,
    };
  }

  return { ok: true, body };
}

function toState(row: {
  escalatedAt: Date | null;
  escalatedBy: "AGENT" | "HUMAN" | null;
  escalationReason: string | null;
}): ThreadState {
  return {
    escalatedAt: row.escalatedAt?.toISOString() ?? null,
    escalatedBy: row.escalatedBy,
    escalationReason: row.escalationReason,
  };
}

function toThreadMessage(row: {
  id: string;
  body: string;
  direction: "INBOUND" | "OUTBOUND";
  author: "CONTACT" | "AGENT" | "HUMAN" | "SYSTEM" | "CAMPAIGN";
  failureReason: string | null;
  createdAt: Date;
}): ThreadMessage {
  return {
    id: row.id,
    body: row.body,
    fromCustomer: row.direction === "INBOUND",
    author: row.author,
    failureReason: row.failureReason,
    at: row.createdAt.toISOString(),
  };
}

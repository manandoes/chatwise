// Working the inbox as a team: who is handling which conversation, which ones
// are urgent, notes the team leaves each other, and the notifications that
// tell someone they've been mentioned or handed a thread.
//
// Everything takes the business id from the signed-in session (or, for the
// router, from the conversation row) and puts it in every WHERE clause, so an
// id from another account matches nothing (docs/Rules.md §3). Team notes are
// never sent to the customer — they don't touch WhatsApp at all.
//
// Relative .ts imports: the message router on the always-on host raises
// urgent threads through here.

import "server-only";

import type { ConversationPriority, NotificationKind, Prisma } from "./generated/prisma/client.ts";
import { db } from "./db.ts";

// ─── Views of the inbox ─────────────────────────────────────────────────────

export const INBOX_VIEWS = ["all", "unread", "unassigned", "mine", "urgent"] as const;
export type InboxView = (typeof INBOX_VIEWS)[number];

export function isInboxView(value: unknown): value is InboxView {
  return INBOX_VIEWS.includes(value as InboxView);
}

/** The filter for one view. "Mine" needs the signed-in person's membership. */
export function viewWhere(view: InboxView, memberId: string | null): Prisma.ConversationWhereInput {
  switch (view) {
    case "unread":
      return { unreadCount: { gt: 0 } };
    case "unassigned":
      return { assignedToId: null };
    case "mine":
      // No membership means nothing is theirs; an impossible id says so.
      return { assignedToId: memberId ?? "-" };
    case "urgent":
      return { priority: "HIGH" };
    default:
      return {};
  }
}

/** How many threads are in each view, for the counts on the tabs. */
export async function inboxCounts(businessId: string, memberId: string | null) {
  const [unread, unassigned, mine, urgent] = await Promise.all(
    (["unread", "unassigned", "mine", "urgent"] as const).map((view) =>
      db.conversation.count({ where: { businessId, ...viewWhere(view, memberId) } }),
    ),
  );

  return { unread, unassigned, mine, urgent };
}

// ─── Assignment and priority ────────────────────────────────────────────────

export type InboxChange = { ok: true } | { ok: false; status: 400 | 404; message: string };

function contactLabel(conversation: { contactName: string | null; contactPhone: string }) {
  return conversation.contactName?.trim() || `+${conversation.contactPhone}`;
}

/**
 * Hands a conversation to a team member, or to nobody. The new assignee is
 * notified unless they took it themselves.
 */
export async function assignConversation(input: {
  businessId: string;
  conversationId: string;
  /** A BusinessMember id, or null to unassign. */
  memberId: string | null;
  actor: { userId: string; name: string };
}): Promise<InboxChange> {
  const conversation = await db.conversation.findFirst({
    where: { id: input.conversationId, businessId: input.businessId },
    select: { id: true, assignedToId: true, contactName: true, contactPhone: true },
  });

  if (!conversation) return { ok: false, status: 404, message: "That conversation doesn't exist." };

  let assignee: { id: string; userId: string } | null = null;

  if (input.memberId) {
    assignee = await db.businessMember.findFirst({
      where: { id: input.memberId, businessId: input.businessId },
      select: { id: true, userId: true },
    });

    if (!assignee) return { ok: false, status: 400, message: "That person isn't on your team." };
  }

  if (conversation.assignedToId === (assignee?.id ?? null)) return { ok: true };

  await db.conversation.update({
    where: { id: conversation.id },
    data: { assignedToId: assignee?.id ?? null },
  });

  if (assignee && assignee.userId !== input.actor.userId) {
    await notify(input.businessId, [assignee.userId], {
      kind: "ASSIGNED",
      conversationId: conversation.id,
      text: `${input.actor.name} gave you the conversation with ${contactLabel(conversation)}.`,
    });
  }

  return { ok: true };
}

/**
 * Takes an unassigned conversation for whoever just answered it, so the rest
 * of the team can see it's being handled. Never takes one from someone else.
 */
export async function claimIfUnassigned(businessId: string, conversationId: string, memberId: string) {
  await db.conversation.updateMany({
    where: { id: conversationId, businessId, assignedToId: null },
    data: { assignedToId: memberId },
  });
}

/** A person marking a thread urgent, or clearing it. */
export async function setConversationPriority(
  businessId: string,
  conversationId: string,
  priority: ConversationPriority,
): Promise<boolean> {
  const updated = await db.conversation.updateMany({
    where: { id: conversationId, businessId },
    data: {
      priority,
      priorityReason: priority === "HIGH" ? "Marked urgent by your team." : null,
    },
  });

  return updated.count > 0;
}

/**
 * Raised by the AI when a customer's message reads as angry or urgent
 * (message-router/router.ts). Whoever is handling the thread is told — or,
 * if nobody is, every owner — once per thread until a person clears it.
 */
export async function raiseUrgent(businessId: string, conversationId: string, reason: string): Promise<boolean> {
  const raised = await db.conversation.updateMany({
    where: { id: conversationId, businessId, priority: "NORMAL" },
    data: { priority: "HIGH", priorityReason: reason.slice(0, 200) },
  });

  if (raised.count === 0) return false;

  const conversation = await db.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: {
      contactName: true,
      contactPhone: true,
      assignedTo: { select: { userId: true } },
    },
  });

  const recipients = conversation.assignedTo
    ? [conversation.assignedTo.userId]
    : (
        await db.businessMember.findMany({ where: { businessId, role: "OWNER" }, select: { userId: true } })
      ).map((member) => member.userId);

  await notify(businessId, recipients, {
    kind: "URGENT",
    conversationId,
    text: `${contactLabel(conversation)} needs attention: ${reason.slice(0, 120)}`,
  });

  return true;
}

// ─── Team notes and @mentions ───────────────────────────────────────────────

export const MAX_TEAM_NOTE_LENGTH = 2000;

export type TeamNote = {
  id: string;
  body: string;
  author: string;
  authorUserId: string;
  mentions: string[];
  at: string;
};

/** Every note on a thread, oldest first, with who wrote it. */
export async function listTeamNotes(businessId: string, conversationId: string): Promise<TeamNote[]> {
  const notes = await db.conversationNote.findMany({
    where: { businessId, conversationId },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, body: true, authorId: true, mentionedUserIds: true, createdAt: true },
  });

  const names = await userNames([...new Set(notes.flatMap((note) => [note.authorId, ...note.mentionedUserIds]))]);

  return notes.map((note) => ({
    id: note.id,
    body: note.body,
    author: names.get(note.authorId) ?? "Someone",
    authorUserId: note.authorId,
    mentions: note.mentionedUserIds.map((id) => names.get(id) ?? "someone"),
    at: note.createdAt.toISOString(),
  }));
}

/**
 * Leaves a note on a thread. The people mentioned — chosen by member id, and
 * only ever this business's members — are notified; the author isn't.
 */
export async function addTeamNote(input: {
  businessId: string;
  conversationId: string;
  author: { userId: string; name: string };
  body: string;
  mentionedMemberIds: string[];
}): Promise<{ ok: true; note: TeamNote } | { ok: false; status: 400 | 404; message: string }> {
  const body = input.body.trim();

  if (!body) return { ok: false, status: 400, message: "Write the note first." };
  if (body.length > MAX_TEAM_NOTE_LENGTH) {
    return { ok: false, status: 400, message: `Keep notes under ${MAX_TEAM_NOTE_LENGTH} characters.` };
  }

  const conversation = await db.conversation.findFirst({
    where: { id: input.conversationId, businessId: input.businessId },
    select: { id: true, contactName: true, contactPhone: true },
  });

  if (!conversation) return { ok: false, status: 404, message: "That conversation doesn't exist." };

  const mentioned = await db.businessMember.findMany({
    where: { businessId: input.businessId, id: { in: [...new Set(input.mentionedMemberIds)].slice(0, 20) } },
    select: { userId: true },
  });
  const mentionedUserIds = mentioned.map((member) => member.userId);

  const note = await db.conversationNote.create({
    data: {
      businessId: input.businessId,
      conversationId: conversation.id,
      authorId: input.author.userId,
      body,
      mentionedUserIds,
    },
    select: { id: true, body: true, authorId: true, mentionedUserIds: true, createdAt: true },
  });

  await notify(
    input.businessId,
    mentionedUserIds.filter((id) => id !== input.author.userId),
    {
      kind: "MENTION",
      conversationId: conversation.id,
      text: `${input.author.name} mentioned you on ${contactLabel(conversation)}: ${body.slice(0, 120)}`,
    },
  );

  const names = await userNames([note.authorId, ...note.mentionedUserIds]);

  return {
    ok: true,
    note: {
      id: note.id,
      body: note.body,
      author: names.get(note.authorId) ?? input.author.name,
      authorUserId: note.authorId,
      mentions: note.mentionedUserIds.map((id) => names.get(id) ?? "someone"),
      at: note.createdAt.toISOString(),
    },
  };
}

// ─── Notifications ──────────────────────────────────────────────────────────

async function notify(
  businessId: string,
  userIds: string[],
  notification: { kind: NotificationKind; conversationId: string | null; text: string },
) {
  const unique = [...new Set(userIds)];

  if (unique.length === 0) return;

  await db.notification.createMany({
    data: unique.map((userId) => ({
      businessId,
      userId,
      kind: notification.kind,
      conversationId: notification.conversationId,
      text: notification.text.slice(0, 300),
    })),
  });
}

/** One person's recent notifications in this business, newest first. */
export async function listNotifications(businessId: string, userId: string) {
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: { businessId, userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, kind: true, conversationId: true, text: true, readAt: true, createdAt: true },
    }),
    db.notification.count({ where: { businessId, userId, readAt: null } }),
  ]);

  return {
    unread,
    items: items.map((item) => ({
      id: item.id,
      kind: item.kind,
      conversationId: item.conversationId,
      text: item.text,
      read: Boolean(item.readAt),
      at: item.createdAt.toISOString(),
    })),
  };
}

/** Marks some (or all) of one person's notifications read. Only ever their own. */
export async function markNotificationsRead(businessId: string, userId: string, ids: string[] | "all") {
  await db.notification.updateMany({
    where: { businessId, userId, readAt: null, ...(ids === "all" ? {} : { id: { in: ids.slice(0, 100) } }) },
    data: { readAt: new Date() },
  });
}

/** Display names for user ids: their name, or the start of their email. */
export async function userNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });

  return new Map(users.map((user) => [user.id, user.name?.trim() || user.email.split("@")[0]]));
}

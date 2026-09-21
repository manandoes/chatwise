// Saved replies — a short library of things a person types often, so
// answering a conversation by hand doesn't mean writing the same sentence out
// every time (docs/PRD.md §6).
//
// These are entirely a convenience for a person typing in the inbox. Nothing
// here is read by an agent — the knowledge base (lib/knowledge-base.ts) is
// what an agent answers from.

import "server-only";

import { db } from "@/lib/db";

/** Longest a quick reply's title may be. */
export const MAX_TITLE_LENGTH = 80;
/** Longest a quick reply's body may be — the same ceiling a message has. */
export const MAX_BODY_LENGTH = 4096;
/** How many a business may save. Plenty for a picker, not a second inbox. */
export const MAX_QUICK_REPLIES = 100;

export type QuickReplyRow = {
  id: string;
  title: string;
  body: string;
  position: number;
};

/** Every saved reply, in the order they were arranged. */
export async function listQuickReplies(
  businessId: string,
): Promise<QuickReplyRow[]> {
  return await db.quickReply.findMany({
    where: { businessId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, body: true, position: true },
  });
}

export type QuickReplyInput = { title: string; body: string };

/** Checks a quick reply's fields before it's saved. */
export function checkQuickReply(
  value: unknown,
):
  | { ok: true; input: QuickReplyInput }
  | { ok: false; message: string; fields: Record<string, string> } {
  const body = value as { title?: unknown; body?: unknown } | null;
  const fields: Record<string, string> = {};

  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const text = typeof body?.body === "string" ? body.body.trim() : "";

  if (!title) fields.title = "Give it a short name.";
  else if (title.length > MAX_TITLE_LENGTH) {
    fields.title = `Keep it under ${MAX_TITLE_LENGTH} characters.`;
  }

  if (!text) fields.body = "Write what it should say.";
  else if (text.length > MAX_BODY_LENGTH) {
    fields.body = `That's longer than WhatsApp allows (${MAX_BODY_LENGTH} characters).`;
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, message: "Check the highlighted fields.", fields };
  }

  return { ok: true, input: { title, body: text } };
}

/** Adds a new saved reply, at the end of the list. */
export async function createQuickReply(
  businessId: string,
  input: QuickReplyInput,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const count = await db.quickReply.count({ where: { businessId } });

  if (count >= MAX_QUICK_REPLIES) {
    return {
      ok: false,
      message: `You've reached the limit of ${MAX_QUICK_REPLIES} saved replies. Remove one before adding another.`,
    };
  }

  const created = await db.quickReply.create({
    data: { businessId, title: input.title, body: input.body, position: count },
    select: { id: true },
  });

  return { ok: true, id: created.id };
}

/** Edits a saved reply that belongs to this business. */
export async function updateQuickReply(
  businessId: string,
  id: string,
  input: QuickReplyInput,
): Promise<boolean> {
  const result = await db.quickReply.updateMany({
    where: { id, businessId },
    data: { title: input.title, body: input.body },
  });

  return result.count > 0;
}

/** Removes a saved reply. */
export async function deleteQuickReply(
  businessId: string,
  id: string,
): Promise<boolean> {
  const result = await db.quickReply.deleteMany({ where: { id, businessId } });

  return result.count > 0;
}

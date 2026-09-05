// The customer record the CRM agent keeps, and the rules about who may change
// what.
//
// One rule matters more than the rest and is the reason this file exists rather
// than the agent writing to the database itself: **a person's edit wins**. If
// somebody at the business has corrected a lead's name, status or score in the
// dashboard, the CRM agent leaves that field alone from then on — unless the
// owner explicitly says otherwise for that lead (docs/Rules.md §5). Deciding
// that belongs here, in one place, and not in an agent's prompt: an instruction
// a model is asked to follow is not a protection, it is a request.
//
// Phase 10 added the other half: the leads screen, and `applyHumanEdit` below.
// The two halves are deliberately in the same file. "Whose write wins" is one
// rule, and splitting the agent's side from the person's side across two
// modules is how the two drift apart until neither is quite the truth.
//
// Relative .ts imports on purpose: this file is loaded by the Next.js app and
// by the always-on WhatsApp session manager, which runs under plain Node.

import "server-only";

import type { CrmUpdate } from "../bots/crm-bot/handler.ts";
import type { LeadSnapshot } from "../bots/crm-bot/prompt.ts";
import type { LeadEdit, LeadStatusValue } from "./validation/leads.ts";
import { db } from "./db.ts";

/**
 * The fields both the agent and a person can write.
 *
 * These are the ones worth protecting, and the list the agent's writes are
 * checked against. `notes` is missing on purpose — it is a person's own column
 * and the agent never writes to it, so there is nothing there to defend.
 */
const CONTESTED_FIELDS = [
  "name",
  "email",
  "status",
  "score",
  "tags",
  "summary",
  "nextStep",
] as const;

/** The record as it stands, for the agent to correct rather than restate. */
export async function readLeadSnapshot(
  conversationId: string,
): Promise<LeadSnapshot | null> {
  const lead = await db.lead.findUnique({
    where: { conversationId },
    select: {
      name: true,
      email: true,
      status: true,
      score: true,
      tags: true,
      summary: true,
      nextStep: true,
      fieldsEditedByHuman: true,
    },
  });

  return lead ?? null;
}

/**
 * Writes what the agent worked out, minus anything a person owns.
 *
 * Returns the fields that actually changed — useful in the logs, and it is what
 * decides whether the record is stamped as touched at all. An agent that had
 * nothing new to say should not make a lead look freshly updated in a list
 * sorted by when it last changed.
 */
export async function applyAgentUpdate({
  businessId,
  conversationId,
  contactPhone,
  update,
}: {
  businessId: string;
  conversationId: string;
  contactPhone: string;
  update: CrmUpdate;
}): Promise<{ changed: string[] }> {
  const existing = await db.lead.findUnique({
    where: { conversationId },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      score: true,
      tags: true,
      summary: true,
      nextStep: true,
      fieldsEditedByHuman: true,
      letTheAgentUpdateThis: true,
    },
  });

  if (!existing) {
    // Nothing to protect yet — but still nothing to create if the agent had no
    // opinion, because an empty lead in the list helps nobody.
    const fields = Object.keys(update);

    if (fields.length === 0) return { changed: [] };

    await db.lead.create({
      data: {
        businessId,
        conversationId,
        contactPhone,
        ...update,
        lastAgentUpdateAt: new Date(),
      },
    });

    return { changed: fields };
  }

  const protectedFields = existing.letTheAgentUpdateThis
    ? new Set<string>()
    : new Set(existing.fieldsEditedByHuman);

  const data: Record<string, unknown> = {};
  const changed: string[] = [];

  for (const [field, value] of Object.entries(update)) {
    if (protectedFields.has(field)) continue;

    const current = existing[field as keyof typeof existing];

    if (isSame(current, value)) continue;

    data[field] = value;
    changed.push(field);
  }

  if (changed.length === 0) return { changed: [] };

  await db.lead.update({
    where: { id: existing.id },
    data: { ...data, lastAgentUpdateAt: new Date() },
  });

  return { changed };
}

/** Whether the agent is actually saying anything new. */
function isSame(current: unknown, next: unknown): boolean {
  if (Array.isArray(current) && Array.isArray(next)) {
    return (
      current.length === next.length &&
      current.every((entry, index) => entry === next[index])
    );
  }

  return current === next;
}

// ─── Phase 10: the leads screen ─────────────────────────────────────────────
// Everything below is read or written by a person rather than by the agent.

/** One row in the leads table. */
export type LeadRow = {
  id: string;
  conversationId: string;
  contactPhone: string;
  /** The lead's own name, or failing that whatever WhatsApp calls them. */
  name: string | null;
  email: string | null;
  status: string;
  score: number | null;
  tags: string[];
  summary: string | null;
  nextStep: string | null;
  updatedAt: Date;
  /** True once a person has corrected anything the agent could also write. */
  hasHumanEdits: boolean;
};

/**
 * Every lead this business has, most recently changed first.
 *
 * Optionally narrowed to one status, which is how somebody works through a
 * list — "show me the qualified ones" — without needing search built first.
 */
export async function listLeads(
  businessId: string,
  status?: LeadStatusValue,
): Promise<LeadRow[]> {
  const rows = await db.lead.findMany({
    where: { businessId, ...(status ? { status } : {}) },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      conversationId: true,
      contactPhone: true,
      name: true,
      email: true,
      status: true,
      score: true,
      tags: true,
      summary: true,
      nextStep: true,
      updatedAt: true,
      fieldsEditedByHuman: true,
      conversation: { select: { contactName: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    contactPhone: row.contactPhone,
    name: row.name ?? row.conversation.contactName,
    email: row.email,
    status: row.status,
    score: row.score,
    tags: row.tags,
    summary: row.summary,
    nextStep: row.nextStep,
    updatedAt: row.updatedAt,
    hasHumanEdits: row.fieldsEditedByHuman.length > 0,
  }));
}

/** How many leads sit at each status, for the filter along the top. */
export async function countLeadsByStatus(
  businessId: string,
): Promise<Record<string, number>> {
  const rows = await db.lead.groupBy({
    by: ["status"],
    where: { businessId },
    _count: { _all: true },
  });

  return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
}

/** One lead as its own screen shows it, or null if it isn't this account's. */
export async function readLead(businessId: string, id: string) {
  return await db.lead.findFirst({
    where: { id, businessId },
    select: {
      id: true,
      conversationId: true,
      contactPhone: true,
      name: true,
      email: true,
      status: true,
      score: true,
      tags: true,
      summary: true,
      nextStep: true,
      notes: true,
      fieldsEditedByHuman: true,
      letTheAgentUpdateThis: true,
      lastAgentUpdateAt: true,
      updatedAt: true,
      conversation: { select: { contactName: true } },
    },
  });
}

/**
 * Saves what a person changed, and remembers that they changed it.
 *
 * The remembering is the whole point. Every field here is one the CRM agent
 * could also write, so the moment somebody corrects one it goes into
 * `fieldsEditedByHuman` and `applyAgentUpdate` skips it from then on
 * (docs/Rules.md §5).
 *
 * Only fields whose value **actually changed** are claimed. A person who opens
 * the form, fixes the status and saves has taken ownership of the status and
 * nothing else — the agent carries on keeping the summary current, which is
 * what it is for. Marking every field on screen would quietly switch the agent
 * off the first time anybody touched a lead.
 *
 * `letTheAgentUpdateThis` is the owner's waiver and does not clear that list:
 * turning it back off restores exactly the protection they had before.
 */
export async function applyHumanEdit({
  businessId,
  id,
  edit,
}: {
  businessId: string;
  id: string;
  edit: LeadEdit;
}): Promise<{ ok: boolean; claimed: string[] }> {
  const existing = await db.lead.findFirst({
    where: { id, businessId },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      score: true,
      tags: true,
      summary: true,
      nextStep: true,
      fieldsEditedByHuman: true,
    },
  });

  if (!existing) return { ok: false, claimed: [] };

  const claimed = CONTESTED_FIELDS.filter(
    (field) => !isSame(existing[field], edit[field]),
  );

  await db.lead.update({
    where: { id: existing.id },
    data: {
      name: edit.name,
      email: edit.email,
      status: edit.status,
      score: edit.score,
      tags: edit.tags,
      summary: edit.summary,
      nextStep: edit.nextStep,
      notes: edit.notes,
      letTheAgentUpdateThis: edit.letTheAgentUpdateThis,
      fieldsEditedByHuman: [
        ...new Set([...existing.fieldsEditedByHuman, ...claimed]),
      ],
    },
  });

  return { ok: true, claimed };
}

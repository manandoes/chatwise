// Deals: potential sales moved across a pipeline board, and the log of
// everything that happened to each.
//
// Every change goes through `updateDeal`, which writes the change and its
// activity entry in one transaction — so the log can never disagree with the
// board. Scoped by business on every query; ids from a request only ever
// narrow what the business already owns.

import "server-only";

import type { DealStage, Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";

export const DEAL_STAGES: { stage: DealStage; label: string }[] = [
  { stage: "LEAD", label: "New lead" },
  { stage: "QUALIFIED", label: "Qualified" },
  { stage: "PROPOSAL", label: "Proposal sent" },
  { stage: "WON", label: "Won" },
  { stage: "LOST", label: "Lost" },
];

export const STAGE_LABEL = Object.fromEntries(DEAL_STAGES.map((one) => [one.stage, one.label])) as Record<
  DealStage,
  string
>;

export function isDealStage(value: unknown): value is DealStage {
  return DEAL_STAGES.some((one) => one.stage === value);
}

export type DealInput = {
  title?: string;
  value?: number;
  currency?: string;
  stage?: DealStage;
  ownerId?: string | null;
  expectedClose?: Date | null;
  position?: number;
};

export type DealResult = { ok: true; id: string } | { ok: false; message: string; field?: string };

async function checkOwner(businessId: string, ownerId: string | null | undefined) {
  if (!ownerId) return true;

  const member = await db.businessMember.findFirst({ where: { id: ownerId, businessId }, select: { id: true } });

  return Boolean(member);
}

export async function createDeal(
  businessId: string,
  actorUserId: string,
  input: DealInput & { contactId: string; title: string },
): Promise<DealResult> {
  const contact = await db.contact.findFirst({
    where: { id: input.contactId, businessId },
    select: { id: true },
  });

  if (!contact) return { ok: false, message: "That contact doesn't exist.", field: "contactId" };
  if (!(await checkOwner(businessId, input.ownerId))) {
    return { ok: false, message: "That person isn't on your team.", field: "ownerId" };
  }

  const stage = input.stage ?? "LEAD";

  // New cards go to the bottom of their column.
  const last = await db.deal.aggregate({ where: { businessId, stage }, _max: { position: true } });

  const deal = await db.$transaction(async (tx) => {
    const created = await tx.deal.create({
      data: {
        businessId,
        contactId: contact.id,
        title: input.title,
        value: input.value ?? 0,
        currency: input.currency ?? "INR",
        stage,
        ownerId: input.ownerId ?? null,
        expectedClose: input.expectedClose ?? null,
        position: (last._max.position ?? 0) + 1,
        closedAt: stage === "WON" || stage === "LOST" ? new Date() : null,
      },
      select: { id: true },
    });

    await tx.dealActivity.create({
      data: { businessId, dealId: created.id, actorUserId, kind: "CREATED", toStage: stage },
    });

    return created;
  });

  return { ok: true, id: deal.id };
}

/** Changes a deal and records what changed. */
export async function updateDeal(
  businessId: string,
  dealId: string,
  actorUserId: string,
  input: DealInput,
): Promise<DealResult> {
  const deal = await db.deal.findFirst({
    where: { id: dealId, businessId },
    select: { id: true, stage: true, value: true, ownerId: true },
  });

  if (!deal) return { ok: false, message: "That deal doesn't exist." };
  if (input.ownerId !== undefined && !(await checkOwner(businessId, input.ownerId))) {
    return { ok: false, message: "That person isn't on your team.", field: "ownerId" };
  }

  const data: Prisma.DealUncheckedUpdateInput = {};
  const activities: Omit<Prisma.DealActivityUncheckedCreateInput, "businessId" | "dealId" | "actorUserId">[] = [];

  if (input.title !== undefined) data.title = input.title;
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.expectedClose !== undefined) data.expectedClose = input.expectedClose;
  if (input.position !== undefined) data.position = input.position;

  if (input.stage !== undefined && input.stage !== deal.stage) {
    data.stage = input.stage;
    data.closedAt = input.stage === "WON" || input.stage === "LOST" ? new Date() : null;
    activities.push({ kind: "STAGE_CHANGED", fromStage: deal.stage, toStage: input.stage });
  }

  if (input.value !== undefined && Number(deal.value) !== input.value) {
    data.value = input.value;
    activities.push({ kind: "VALUE_CHANGED", note: `${deal.value.toString()} → ${input.value}` });
  }

  if (input.ownerId !== undefined && input.ownerId !== deal.ownerId) {
    data.ownerId = input.ownerId;
    activities.push({ kind: "OWNER_CHANGED" });
  }

  await db.$transaction([
    db.deal.update({ where: { id: deal.id }, data }),
    ...activities.map((activity) =>
      db.dealActivity.create({ data: { ...activity, businessId, dealId: deal.id, actorUserId } }),
    ),
  ]);

  return { ok: true, id: deal.id };
}

export async function addDealNote(businessId: string, dealId: string, actorUserId: string, note: string) {
  const deal = await db.deal.findFirst({ where: { id: dealId, businessId }, select: { id: true } });

  if (!deal) return false;

  await db.dealActivity.create({ data: { businessId, dealId: deal.id, actorUserId, kind: "NOTE", note } });

  return true;
}

/** The board: every open deal, and closed ones from the last 30 days. */
export async function listBoard(businessId: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60_000);

  return db.deal.findMany({
    where: {
      businessId,
      OR: [{ stage: { notIn: ["WON", "LOST"] } }, { closedAt: { gte: since } }],
    },
    orderBy: [{ stage: "asc" }, { position: "asc" }],
    take: 500,
    select: {
      id: true,
      title: true,
      stage: true,
      value: true,
      currency: true,
      position: true,
      expectedClose: true,
      contact: { select: { id: true, name: true, phone: true } },
      owner: { select: { id: true, user: { select: { name: true, email: true } } } },
    },
  });
}

/** One deal's history, oldest first, with who did each thing. */
export async function dealActivity(businessId: string, dealId: string) {
  const rows = await db.dealActivity.findMany({
    where: { businessId, dealId },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, kind: true, fromStage: true, toStage: true, note: true, actorUserId: true, createdAt: true },
  });

  const actorIds = [...new Set(rows.map((row) => row.actorUserId).filter((id): id is string => Boolean(id)))];
  const people = await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } });
  const nameOf = new Map(people.map((person) => [person.id, person.name || person.email]));

  return rows.map((row) => ({
    ...row,
    actor: row.actorUserId ? (nameOf.get(row.actorUserId) ?? "Someone") : "ChatWise",
  }));
}

/** Reads a deal's editable fields from a request body, for the create and update routes. */
export function readDealFields(
  body: Record<string, unknown> | null,
): { ok: true; value: DealInput } | { ok: false; message: string; fields: Record<string, string> } {
  const value: DealInput = {};
  const fields: Record<string, string> = {};

  if (typeof body?.title === "string") {
    const title = body.title.trim().slice(0, 120);

    if (!title) fields.title = "Give it a title.";
    else value.title = title;
  }

  if (body?.value !== undefined && body.value !== "") {
    const amount = Number(body.value);

    if (!Number.isFinite(amount) || amount < 0 || amount > 1e12) fields.value = "Enter an amount of 0 or more.";
    else value.value = Math.round(amount * 100) / 100;
  }

  if (typeof body?.currency === "string") {
    const currency = body.currency.trim().toUpperCase();

    if (!/^[A-Z]{3}$/.test(currency)) fields.currency = "Use a three-letter code, like INR.";
    else value.currency = currency;
  }

  if (body?.stage !== undefined) {
    if (!isDealStage(body.stage)) fields.stage = "Choose a stage.";
    else value.stage = body.stage;
  }

  if (body?.ownerId !== undefined) {
    value.ownerId = typeof body.ownerId === "string" && body.ownerId ? body.ownerId : null;
  }

  if (body?.expectedClose !== undefined) {
    if (body.expectedClose === null || body.expectedClose === "") value.expectedClose = null;
    else {
      const date = new Date(String(body.expectedClose));

      if (Number.isNaN(date.getTime())) fields.expectedClose = "That isn't a date.";
      else value.expectedClose = date;
    }
  }

  if (body?.position !== undefined) {
    const position = Number(body.position);

    if (Number.isFinite(position)) value.position = position;
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, message: Object.values(fields)[0], fields };
  }

  return { ok: true, value };
}

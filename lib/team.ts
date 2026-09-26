// Who works in which business, and what they may do there.
//
// Until 2026-09 one login was one business. A business can now have a team:
// its owner plus any number of agents who work the inbox and the CRM. Every
// "which business is this person in?" question goes through `findMembership`,
// so the rule lives in one place (docs/Rules.md §3).
//
// Owners of accounts created before teams existed have a membership row from
// the migration; `findMembership` also heals any that do not.

import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { MemberRole } from "./generated/prisma/client.ts";
import { db } from "./db.ts";

export type Membership = {
  businessId: string;
  memberId: string;
  role: MemberRole;
};

/** The business this user works in, if any. */
export async function findMembership(userId: string): Promise<Membership | null> {
  const member = await db.businessMember.findUnique({
    where: { userId },
    select: { id: true, businessId: true, role: true },
  });

  if (member) return { businessId: member.businessId, memberId: member.id, role: member.role };

  // An owner whose membership row is missing (created between the migration
  // and this code going live). Their business still says they own it.
  const owned = await db.business.findUnique({ where: { userId }, select: { id: true } });

  if (!owned) return null;

  const created = await db.businessMember.upsert({
    where: { userId },
    create: { businessId: owned.id, userId, role: "OWNER" },
    update: {},
    select: { id: true, businessId: true, role: true },
  });

  return { businessId: created.businessId, memberId: created.id, role: created.role };
}

/** Everybody in a business, owner first. */
export async function listMembers(businessId: string) {
  const members = await db.businessMember.findMany({
    where: { businessId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return members.map((member) => ({
    id: member.id,
    userId: member.user.id,
    name: member.user.name?.trim() || member.user.email.split("@")[0],
    email: member.user.email,
    role: member.role,
    joinedAt: member.createdAt,
  }));
}

export type TeamMember = Awaited<ReturnType<typeof listMembers>>[number];

/** How long an invitation link works for. */
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60_000;

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates an invitation and returns the secret token for its link. The token
 * is shown once and only its hash is stored.
 */
export async function createInvite(input: {
  businessId: string;
  invitedById: string;
  email: string;
  role: MemberRole;
}): Promise<{ id: string; token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_LIFETIME_MS);

  // A fresh invite to the same address replaces any still-open one.
  await db.teamInvite.updateMany({
    where: {
      businessId: input.businessId,
      email: input.email,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  const invite = await db.teamInvite.create({
    data: {
      businessId: input.businessId,
      invitedById: input.invitedById,
      email: input.email,
      role: input.role,
      tokenHash: hashInviteToken(token),
      expiresAt,
    },
    select: { id: true },
  });

  return { id: invite.id, token, expiresAt };
}

/** An invitation that can still be accepted, looked up by its secret token. */
export async function findOpenInvite(token: string) {
  const invite = await db.teamInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: {
      id: true,
      businessId: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      business: { select: { name: true } },
    },
  });

  if (!invite || invite.acceptedAt || invite.revokedAt) return null;
  if (invite.expiresAt.getTime() < Date.now()) return null;

  return invite;
}

export type AcceptResult =
  | { ok: true; businessId: string }
  | { ok: false; message: string };

/**
 * Joins the signed-in user to the business that invited them.
 *
 * The invitation is bound to an email address: the link alone is not enough,
 * the person must be signed in as that address. Somebody who already runs a
 * set-up business of their own is refused rather than silently moved — their
 * own customers' data would go dark. An unfinished, empty account (they signed
 * up only to accept this) is cleared away instead.
 */
export async function acceptInvite(token: string, user: { id: string; email: string }): Promise<AcceptResult> {
  const invite = await findOpenInvite(token);

  if (!invite) {
    return { ok: false, message: "This invitation has expired or was withdrawn. Ask for a new one." };
  }

  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return {
      ok: false,
      message: `This invitation is for ${invite.email}. Sign in with that address to accept it.`,
    };
  }

  const current = await findMembership(user.id);

  if (current?.businessId === invite.businessId) {
    return { ok: true, businessId: invite.businessId };
  }

  if (current) {
    const own = await db.business.findUnique({
      where: { id: current.businessId },
      select: {
        userId: true,
        onboardingCompletedAt: true,
        connection: { select: { id: true } },
        _count: { select: { conversations: true, members: true } },
      },
    });

    const isEmptyShell =
      own &&
      own.userId === user.id &&
      !own.onboardingCompletedAt &&
      !own.connection &&
      own._count.conversations === 0 &&
      own._count.members <= 1;

    if (!isEmptyShell) {
      return {
        ok: false,
        message:
          "You're already part of another ChatWise workspace. Each login can belong to one workspace — use a different email address to join this one.",
      };
    }

    await db.business.delete({ where: { id: current.businessId } });
  }

  await db.$transaction([
    db.businessMember.create({
      data: { businessId: invite.businessId, userId: user.id, role: invite.role },
    }),
    db.teamInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);

  return { ok: true, businessId: invite.businessId };
}

export const ROLE_LABEL: Record<MemberRole, string> = {
  OWNER: "Owner",
  AGENT: "Team member",
};

export function isMemberRole(value: unknown): value is MemberRole {
  return value === "OWNER" || value === "AGENT";
}

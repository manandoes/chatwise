// Team — the people who work in this account.

import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { TeamManager } from "@/components/dashboard/team-manager";
import { db } from "@/lib/db";
import { requirePageContext } from "@/lib/page-context";
import { listMembers } from "@/lib/team";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const { business, isOwner, memberId } = await requirePageContext();

  const [members, invites] = await Promise.all([
    listMembers(business.id),
    isOwner
      ? db.teamInvite.findMany({
          where: {
            businessId: business.id,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, email: true, role: true, expiresAt: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Team"
        description="Everyone who works in this ChatWise account. Conversations can be assigned to any of them, and they can @mention each other in internal notes."
      />

      <TeamManager
        members={members.map((member) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
          isCreator: member.userId === business.userId,
        }))}
        invites={invites.map((invite) => ({
          ...invite,
          expiresAt: invite.expiresAt.toISOString(),
        }))}
        isOwner={isOwner}
        you={memberId}
      />
    </div>
  );
}

// Deals — potential sales, moved across a pipeline board.

import type { Metadata } from "next";

import { DealsBoard } from "@/components/dashboard/deals-board";
import { PageHeader } from "@/components/dashboard/page-header";
import { db } from "@/lib/db";
import { DEAL_STAGES, listBoard } from "@/lib/deals";
import { requirePageContext } from "@/lib/page-context";
import { listMembers } from "@/lib/team";

export const metadata: Metadata = { title: "Deals" };

export default async function DealsPage() {
  const { business } = await requirePageContext();

  const [deals, members, contacts] = await Promise.all([
    listBoard(business.id),
    listMembers(business.id),
    // For choosing who a new deal is with. The most recently active first.
    db.contact.findMany({
      where: { businessId: business.id },
      orderBy: { updatedAt: "desc" },
      take: 500,
      select: { id: true, name: true, phone: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deals"
        description="Track potential sales from first chat to closed. Drag a card to move it; open it to see everything that happened."
      />

      <DealsBoard
        stages={DEAL_STAGES}
        deals={deals.map((deal) => ({
          id: deal.id,
          title: deal.title,
          stage: deal.stage,
          value: Number(deal.value),
          currency: deal.currency,
          position: deal.position,
          expectedClose: deal.expectedClose ? deal.expectedClose.toISOString().slice(0, 10) : "",
          contactId: deal.contact.id,
          contactLabel: deal.contact.name || `+${deal.contact.phone}`,
          ownerId: deal.owner?.id ?? "",
          ownerName: deal.owner ? deal.owner.user.name || deal.owner.user.email : null,
        }))}
        members={members.map((member) => ({ id: member.id, name: member.name }))}
        contacts={contacts.map((contact) => ({
          id: contact.id,
          label: contact.name ? `${contact.name} (+${contact.phone})` : `+${contact.phone}`,
        }))}
      />
    </div>
  );
}

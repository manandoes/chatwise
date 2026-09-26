// Writing a new campaign.
//
// The page fetches; components/dashboard/campaign-builder.tsx decides. The list
// below is this account's own conversations — the people who have messaged it.
// Since 2026-09-18 an owner can also type numbers in for people who never have
// (docs/PRD.md §7.4), which is why the builder takes a pasted list as well as a
// picker. That widened the audience; it did not soften anything else, and the
// cap, throttle, opt-out checks and ban-risk warning all still count everybody
// on the list the same way (docs/Rules.md §8).

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { listSendableContacts } from "@/campaigns/send-campaign";
import { OPT_OUT_LINE } from "@/campaigns/opt-out";
import { listTemplates } from "@/campaigns/templates/saved-templates";
import { CampaignBuilder } from "@/components/dashboard/campaign-builder";
import { PageHeader } from "@/components/dashboard/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { describeSegmentFilter, segmentWhere, storedFilter } from "@/lib/segments";
import { getOnboardingState } from "@/lib/onboarding";

export const metadata: Metadata = { title: "New campaign" };

export default async function NewCampaignPage() {
  const user = await requireUser();
  const { business, connection } = await getOnboardingState(user.id);

  // Nothing here works without a connection, and the tier changes every rule on
  // the screen — so send them to connect rather than showing a form that could
  // only fail.
  if (!connection) redirect("/dashboard/connect-whatsapp");

  const [contacts, templates, savedSegments] = await Promise.all([
    listSendableContacts(business.id),
    listTemplates(business.id),
    db.segment.findMany({
      where: { businessId: business.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, filter: true },
    }),
  ]);

  // How many each segment could reach now. A segment whose filter can't be
  // read is left out rather than offered and refused.
  const segments = (
    await Promise.all(
      savedSegments.map(async (segment) => {
        const filter = storedFilter(segment.filter);

        if (!filter) return null;

        const where = segmentWhere(business.id, filter);
        const [reachable, optedIn] = await Promise.all([
          db.contact.count({ where: { AND: [where, { optInStatus: { not: "OPTED_OUT" } }] } }),
          db.contact.count({ where: { AND: [where, { optInStatus: "OPTED_IN" }] } }),
        ]);

        return {
          id: segment.id,
          name: segment.name,
          description: describeSegmentFilter(filter),
          reachable,
          optedIn,
        };
      }),
    )
  ).filter((segment) => segment !== null);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard/campaigns"
          className="inline-flex items-center gap-1.5 text-small text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="size-4" />
          All campaigns
        </Link>
      </div>

      <PageHeader
        title="New campaign"
        description="One message, sent to the people you choose."
      />

      <CampaignBuilder
        tier={connection.type}
        contacts={contacts.map((contact) => ({
          conversationId: contact.conversationId,
          contactPhone: contact.contactPhone,
          contactName: contact.contactName,
          optedOut: contact.optedOut,
        }))}
        templates={templates.map((template) => ({
          id: template.id,
          name: template.name,
          body: template.body,
          usable: template.usable,
          approvalLabel: template.approvalLabel,
          metaName: template.metaName,
        }))}
        segments={segments}
        optOutLine={OPT_OUT_LINE}
      />
    </div>
  );
}

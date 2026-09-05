// Writing a new campaign.
//
// The page fetches; components/dashboard/campaign-builder.tsx decides. What is
// worth noticing here is where the contacts come from: this account's own
// conversations, and nowhere else. There is no import, and no box to type a
// phone number into. You can only broadcast to somebody who messaged you first,
// which is the strongest thing the product does to keep its customers out of
// trouble (docs/Rules.md §8).

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
import { getOnboardingState } from "@/lib/onboarding";

export const metadata: Metadata = { title: "New campaign" };

export default async function NewCampaignPage() {
  const user = await requireUser();
  const { business, connection } = await getOnboardingState(user.id);

  // Nothing here works without a connection, and the tier changes every rule on
  // the screen — so send them to connect rather than showing a form that could
  // only fail.
  if (!connection) redirect("/dashboard/connect-whatsapp");

  const [contacts, templates] = await Promise.all([
    listSendableContacts(business.id),
    listTemplates(business.id),
  ]);

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
        optOutLine={OPT_OUT_LINE}
      />
    </div>
  );
}

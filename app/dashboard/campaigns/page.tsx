// Campaigns — every bulk send this account has run.
//
// Also where the unsubscribe list lives. It belongs on this screen rather than
// somewhere in Settings: the people on it are the people a campaign will not
// reach, and an owner wondering "why did only 22 of my 25 go out?" should find
// the answer next to the send that raised the question (docs/Rules.md §7).

import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone } from "lucide-react";

import { listOptOuts } from "@/campaigns/opt-out";
import { listCampaigns } from "@/campaigns/send-campaign";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { formatWhen } from "@/lib/format-when";
import { getOnboardingState } from "@/lib/onboarding";

export const metadata: Metadata = { title: "Campaigns" };

/** Plain words for a campaign's state (docs/Rules.md §7). */
const STATUS_TEXT: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Waiting to start",
  SENDING: "Sending now",
  SENT: "Finished",
  CANCELLED: "Cancelled",
};

export default async function CampaignsPage() {
  const user = await requireUser();
  const { business, connection } = await getOnboardingState(user.id);

  const [campaigns, optOuts] = await Promise.all([
    listCampaigns(business.id),
    listOptOuts(business.id),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Campaigns"
        description="Send one message to a group of the people who have messaged you."
      />

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/dashboard/campaigns/new">New campaign</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/campaigns/templates">Templates</Link>
        </Button>
      </div>

      {!connection && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-small text-text-primary">
          Connect your WhatsApp number before sending a campaign.{" "}
          <Link
            href="/dashboard/connect-whatsapp"
            className="text-primary underline underline-offset-4"
          >
            Connect it now
          </Link>
        </p>
      )}

      {campaigns.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface/50 p-8">
          <Megaphone className="size-6 text-text-disabled" />
          <h2 className="mt-4 text-h3 font-semibold text-text-primary">
            No campaigns yet
          </h2>
          <p className="mt-2 max-w-[62ch] text-pretty text-small leading-relaxed text-text-secondary">
            A campaign sends the same message to a group of people at once —
            an offer, a reminder, an update. You can only send to people who
            have messaged you, and anybody who unsubscribes is left out
            automatically.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <Link
                href={`/dashboard/campaigns/${campaign.id}`}
                className="block px-5 py-4 transition-colors hover:bg-surface-elevated"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-medium text-text-primary">
                    {campaign.name}
                  </span>
                  <span className="text-small text-text-secondary">
                    {formatWhen(campaign.createdAt)}
                  </span>
                </div>

                <p className="mt-1 text-small text-text-secondary">
                  {STATUS_TEXT[campaign.status] ?? campaign.status} ·{" "}
                  {campaign.recipients}{" "}
                  {campaign.recipients === 1 ? "person" : "people"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-3">
        <h2 className="text-h3 font-semibold text-text-primary">
          Unsubscribed
        </h2>

        {optOuts.length === 0 ? (
          <p className="max-w-[62ch] text-pretty text-small leading-relaxed text-text-secondary">
            Nobody has unsubscribed. Anyone who replies STOP to one of your
            messages lands here, and is left out of every campaign from then on
            — there is no way to send to them again unless they reply START
            themselves.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {optOuts.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-3"
              >
                <span className="text-small text-text-primary">
                  +{row.contactPhone}
                </span>
                <span className="text-xs text-text-secondary">
                  Unsubscribed {formatWhen(row.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

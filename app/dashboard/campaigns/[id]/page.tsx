// One campaign, and what became of every message in it.
//
// The honest bit is the QR tier's: it can say a message was handed to
// WhatsApp and nothing more, because a QR connection reports nothing back
// (`supportsDeliveryReceipts` in whatsapp-connectors/capabilities.ts). Showing
// "delivered" there would be a guess dressed up as a fact (docs/Rules.md §4),
// so the screen says what it actually knows and explains why.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { readCampaign } from "@/campaigns/send-campaign";
import { CancelCampaignButton } from "@/components/dashboard/cancel-campaign-button";
import { PageHeader } from "@/components/dashboard/page-header";
import { Stat } from "@/components/dashboard/stat";
import { requireUser } from "@/lib/auth";
import { formatWhen } from "@/lib/format-when";
import { getOnboardingState } from "@/lib/onboarding";

export const metadata: Metadata = { title: "Campaign" };

const STATUS_TEXT: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Waiting to start",
  SENDING: "Sending now",
  SENT: "Finished",
  CANCELLED: "Cancelled",
};

/** What each recipient's state is called, in words rather than a code. */
const RECIPIENT_TEXT: Record<string, string> = {
  PENDING: "Waiting its turn",
  SENDING: "Going out now",
  SENT: "Sent",
  DELIVERED: "Delivered",
  READ: "Read",
  REPLIED: "Replied",
  FAILED: "Didn't send",
  SKIPPED: "Not sent",
};

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const { business } = await getOnboardingState(user.id);

  const campaign = await readCampaign(business.id, id);

  if (!campaign) notFound();

  const total = campaign.recipients.length;
  const waiting = campaign.counted.PENDING ?? 0;
  const gone =
    (campaign.counted.SENT ?? 0) +
    (campaign.counted.DELIVERED ?? 0) +
    (campaign.counted.READ ?? 0) +
    (campaign.counted.REPLIED ?? 0);
  const replied = campaign.counted.REPLIED ?? 0;
  const failed = campaign.counted.FAILED ?? 0;
  const skipped = campaign.counted.SKIPPED ?? 0;

  const stillRunning =
    campaign.status === "SCHEDULED" || campaign.status === "SENDING";

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
        title={campaign.name}
        description={`${STATUS_TEXT[campaign.status] ?? campaign.status} · started ${formatWhen(campaign.createdAt)}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="People" value={String(total)} />
        <Stat
          label="Gone out"
          value={String(gone)}
          hint={waiting > 0 ? `${waiting} still waiting their turn` : undefined}
        />
        <Stat
          label="Replied"
          value={String(replied)}
          hint="The clearest sign it landed"
        />
        <Stat
          label="Not sent"
          value={String(failed + skipped)}
          hint={
            skipped > 0
              ? `${skipped} had unsubscribed`
              : failed > 0
                ? "Something went wrong — see the list"
                : undefined
          }
        />
      </div>

      {stillRunning && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-5">
          <p className="max-w-[62ch] flex-1 text-pretty text-small leading-relaxed text-text-secondary">
            {campaign.throttleMs > 0
              ? "Messages are going out one at a time, spaced apart, to keep your number safe. You can close this page — it carries on without you."
              : "This campaign is going out now."}
          </p>

          <CancelCampaignButton campaignId={campaign.id} />
        </div>
      )}

      {campaign.tier === "QR" && (
        <p className="max-w-[70ch] text-pretty text-xs leading-relaxed text-text-secondary">
          Your QR connection tells us a message was handed to WhatsApp, but not
          whether it was delivered or read — so that&rsquo;s as much as this
          page can honestly show. A reply is the one signal it does get.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-h3 font-semibold text-text-primary">
          The message you sent
        </h2>
        <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-4 text-small leading-relaxed text-text-primary">
          {campaign.body}
        </p>
        {campaign.metaTemplateName && (
          <p className="text-xs text-text-secondary">
            Sent as your approved Meta template{" "}
            <code>{campaign.metaTemplateName}</code>.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-h3 font-semibold text-text-primary">Everybody on it</h2>

        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {campaign.recipients.map((recipient) => (
            <li
              key={recipient.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3"
            >
              <span className="text-small text-text-primary">
                {recipient.contactName?.trim() || `+${recipient.contactPhone}`}
              </span>

              <span className="text-small text-text-secondary">
                {RECIPIENT_TEXT[recipient.status] ?? recipient.status}
                {recipient.sentAt && ` · ${formatWhen(recipient.sentAt)}`}
              </span>

              {recipient.failureReason && (
                <p className="w-full text-xs text-text-secondary">
                  {recipient.failureReason}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

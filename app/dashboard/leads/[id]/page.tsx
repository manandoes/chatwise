// One lead, and the form for correcting it.
//
// The lead is looked up by id *and* by the signed-in user's business, so an id
// belonging to somebody else simply doesn't exist here (docs/Rules.md §3).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessagesSquare } from "lucide-react";

import { LeadEditor } from "@/components/dashboard/lead-editor";
import { PageHeader } from "@/components/dashboard/page-header";
import { requireUser } from "@/lib/auth";
import { readLead } from "@/lib/leads";
import { formatWhen } from "@/lib/format-when";
import { getOnboardingState } from "@/lib/onboarding";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const { business } = await getOnboardingState(user.id);

  const lead = await readLead(business.id, id);

  if (!lead) notFound();

  const who =
    lead.name?.trim() ||
    lead.conversation.contactName?.trim() ||
    `+${lead.contactPhone}`;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard/leads"
          className="inline-flex items-center gap-1.5 text-small text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="size-4" />
          All leads
        </Link>
      </div>

      <PageHeader title={who} description={`+${lead.contactPhone}`} />

      <div className="flex flex-wrap items-center gap-4">
        <Link
          href={`/dashboard/conversations/${lead.conversationId}`}
          className="inline-flex items-center gap-1.5 text-small text-primary underline underline-offset-4"
        >
          <MessagesSquare className="size-4" />
          Read the conversation this came from
        </Link>

        {lead.lastAgentUpdateAt && (
          <span className="text-small text-text-secondary">
            Your agent last updated this {formatWhen(lead.lastAgentUpdateAt)}.
          </span>
        )}
      </div>

      <LeadEditor
        leadId={lead.id}
        editedByHuman={lead.fieldsEditedByHuman}
        initial={{
          name: lead.name ?? "",
          email: lead.email ?? "",
          status: lead.status,
          score: lead.score === null ? "" : String(lead.score),
          tags: lead.tags.join(", "),
          summary: lead.summary ?? "",
          nextStep: lead.nextStep ?? "",
          notes: lead.notes ?? "",
          letTheAgentUpdateThis: lead.letTheAgentUpdateThis,
        }}
      />
    </div>
  );
}

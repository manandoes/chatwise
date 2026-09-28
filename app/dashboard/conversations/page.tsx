// Conversations — every thread the agent is handling.
//
// The page draws the first list on the server so there is never an empty screen
// waiting on a request, then hands it to the inbox component, which keeps it up
// to date while somebody has it open (docs/Phases.md, Phase 9).

import type { Metadata } from "next";
import { Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InboxList } from "@/components/dashboard/inbox-list";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { listInbox, listUsedTags } from "@/lib/conversations";
import { getOnboardingState } from "@/lib/onboarding";
import { findMembership } from "@/lib/team";
import { inboxCounts, isInboxView } from "@/lib/team-inbox";

export const metadata: Metadata = { title: "Conversations" };

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; view?: string }>;
}) {
  const { tag, view: rawView } = await searchParams;
  const user = await requireUser();
  const { business, agent } = await getOnboardingState(user.id);

  if (!agent) notFound();

  const membership = await findMembership(user.id);
  const memberId = membership?.memberId ?? null;
  const view = isInboxView(rawView) ? rawView : "all";

  const [conversations, tags, counts] = await Promise.all([
    listInbox(business.id, { tag: tag?.trim() || undefined, view, memberId }),
    listUsedTags(business.id),
    inboxCounts(business.id, memberId),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Conversations"
        description="Every WhatsApp chat your agent has handled. Open one to read it as it happens, or to answer it yourself."
        action={
          <Button asChild variant="outline">
            <Link href="/api/conversations/export">
              <Download className="size-4" />
              Export chats
            </Link>
          </Button>
        }
      />

      {/* The empty state lives inside the list rather than here, so an account
          waiting for its very first message watches for it too. */}
      <InboxList
        // Remounts (and so resets its polled state) when the tag filter
        // changes, rather than syncing state from a prop in an effect.
        key={`${tag?.trim() || "all"}|${view}`}
        initial={conversations}
        initialCounts={counts}
        view={view}
        tags={tags}
        activeTag={tag?.trim() || null}
        maskPhone={business.maskContactPhone}
      />
    </div>
  );
}

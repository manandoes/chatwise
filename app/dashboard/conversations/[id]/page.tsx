// One conversation, start to finish — and the place a person joins it.
//
// The thread is looked up by id *and* by the signed-in user's business, so an
// id belonging to somebody else simply doesn't exist here — there is no check
// to forget (docs/Rules.md §3).
//
// Everything that moves — new messages arriving, taking the thread over,
// replying by hand — is in components/dashboard/conversation-thread.tsx. This
// page's job is to fetch the first version of it and say who is who.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ConversationThread } from "@/components/dashboard/conversation-thread";
import { PageHeader } from "@/components/dashboard/page-header";
import { requireUser } from "@/lib/auth";
import { readThread } from "@/lib/conversations";
import { getOnboardingState } from "@/lib/onboarding";
import { maskPhone } from "@/lib/phone-mask";
import { listQuickReplies } from "@/lib/quick-replies";
import { listMembers } from "@/lib/team";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const { business, bot } = await getOnboardingState(user.id);

  const [conversation, quickReplies, members] = await Promise.all([
    readThread(business.id, id),
    listQuickReplies(business.id),
    listMembers(business.id),
  ]);

  if (!conversation) notFound();

  const shownPhone = business.maskContactPhone
    ? maskPhone(conversation.contactPhone)
    : `+${conversation.contactPhone}`;

  const who = conversation.contactName?.trim() || shownPhone;

  // The customer calls it by what it does, not by "the bot" (docs/Rules.md §7).
  const agentName = bot ? `Your ${bot.name}` : "Your agent";

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard/conversations"
          className="inline-flex items-center gap-1.5 text-small text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="size-4" />
          All conversations
        </Link>
      </div>

      <PageHeader
        title={who}
        description={conversation.contactName?.trim() ? shownPhone : "On WhatsApp"}
        action={
          conversation.contactId ? (
            <Link
              href={`/dashboard/contacts/${conversation.contactId}`}
              className="text-small text-primary underline underline-offset-4"
            >
              Contact details
            </Link>
          ) : undefined
        }
      />

      <ConversationThread
        conversationId={conversation.id}
        who={who}
        agentName={agentName}
        initialMessages={conversation.messages}
        initialState={conversation.state}
        initialTags={conversation.tags}
        initialNotes={conversation.notes ?? ""}
        quickReplies={quickReplies}
        members={members.map((member) => ({ id: member.id, userId: member.userId, name: member.name }))}
        currentUserId={user.id}
        summary={
          conversation.summary && conversation.summaryUpdatedAt
            ? { text: conversation.summary, at: conversation.summaryUpdatedAt }
            : null
        }
      />
    </div>
  );
}

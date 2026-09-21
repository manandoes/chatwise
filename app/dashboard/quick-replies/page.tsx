// Quick replies — saved things to drop into a conversation instead of typing
// them out again.

import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { QuickReplyManager } from "@/components/dashboard/quick-reply-manager";
import { requireUser } from "@/lib/auth";
import { getOnboardingState } from "@/lib/onboarding";
import { listQuickReplies } from "@/lib/quick-replies";

export const metadata: Metadata = { title: "Quick replies" };

export default async function QuickRepliesPage() {
  const user = await requireUser();
  const { business } = await getOnboardingState(user.id);

  const quickReplies = await listQuickReplies(business.id);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Quick replies"
        description="Saved replies you can drop straight into a conversation when you're answering by hand."
      />

      <QuickReplyManager initial={quickReplies} />
    </div>
  );
}

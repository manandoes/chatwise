import type { Metadata } from "next";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Conversations" };

const DESCRIPTION =
  "Every chat your agent is handling, as it happens.";

const WILL_DO = [
  "Watch conversations live as your agent replies",
  "Take over mid-thread — the agent pauses while you type",
  "Hand the conversation back when you're done",
  "See anything your agent escalated because it couldn't answer",
];

export default function ConversationsPage() {
  return (
    <ComingSoon
      title="Conversations"
      description={DESCRIPTION}
      icon="MessagesSquare"
      phase="Phase 9"
      willDo={WILL_DO}
    />
  );
}

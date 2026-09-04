import type { Metadata } from "next";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Knowledge base" };

const DESCRIPTION =
  "What your agent knows about your business. It answers only from here, and never invents an answer.";

const WILL_DO = [
  "Edit your hours, prices, policies and FAQs in plain English",
  "Upload your product catalogue",
  "See which answers your agent uses most",
  "Change an answer once and have every future reply use it",
];

export default function KnowledgeBasePage() {
  return (
    <ComingSoon
      title="Knowledge base"
      description={DESCRIPTION}
      icon="BookOpen"
      phase="Phase 7"
      willDo={WILL_DO}
    />
  );
}

import type { Metadata } from "next";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Leads" };

const DESCRIPTION =
  "The contacts your conversations turned into, with their status and score.";

const WILL_DO = [
  "See leads captured automatically from real conversations",
  "Change a lead's status, score and tags by hand",
  "Keep your own edits safe — the agent won't overwrite them",
  "Filter and search as the list grows",
];

export default function LeadsPage() {
  return (
    <ComingSoon
      title="Leads"
      description={DESCRIPTION}
      icon="Users"
      phase="Phase 10"
      willDo={WILL_DO}
    />
  );
}

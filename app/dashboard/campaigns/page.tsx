import type { Metadata } from "next";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Campaigns" };

const DESCRIPTION =
  "Send one message to many contacts, personalised for each of them.";

const WILL_DO = [
  "Start from a library of ready-made message templates",
  "Build a contact list, with anyone who replied STOP excluded automatically",
  "On the free plan: up to 25 recipients per send, spaced out, after a warning you acknowledge",
  "On the paid plan: large lists using Meta-approved templates",
  "Track delivery, reads and replies for each campaign",
];

export default function CampaignsPage() {
  return (
    <ComingSoon
      title="Campaigns"
      description={DESCRIPTION}
      icon="Megaphone"
      phase="Phase 12"
      willDo={WILL_DO}
    />
  );
}

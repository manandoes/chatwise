import type { Metadata } from "next";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Analytics" };

const DESCRIPTION =
  "How much your agent handled, how quickly, and what came of it.";

const WILL_DO = [
  "Messages handled and average response time",
  "Leads captured, and how many turned into sales",
  "Busiest times of day and week",
  "Your usage against your plan's limits",
];

export default function AnalyticsPage() {
  return (
    <ComingSoon
      title="Analytics"
      description={DESCRIPTION}
      icon="BarChart3"
      phase="Phase 11"
      willDo={WILL_DO}
    />
  );
}

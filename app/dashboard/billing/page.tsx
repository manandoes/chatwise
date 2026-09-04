import type { Metadata } from "next";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Billing" };

const DESCRIPTION =
  "Your plan, what you've used, and your invoices.";

const WILL_DO = [
  "See your current plan and what it includes",
  "Track usage against your plan's limits",
  "Upgrade, downgrade or cancel",
  "Download past invoices",
];

export default function BillingPage() {
  return (
    <ComingSoon
      title="Billing"
      description={DESCRIPTION}
      icon="CreditCard"
      phase="Phase 13"
      willDo={WILL_DO}
    />
  );
}

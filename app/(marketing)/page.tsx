import { AgentCatalog } from "@/components/marketing/agent-catalog";
import { ConnectionOptions } from "@/components/marketing/connection-options";
import { CtaBand } from "@/components/marketing/cta-band";
import { DashboardFeatures } from "@/components/marketing/dashboard-features";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <AgentCatalog />
      <ConnectionOptions />
      <DashboardFeatures />
      <CtaBand />
    </>
  );
}

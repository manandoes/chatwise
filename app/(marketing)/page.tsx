import type { Metadata } from "next";

import { AgentCatalog } from "@/components/marketing/agent-catalog";
import { ConnectionOptions } from "@/components/marketing/connection-options";
import { CtaBand } from "@/components/marketing/cta-band";
import { DashboardFeatures } from "@/components/marketing/dashboard-features";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";

export const metadata: Metadata = {
  title:
    "ChatWise — WhatsApp AI Agents for Your Business | Automate Conversations",
  description:
    "Set up a pre-built WhatsApp AI agent, connect your own number, and manage every conversation and lead from one dashboard. No coding required.",
  alternates: {
    canonical: "https://chatwise.automovalabs.tech",
  },
  openGraph: {
    url: "https://chatwise.automovalabs.tech",
    title: "ChatWise — WhatsApp AI Agents for Your Business",
    description:
      "Set up a pre-built WhatsApp AI agent, connect your own number, and manage every conversation and lead from one dashboard.",
    images: [
      {
        url: "https://chatwise.automovalabs.tech/api/og?title=ChatWise&description=WhatsApp+AI+agents+for+your+business",
        width: 1200,
        height: 630,
        alt: "ChatWise — WhatsApp AI Agents for Your Business",
      },
    ],
  },
  twitter: {
    title: "ChatWise — WhatsApp AI Agents for Your Business",
    description:
      "Set up a pre-built WhatsApp AI agent, connect your own number, and manage every conversation and lead from one dashboard.",
    images: [
      "https://chatwise.automovalabs.tech/api/og?title=ChatWise&description=WhatsApp+AI+agents+for+your+business",
    ],
  },
};

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

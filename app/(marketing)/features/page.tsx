import {
  BarChart3,
  BookOpen,
  Inbox,
  Megaphone,
  PlugZap,
  Users,
} from "lucide-react";
import type { Metadata } from "next";

import { AgentCatalog } from "@/components/marketing/agent-catalog";
import { CtaBand } from "@/components/marketing/cta-band";
import { FeatureDetail } from "@/components/marketing/feature-detail";

export const metadata: Metadata = {
  title: "Features",
  description:
    "A live inbox with human takeover, leads captured from real conversations, a knowledge base your agent answers from, and bulk outreach with the safety limits built in.",
};

export default function FeaturesPage() {
  return (
    <>
      <section className="mx-auto w-full max-w-content px-6 py-16 lg:py-20">
        <div className="max-w-[62ch]">
          <h1 className="text-balance text-[clamp(2rem,4vw,2.75rem)] font-bold leading-tight tracking-[-0.02em] text-text-primary">
            An agent that answers, and a place to keep an eye on it
          </h1>
          <p className="mt-5 text-pretty text-[1.0625rem] leading-relaxed text-text-secondary">
            Automation you can&rsquo;t see into is a liability. Everything your
            agent does is visible, correctable, and yours to take over the moment
            you want to.
          </p>
        </div>
      </section>

      <AgentCatalog />

      <div className="mx-auto w-full max-w-content px-6">
        <FeatureDetail
          icon={Inbox}
          name="Conversations"
          headline="Watch it work, and step in when it matters"
          body="Every chat your agent is handling appears in one live inbox. When a conversation needs a person — because the customer asked for one, or the agent hit something it couldn't answer — it surfaces here rather than quietly stalling."
          specifics={[
            "Take over mid-thread: the agent pauses, you type, you hand it back",
            "Escalations from the agent land in the same place as everything else",
            "Full history of what was said and which agent said it",
          ]}
        />

        <FeatureDetail
          icon={Users}
          name="Leads"
          headline="Your contact list, filled in by the conversations"
          body="Names, numbers and what people actually asked about get captured as chats happen, scored and tagged, so following up doesn't depend on somebody remembering to write it down."
          specifics={[
            "Built automatically by the Lead Qualifier and the background CRM agent",
            "Status, score and tags you can change by hand",
            "Anything you edit yourself is protected — the agent won't overwrite it",
          ]}
          flipped
        />

        <FeatureDetail
          icon={BookOpen}
          name="Knowledge base"
          headline="It only knows what you tell it"
          body="Your hours, prices, policies and catalogue live in one place, and that is the only thing your agent draws on. Faced with something it hasn't been told, it says so and fetches you — it does not improvise an answer about your business."
          specifics={[
            "Plain-English editing — no formats or syntax to learn",
            "Feeds the Receptionist, Sales and Personal Shopper agents",
            "Change an answer once and every future reply uses it",
          ]}
        />

        <FeatureDetail
          icon={Megaphone}
          name="Campaigns"
          headline="Reach your contacts, with the brakes built in"
          body="Send one message to many people, personalised per person, starting from a library of ready-made templates. The limits that keep your number safe are enforced by the system rather than left to your judgement in the moment."
          specifics={[
            "QR connection: 25 recipients per send, spaced out, never a single blast",
            "A warning you have to acknowledge before your first QR-connection send",
            "Anyone who replied STOP is excluded automatically, on every plan",
            "Business API: large lists, using templates Meta has approved",
            "Delivery, read and reply tracked per campaign",
          ]}
          flipped
        />

        <FeatureDetail
          icon={PlugZap}
          name="Connection health"
          headline="You always know if it's actually on"
          body="A connection that has silently dropped is worse than no automation at all, because you carry on assuming customers are being answered. Your dashboard shows the real state, in words rather than codes."
          specifics={[
            "Connected, reconnecting, or disconnected and needing you",
            "Reconnects on its own where it can",
            "On the QR connection, your session runs in its own isolated process",
          ]}
        />

        <FeatureDetail
          icon={BarChart3}
          name="Analytics"
          headline="What it handled, and what came of it"
          body="How many messages your agent dealt with, how quickly it replied, and how many enquiries turned into leads and sales."
          specifics={[
            "Messages handled and response times",
            "Leads captured, and how many converted",
            "Usage against your plan's limits",
          ]}
          flipped
        />
      </div>

      <CtaBand secondary={{ href: "/pricing", label: "See pricing" }} />
    </>
  );
}

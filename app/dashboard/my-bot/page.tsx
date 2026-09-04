// My bot — the account's single agent.
//
// Singular throughout, deliberately. There is no list, no "add another", and no
// way to end up with two (docs/PRD.md §3.1, docs/Rules.md §6). Changing which
// agent runs goes through setup again and replaces the one that's there.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BotIcon } from "@/components/onboarding/bot-icon";
import { ChangeAgentPanel } from "@/components/dashboard/change-agent-panel";
import { MyBotForm } from "@/components/dashboard/my-bot-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { requireUser } from "@/lib/auth";
import { getOnboardingState } from "@/lib/onboarding";

export const metadata: Metadata = { title: "My bot" };

export default async function MyBotPage() {
  const user = await requireUser();
  const { business, agent, bot } = await getOnboardingState(user.id);

  // The layout already sends anyone without a finished setup back to the
  // wizard, so reaching here without an agent means something is genuinely
  // wrong rather than merely incomplete.
  if (!agent || !bot) notFound();

  const savedAnswers = (agent.config ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-8">
      <PageHeader
        title="My bot"
        description="The one agent your account runs. Change what it knows or how it behaves, and it takes effect on the next message."
      />

      <div className="flex items-start gap-4 rounded-lg border border-primary/30 bg-primary/5 p-6">
        <BotIcon name={bot.icon} className="mt-0.5 size-6 shrink-0 text-primary" />

        <div className="min-w-0">
          <h2 className="text-h3 font-semibold text-text-primary">{bot.name}</h2>
          <p className="mt-1 text-pretty text-small leading-relaxed text-text-secondary">
            {bot.tagline}
          </p>
          <p className="mt-1 text-pretty text-small leading-relaxed text-text-secondary">
            <span className="text-text-primary">Kicks in on:</span>{" "}
            {bot.trigger}
          </p>
          <p className="mt-3 text-pretty text-small leading-relaxed text-text-secondary">
            The <span className="text-text-primary">CRM agent</span> also runs
            quietly alongside it on every conversation, keeping your contact
            records current.
          </p>
        </div>
      </div>

      <MyBotForm
        bot={bot}
        initial={{
          name: business.name ?? "",
          industry: business.industry ?? "",
          about: business.about ?? "",
          answers: Object.fromEntries(
            Object.entries(savedAnswers).map(([key, value]) => [
              key,
              typeof value === "string" ? value : "",
            ]),
          ),
          tone: agent.tone ?? "",
          language: agent.language ?? "",
          escalationRules: agent.escalationRules ?? "",
          escalateTo: agent.escalateTo ?? "",
        }}
      />

      <ChangeAgentPanel currentBotName={bot.name} />
    </div>
  );
}

// Knowledge base — what the agent is allowed to say.
//
// Two things live on this page, and only one of them is edited here. The
// answers below are edited here. The details collected during setup — opening
// hours and the rest — are shown for context but edited on My bot, because
// keeping one fact in two screens is how the two quietly stop matching.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import {
  KnowledgeBaseEditor,
  type KnowledgeRow,
} from "@/components/dashboard/knowledge-base-editor";
import { requireUser } from "@/lib/auth";
import { listEntries } from "@/lib/knowledge-base";
import { getOnboardingState } from "@/lib/onboarding";

export const metadata: Metadata = { title: "Knowledge base" };

export default async function KnowledgeBasePage() {
  const user = await requireUser();
  const { business, agent, bot } = await getOnboardingState(user.id);

  if (!agent || !bot) notFound();

  const entries = await listEntries(business.id);

  const rows: KnowledgeRow[] = entries.map((entry) => ({
    key: entry.id,
    question: entry.question,
    answer: entry.answer,
  }));

  const setupAnswers = (agent.config ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Knowledge base"
        description="What your agent knows about your business. It answers from here and from your setup answers — and from nothing else. If something isn't here, it says so and fetches you rather than guessing."
      />

      <section className="rounded-lg border border-border bg-surface/50 p-6">
        <h2 className="text-h3 font-semibold text-text-primary">
          From your setup
        </h2>
        <p className="mt-1 max-w-[62ch] text-pretty text-small leading-relaxed text-text-secondary">
          Your {bot.name} already knows this. Change it on{" "}
          <Link
            href="/dashboard/my-bot"
            className="text-primary underline underline-offset-4"
          >
            My bot
          </Link>
          .
        </p>

        <dl className="mt-5 space-y-4">
          {bot.questions.map((question) => {
            const value = setupAnswers[question.id];
            const text = typeof value === "string" ? value.trim() : "";

            return (
              <div key={question.id}>
                <dt className="text-small font-medium text-text-primary">
                  {question.label}
                </dt>
                <dd className="mt-1 whitespace-pre-line text-pretty text-small leading-relaxed text-text-secondary">
                  {text || "Not filled in."}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-h3 font-semibold text-text-primary">
            Your answers
          </h2>
          <p className="mt-1 max-w-[62ch] text-pretty text-small leading-relaxed text-text-secondary">
            Write out the questions customers actually ask, and exactly how you
            want them answered. Your agent stays close to your wording.
          </p>
        </div>

        <KnowledgeBaseEditor initial={rows} />
      </section>
    </div>
  );
}

// Analytics — what the agent actually handled, how fast, and what came of it.
//
// Every figure is counted from real rows (see lib/analytics.ts). Nothing here
// is a projection or a sample, and where there isn't enough to say something
// truthful the tile says so instead of showing a zero that looks like a
// finding (docs/Rules.md §4).
//
// Server-rendered with the period in the address, so a particular view can be
// bookmarked or sent to somebody. No client JavaScript on this page at all.

import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { Bar, Stat } from "@/components/dashboard/stat";
import {
  PERIODS,
  PERIOD_LABEL,
  isPeriod,
  readBusinessNumbers,
  type Period,
  type Waiting,
} from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { formatDuration } from "@/lib/format-when";
import { getOnboardingState } from "@/lib/onboarding";
import { allowedHistoryWindows } from "@/lib/usage";
import { LEAD_STATUS_OPTIONS } from "@/lib/validation/leads";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requireUser();
  const { business, bot } = await getOnboardingState(user.id);
  const { period: asked } = await searchParams;

  // How far back this account's plan lets it look (lib/plans.ts). Asking for a
  // longer period than the plan allows quietly gives the longest it does allow,
  // rather than an error — the address bar is not somewhere to argue with
  // somebody about their subscription.
  const allowed = await allowedHistoryWindows(business.id);
  const wanted: Period = isPeriod(asked) ? asked : "30d";
  const period: Period = allowed.includes(wanted)
    ? wanted
    : allowed[allowed.length - 1];

  const numbers = await readBusinessNumbers(business.id, period);

  const agentName = bot ? `Your ${bot.name}` : "Your agent";
  const window = PERIOD_LABEL[period].toLowerCase();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Analytics"
        description="How much your agent handled, how quickly, and what came of it. Every number here is counted from your real conversations."
      />

      <nav className="flex flex-wrap gap-2" aria-label="Choose a period">
        {PERIODS.filter((option) => allowed.includes(option)).map((option) => (
          <Link
            key={option}
            href={`/dashboard/analytics?period=${option}`}
            aria-current={option === period ? "page" : undefined}
            className={[
              "rounded-full border px-3 py-1 text-small transition-colors",
              option === period
                ? "border-primary/40 bg-primary/10 text-text-primary"
                : "border-border text-text-secondary hover:bg-surface-elevated",
            ].join(" ")}
          >
            {PERIOD_LABEL[option]}
          </Link>
        ))}
      </nav>

      {allowed.length < PERIODS.length && (
        <p className="text-small text-text-secondary">
          Your plan keeps {PERIOD_LABEL[allowed[allowed.length - 1]].toLowerCase()}{" "}
          of history.{" "}
          <Link
            href="/dashboard/billing"
            className="text-primary underline underline-offset-4"
          >
            See plans
          </Link>
          .
        </p>
      )}

      {numbers.messages.total === 0 ? (
        <div className="rounded-lg border border-border bg-surface/50 p-8">
          <h2 className="text-h3 font-semibold text-text-primary">
            Nothing to measure yet
          </h2>
          <p className="mt-2 max-w-[62ch] text-pretty text-small leading-relaxed text-text-secondary">
            {numbers.conversations.total === 0
              ? "As soon as people start messaging your WhatsApp number, this page fills in on its own."
              : `Nothing was said in the ${window}. Try a longer period.`}
          </p>
          <Link
            href="/dashboard/connect-whatsapp"
            className="mt-4 inline-block text-small text-primary underline underline-offset-4"
          >
            Check your WhatsApp connection
          </Link>
        </div>
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="text-h3 font-semibold text-text-primary">
              How much came through
            </h2>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Messages"
                value={String(numbers.messages.total)}
                hint={`${numbers.messages.fromCustomers} in, ${numbers.messages.sent} out, ${window}`}
              />
              <Stat
                label="Conversations"
                value={String(numbers.conversations.active)}
                hint={`Had something said in them ${window === "all time" ? "ever" : `in the ${window}`}`}
              />
              <Stat
                label="People in total"
                value={String(numbers.conversations.total)}
                hint="Everyone who has ever messaged you"
              />
              <Stat
                label="Waiting for you"
                value={String(numbers.conversations.waitingForYou)}
                hint="Right now — your agent has stopped replying in these"
              />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-h3 font-semibold text-text-primary">
              Who did the replying
            </h2>

            <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
              <Bar
                label={agentName}
                value={numbers.repliedBy.agent}
                total={numbers.messages.sent}
              />
              <Bar
                label="You, by hand"
                value={numbers.repliedBy.you}
                total={numbers.messages.sent}
              />
              <Bar
                label="ChatWise"
                value={numbers.repliedBy.chatwise}
                total={numbers.messages.sent}
                hint="Times we had to say your agent couldn't answer — usually a problem at our end."
              />
              {numbers.repliedBy.campaigns > 0 && (
                <Bar
                  label="Campaigns"
                  value={numbers.repliedBy.campaigns}
                  total={numbers.messages.sent}
                  hint="Bulk messages you sent out. Counted here because they went out, but they aren't replies to anybody."
                />
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-h3 font-semibold text-text-primary">
              How long people waited
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <WaitStat label={agentName} waiting={numbers.answerTime.agent} />
              <WaitStat label="You" waiting={numbers.answerTime.you} />
            </div>

            <p className="max-w-[70ch] text-pretty text-xs leading-relaxed text-text-secondary">
              The middle wait rather than the average one: a single reply
              written the next morning would drag an average into telling you
              nothing. Measured from the first message somebody sent until they
              got an answer.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-h3 font-semibold text-text-primary">
              What came of it
            </h2>

            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label="New leads"
                value={String(numbers.leads.captured)}
                hint={`First seen ${window === "all time" ? "ever" : `in the ${window}`}`}
              />
              <Stat
                label="Customers"
                value={String(numbers.leads.customers)}
                hint="Leads you or your agent marked as having bought"
              />
              <Stat
                label="Turned into customers"
                value={
                  numbers.leads.conversionRate === null
                    ? "—"
                    : `${Math.round(numbers.leads.conversionRate * 100)}%`
                }
                hint={
                  numbers.leads.conversionRate === null
                    ? "No leads yet"
                    : `${numbers.leads.customers} of ${numbers.leads.total} leads`
                }
              />
            </div>

            {numbers.leads.total > 0 && (
              <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
                {LEAD_STATUS_OPTIONS.map((option) => (
                  <Bar
                    key={option.value}
                    label={option.label}
                    value={numbers.leads.byStatus[option.value] ?? 0}
                    total={numbers.leads.total}
                  />
                ))}

                <p className="text-pretty text-xs leading-relaxed text-text-secondary">
                  Every lead you have, not only the ones from this period —
                  somebody who first wrote to you months ago can still buy
                  today.{" "}
                  <Link
                    href="/dashboard/leads"
                    className="text-primary underline underline-offset-4"
                  >
                    Manage them on Leads
                  </Link>
                  .
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** An answer time, or an honest reason there isn't one. */
function WaitStat({ label, waiting }: { label: string; waiting: Waiting | null }) {
  if (!waiting) {
    return (
      <Stat
        label={label}
        value="—"
        hint="Hasn't answered anybody in this period"
      />
    );
  }

  return (
    <Stat
      label={label}
      value={formatDuration(waiting.median)}
      hint={
        waiting.count < 5
          ? `Based on only ${waiting.count} ${waiting.count === 1 ? "reply" : "replies"} — treat it lightly`
          : `Across ${waiting.count} replies`
      }
    />
  );
}

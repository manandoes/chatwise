// The dashboard overview — the numbers at a glance (docs/PRD.md §6).
//
// Phase 3 put the setup answers here to prove the wizard had saved them, and
// hardcoded "Not connected yet" beside them because at that point nothing could
// be connected. Phase 11 replaces both: the real figures from lib/analytics.ts,
// and the connection's real status. A dashboard that tells somebody they are
// disconnected while their agent is answering customers is worse than one with
// no status on it at all (docs/Rules.md §4).

import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { Stat } from "@/components/dashboard/stat";
import { BotIcon } from "@/components/onboarding/bot-icon";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { readBusinessNumbers } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { getOnboardingState } from "@/lib/onboarding";
import { LANGUAGE_OPTIONS, TONE_OPTIONS } from "@/lib/validation/onboarding";

export const metadata: Metadata = { title: "Overview" };

/** Plain words for a connection's state, never a code (docs/Rules.md §7). */
const CONNECTION_TEXT: Record<string, { label: string; dot: string }> = {
  CONNECTED: { label: "Connected", dot: "bg-primary shadow-glow" },
  CONNECTING: { label: "Waiting for you to scan", dot: "bg-warning" },
  RECONNECTING: { label: "Reconnecting…", dot: "bg-warning" },
  NOT_CONNECTED: { label: "Not connected yet", dot: "bg-warning" },
  DISCONNECTED: { label: "Disconnected", dot: "bg-error" },
  ERROR: { label: "Needs attention", dot: "bg-error" },
};

export default async function DashboardPage() {
  const user = await requireUser();
  const { business, agent, connection, bot } = await getOnboardingState(user.id);

  const numbers = await readBusinessNumbers(business.id, "30d");

  const firstName = user.name?.trim().split(/\s+/)[0];
  const toneLabel = TONE_OPTIONS.find((t) => t.value === agent?.tone)?.label;
  const languageLabel = LANGUAGE_OPTIONS.find(
    (l) => l.value === agent?.language,
  )?.label;

  const isLive = connection?.status === "CONNECTED";
  const connectionState =
    CONNECTION_TEXT[connection?.status ?? "NOT_CONNECTED"] ??
    CONNECTION_TEXT.NOT_CONNECTED;

  return (
    <div className="space-y-8">
      <PageHeader
        title={firstName ? `Welcome, ${firstName}` : "Welcome"}
        description={
          isLive
            ? `${bot?.name ?? "Your agent"} is answering on your WhatsApp number.`
            : business.name
              ? `${business.name} is set up. Connecting your WhatsApp number is the next step.`
              : "Your account is set up."
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Messages"
          value={String(numbers.messages.total)}
          hint="In and out, last 30 days"
        />
        <Stat
          label="Conversations"
          value={String(numbers.conversations.active)}
          hint="With something said in them in the last 30 days"
        />
        <Stat
          label="Leads"
          value={String(numbers.leads.total)}
          hint={
            numbers.leads.captured > 0
              ? `${numbers.leads.captured} new in the last 30 days`
              : "Captured from your conversations"
          }
        />
        <Stat
          label="Waiting for you"
          value={String(numbers.conversations.waitingForYou)}
          hint={
            numbers.conversations.waitingForYou > 0
              ? "Your agent has stopped replying in these"
              : "Nothing needs you right now"
          }
        />
      </div>

      {numbers.conversations.waitingForYou > 0 && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-small text-text-primary">
          {numbers.conversations.waitingForYou === 1
            ? "One conversation is waiting for you."
            : `${numbers.conversations.waitingForYou} conversations are waiting for you.`}{" "}
          <Link
            href="/dashboard/conversations"
            className="text-primary underline underline-offset-4"
          >
            Open your inbox
          </Link>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-h3 flex items-center gap-2.5">
              {bot && <BotIcon name={bot.icon} className="size-5 text-primary" />}
              {bot?.name ?? "Your agent"}
            </CardTitle>
            <CardDescription>{bot?.tagline}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-3 text-small">
            <Detail label="Comes across as" value={toneLabel} />
            <Detail label="Replies in" value={languageLabel} />
            <Detail
              label="Fetches a person when"
              value={agent?.escalationRules}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-h3">WhatsApp connection</CardTitle>
            <CardDescription>
              {connection?.type === "QR"
                ? "Connected by scanning a QR code. No per-message cost."
                : "Official WhatsApp Business API. Meta charges per conversation."}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <p className="flex items-center gap-2 text-small text-text-primary">
              <span
                aria-hidden
                className={`size-2 rounded-full ${connectionState.dot}`}
              />
              {connectionState.label}
              {connection?.phoneNumber && (
                <span className="text-text-secondary">
                  · +{connection.phoneNumber}
                </span>
              )}
            </p>

            <p className="mt-3 text-pretty text-small leading-relaxed text-text-secondary">
              {isLive ? (
                <>
                  Everything arriving on this number goes to your agent, and
                  shows up in{" "}
                  <Link
                    href="/dashboard/conversations"
                    className="text-primary hover:underline"
                  >
                    Conversations
                  </Link>
                  .
                </>
              ) : (
                <>
                  Your agent can&rsquo;t answer anyone until your number is
                  connected.{" "}
                  <Link
                    href="/dashboard/connect-whatsapp"
                    className="text-primary hover:underline"
                  >
                    Connect it now
                  </Link>
                  .
                </>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="text-small text-text-secondary">
        See the full picture on{" "}
        <Link
          href="/dashboard/analytics"
          className="text-primary hover:underline"
        >
          Analytics
        </Link>
        , or change what your agent knows on{" "}
        <Link href="/dashboard/my-bot" className="text-primary hover:underline">
          My bot
        </Link>
        .
      </p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;

  return (
    <div>
      <p className="text-label uppercase text-text-secondary">{label}</p>
      <p className="mt-1 text-pretty text-text-primary">{value}</p>
    </div>
  );
}

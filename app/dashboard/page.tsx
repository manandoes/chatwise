// The dashboard overview.
//
// Phase 3 only needs this to prove the wizard's answers were saved. The real
// overview — active conversations, messages this month, leads captured — comes
// with the later phases, and the full My Bot page is Phase 4.

import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { BotIcon } from "@/components/onboarding/bot-icon";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getOnboardingState } from "@/lib/onboarding";
import { LANGUAGE_OPTIONS, TONE_OPTIONS } from "@/lib/validation/onboarding";

export const metadata: Metadata = { title: "Overview" };

export default async function DashboardPage() {
  const user = await requireUser();
  const { business, agent, connection, bot } = await getOnboardingState(user.id);

  const firstName = user.name?.trim().split(/\s+/)[0];
  const toneLabel = TONE_OPTIONS.find((t) => t.value === agent?.tone)?.label;
  const languageLabel = LANGUAGE_OPTIONS.find(
    (l) => l.value === agent?.language,
  )?.label;

  return (
    <div className="space-y-8">
      <PageHeader
        title={firstName ? `Welcome, ${firstName}` : "Welcome"}
        description={
          business.name
            ? `${business.name} is set up. Connecting your WhatsApp number is the next step.`
            : "Your account is set up."
        }
      />

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
                ? "Free — you'll scan a QR code with your phone."
                : "Official WhatsApp Business API."}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <p className="flex items-center gap-2 text-small text-text-secondary">
              <span
                aria-hidden
                className="size-2 rounded-full bg-warning"
              />
              Not connected yet
            </p>
            <p className="mt-3 text-pretty text-small leading-relaxed text-text-secondary">
              Your agent can&rsquo;t answer anyone until your number is connected.
              That screen is built next.
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="text-small text-text-secondary">
        Change what your agent knows on{" "}
        <Link href="/dashboard/my-bot" className="text-primary hover:underline">
          My bot
        </Link>
        , or review your{" "}
        <Link href="/dashboard/settings" className="text-primary hover:underline">
          account details
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

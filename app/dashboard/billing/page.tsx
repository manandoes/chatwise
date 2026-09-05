// Billing: what you're on, what you've used, and what you've been charged.
//
// Rendered on the server, so nothing about a subscription — not a Razorpay id,
// not a customer id — is sent to the browser (docs/Rules.md §3). The only
// interactive parts are the plan buttons and the cancel button, which are their
// own small client components.

import type { Metadata } from "next";
import { AlertCircle, ExternalLink, Info } from "lucide-react";

import { CancelSubscriptionButton } from "@/components/dashboard/cancel-subscription-button";
import { PageHeader } from "@/components/dashboard/page-header";
import { PlanPicker } from "@/components/dashboard/plan-picker";
import { Stat, Bar } from "@/components/dashboard/stat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format-when";
import { getOnboardingState } from "@/lib/onboarding";
import {
  PLANS,
  formatLimit,
  formatRupees,
  invoiceStatusLabel,
  subscriptionStatusLabel,
  type PlanIdValue,
} from "@/lib/plans";
import { razorpayPlanId } from "@/lib/razorpay";
import { readAccountPlan, readInvoices } from "@/lib/subscription";
import { readUsage } from "@/lib/usage";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const user = await requireUser();
  const { business } = await getOnboardingState(user.id);

  const [account, usage, invoices] = await Promise.all([
    readAccountPlan(business.id),
    readUsage(business.id),
    readInvoices(business.id),
  ]);

  // A plan with no Razorpay plan id set up cannot be bought, however much
  // somebody wants to. Better to say so than to show a button that fails.
  const unavailablePlanIds = PLANS.filter(
    (plan) =>
      plan.monthlyPriceInRupees > 0 && !razorpayPlanId(plan.razorpayPlanIdEnvVar),
  ).map((plan) => plan.id as PlanIdValue);

  const renewsOn = account.periodEnd ? formatDate(account.periodEnd) : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Billing"
        description="Your plan, what you've used this month, and your invoices."
      />

      {!account.billingIsLive && (
        <Alert>
          <Info />
          <AlertTitle>Payments aren&rsquo;t switched on yet</AlertTitle>
          <AlertDescription>
            Nothing is limited while that is the case — your agent, your
            campaigns and your knowledge base all work without restriction. The
            plans below are what will apply once payments go live.
          </AlertDescription>
        </Alert>
      )}

      {account.status === "PAST_DUE" && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Your last payment didn&rsquo;t go through</AlertTitle>
          <AlertDescription>
            Nothing has been switched off. Razorpay will try the card again — if
            it keeps failing, update your card details from the payment link in
            their email, or start the plan again below.
          </AlertDescription>
        </Alert>
      )}

      {/* ─── Where the account stands ─────────────────────────────────── */}
      <section className="space-y-4">
        <div className="rounded-lg border border-border bg-surface p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <div>
              <p className="text-label uppercase text-text-secondary">
                Current plan
              </p>
              <p className="mt-1 text-h2 font-semibold text-text-primary">
                {account.plan.name}
              </p>
            </div>

            <div className="text-right">
              <p className="text-small text-text-secondary">
                {subscriptionStatusLabel(account.status)}
              </p>
              <p className="mt-1 text-h3 font-semibold text-text-primary">
                {account.plan.monthlyPriceInRupees === 0
                  ? formatRupees(0)
                  : `${formatRupees(account.plan.monthlyPriceInRupees)} a month`}
              </p>
            </div>
          </div>

          <p className="mt-4 max-w-[68ch] text-pretty text-small leading-relaxed text-text-secondary">
            {account.plan.summary}
          </p>

          <div className="mt-5 space-y-1.5 text-small text-text-secondary">
            {renewsOn && !account.cancelAtPeriodEnd && (
              <p>Renews on {renewsOn}.</p>
            )}

            {account.cancelAtPeriodEnd && (
              <p className="text-warning">
                Cancelled. You keep everything until{" "}
                {renewsOn ?? "the end of the period you've paid for"}, then the
                account moves to Free.
              </p>
            )}

            {account.pendingPlan &&
              !account.cancelAtPeriodEnd &&
              account.pendingPlan.id !== account.plan.id && (
                <p>
                  Moving to {account.pendingPlan.name}
                  {renewsOn ? ` on ${renewsOn}` : " at the end of this period"}.
                </p>
              )}

            <p>{account.plan.support}.</p>
          </div>

          {account.hasRazorpaySubscription && !account.cancelAtPeriodEnd && (
            <div className="mt-5 border-t border-border pt-5">
              <CancelSubscriptionButton endsOn={renewsOn} />
            </div>
          )}
        </div>
      </section>

      {/* ─── What has been used ───────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-h3 font-semibold text-text-primary">
            What you&rsquo;ve used
          </h2>
          <p className="mt-1 text-small text-text-secondary">
            {usage.isCalendarMonth
              ? `Since ${formatDate(usage.periodStart)}, counted from your real conversations.`
              : `This billing period, from ${formatDate(usage.periodStart)}.`}
            {!usage.limitsApply &&
              " Nothing is being limited while payments are off."}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Messages sent"
            value={usage.messages.used.toLocaleString("en-IN")}
            hint={`of ${formatLimit(usage.messages.limit)} on ${usage.plan.name}`}
          />
          <Stat
            label="Campaigns"
            value={usage.campaigns.used.toLocaleString("en-IN")}
            hint={`of ${formatLimit(usage.campaigns.limit)} this month`}
          />
          <Stat
            label="Saved templates"
            value={usage.templates.used.toLocaleString("en-IN")}
            hint={`of ${formatLimit(usage.templates.limit)}`}
          />
          <Stat
            label="Knowledge answers"
            value={usage.knowledgeEntries.used.toLocaleString("en-IN")}
            hint={`of ${formatLimit(usage.knowledgeEntries.limit)}`}
          />
        </div>

        {usage.messages.limit !== null && (
          <div className="rounded-lg border border-border bg-surface p-5">
            <Bar
              label="Messages sent this period"
              value={Math.min(usage.messages.used, usage.messages.limit)}
              total={usage.messages.limit}
              hint={
                usage.messages.isAtLimit
                  ? "You've used everything included this period. Your agent will tell people you'll follow up rather than staying silent."
                  : `${formatLimit(usage.messages.remaining)} left.`
              }
            />
          </div>
        )}
      </section>

      {/* ─── The plans ────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-h3 font-semibold text-text-primary">Plans</h2>
          <p className="mt-1 max-w-[68ch] text-pretty text-small leading-relaxed text-text-secondary">
            Every plan runs one agent on one WhatsApp number — that never
            changes. What changes is how much you can send, how far back your
            history goes, and whether you can use the official WhatsApp Business
            API.
          </p>
        </div>

        <PlanPicker
          plans={PLANS}
          currentPlanId={account.plan.id}
          canChange={account.billingIsLive}
          unavailablePlanIds={unavailablePlanIds}
          hasSubscription={account.hasRazorpaySubscription}
        />
      </section>

      {/* ─── Invoices ─────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-h3 font-semibold text-text-primary">Invoices</h2>
          <p className="mt-1 text-small text-text-secondary">
            Read straight from Razorpay each time, so what you see here is what
            they have.
          </p>
        </div>

        {invoices.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface/50 p-5 text-small text-text-secondary">
            Nothing yet. Invoices appear here once you&rsquo;ve been charged.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {invoices.map((invoice) => (
              <li
                key={invoice.id}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4"
              >
                <div>
                  <p className="font-medium text-text-primary">
                    {formatRupees(invoice.amountInRupees)}
                  </p>
                  <p className="text-small text-text-secondary">
                    {invoice.issuedAt ? formatDate(invoice.issuedAt) : "—"}
                    {invoice.status ? ` · ${invoiceStatusLabel(invoice.status)}` : ""}
                  </p>
                </div>

                {invoice.url && (
                  <a
                    href={invoice.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 text-small text-primary hover:underline"
                  >
                    View
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

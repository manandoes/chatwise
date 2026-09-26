// Integrations — the outside services an account is connected to, and the
// automated WhatsApp messages they trigger. Owner only.
//
// Also where anything that went wrong in the background shows up: jobs that
// gave up after retrying, and privacy requests from Shopify (docs/Rules.md §4
// — the owner, not just a developer, must be able to see failures).

import type { Metadata } from "next";

import { AutomationsEditor } from "@/components/dashboard/automations-editor";
import { EmptyState, Pill, Section } from "@/components/dashboard/form-bits";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaymentAccountsPanel } from "@/components/dashboard/payment-accounts-panel";
import { ShopifyPanel } from "@/components/dashboard/shopify-panel";
import { listAutomations } from "@/lib/automations";
import { db } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/features";
import { formatWhen } from "@/lib/format-when";
import { describeJobType, listFailedJobs } from "@/lib/jobs";
import { requirePageContext } from "@/lib/page-context";
import { isShopifyConfigured } from "@/integrations/shopify/client";
import { listPaymentAccounts } from "@/integrations/payments/links";

export const metadata: Metadata = { title: "Integrations" };

/** What the ?shopify= result from the connect flow means, in words. */
const SHOPIFY_RESULTS: Record<string, { tone: "good" | "bad"; text: string }> = {
  connected: {
    tone: "good",
    text: "Your store is connected. We're importing your customers, orders and products now.",
  },
  off: { tone: "bad", text: "Shopify isn't switched on for this ChatWise installation yet." },
  "bad-domain": {
    tone: "bad",
    text: "That doesn't look like a Shopify store. Use the name ending in .myshopify.com.",
  },
  "bad-signature": {
    tone: "bad",
    text: "We couldn't confirm that reply came from Shopify, so nothing was connected. Please try again.",
  },
  expired: {
    tone: "bad",
    text: "That connection attempt expired or was started in another browser. Please try again.",
  },
  "owner-only": { tone: "bad", text: "Only the account owner can connect a store." },
  "owned-elsewhere": {
    tone: "bad",
    text: "That store is already connected to a different ChatWise account.",
  },
  "other-store": { tone: "bad", text: "Another store is already connected. Disconnect it first." },
  error: { tone: "bad", text: "Something went wrong connecting to Shopify. Please try again." },
};

const COMPLIANCE_WORDS: Record<string, string> = {
  "customers/data_request": "A customer asked for their data",
  "customers/redact": "A customer asked to be erased",
  "shop/redact": "Shopify asked us to erase your store's data",
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { business, isOwner } = await requirePageContext();

  if (!isOwner) {
    return (
      <div className="space-y-8">
        <PageHeader title="Integrations" />
        <EmptyState title="Only the account owner can see this">
          Integrations connect outside services to the account, so only an owner can change them.
        </EmptyState>
      </div>
    );
  }

  const params = await searchParams;
  const shopifyResult =
    typeof params.shopify === "string" ? SHOPIFY_RESULTS[params.shopify] : undefined;
  const prefillShop = typeof params.shop === "string" ? params.shop : "";

  const [shop, automations, templates, failedJobs, compliance, connection, paymentAccounts] = await Promise.all([
    db.shop.findUnique({
      where: { businessId: business.id },
      select: {
        shopDomain: true,
        active: true,
        installedAt: true,
        webhooksAt: true,
        webhookError: true,
        backfillStatus: true,
        backfilledAt: true,
      },
    }),
    listAutomations(business.id),
    db.messageTemplate.findMany({
      where: { businessId: business.id, approval: "APPROVED", metaName: { not: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listFailedJobs(business.id),
    db.complianceRequest.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, topic: true, result: true, completedAt: true, createdAt: true },
    }),
    db.whatsAppConnection.findUnique({
      where: { businessId: business.id },
      select: { type: true },
    }),
    listPaymentAccounts(business.id),
  ]);

  return (
    <div className="space-y-12">
      <PageHeader
        title="Integrations"
        description="Connect the services you already use, and choose which WhatsApp messages they send for you."
      />

      <Section
        title="Shopify"
        description="Brings your store's customers, orders and products into ChatWise, and lets you send order updates and abandoned-cart reminders on WhatsApp."
      >
        <ShopifyPanel
          available={isFeatureEnabled("shopify") && isShopifyConfigured()}
          result={shopifyResult ?? null}
          prefillShop={prefillShop}
          shop={
            shop
              ? {
                  shopDomain: shop.shopDomain,
                  active: shop.active,
                  connectedWhen: formatWhen(shop.installedAt),
                  webhooksReady: Boolean(shop.webhooksAt),
                  webhookError: shop.webhookError,
                  backfillStatus: shop.backfillStatus,
                  backfilledWhen: shop.backfilledAt ? formatWhen(shop.backfilledAt) : null,
                }
              : null
          }
        />
      </Section>

      <div id="payments">
        <Section
          title="Payment links"
          description="Connect your own Razorpay or Stripe account to send customers payment links on WhatsApp. The money goes straight to your account; ChatWise never sees card details."
        >
          <PaymentAccountsPanel available={isFeatureEnabled("paymentLinks")} accounts={paymentAccounts} />
        </Section>
      </div>

      <Section
        title="Automated messages"
        description="Each one is off until you switch it on. Nobody who has opted out ever receives one, and every message sent appears in that customer's conversation."
      >
        <AutomationsEditor
          automations={automations}
          templates={templates}
          isBusinessApi={connection?.type === "API"}
        />
      </Section>

      <Section
        title="Problems"
        description="Background work that failed even after retrying. An empty list means everything is running smoothly."
      >
        {failedJobs.length === 0 ? (
          <p className="text-small text-text-secondary">No problems right now.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {failedJobs.map((job) => (
              <li key={job.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-text-primary">{describeJobType(job.jobType)}</p>
                  <span className="text-small text-text-secondary">{formatWhen(job.updatedAt)}</span>
                </div>
                {job.lastError && (
                  <p className="mt-1 text-small text-text-secondary">{job.lastError}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {compliance.length > 0 && (
        <Section
          title="Privacy requests from Shopify"
          description="Shopify passes on requests from your customers to see or erase their data. We handle them automatically; for a data request, send what we hold on to the customer."
        >
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {compliance.map((request) => (
              <li key={request.id} className="space-y-2 px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-text-primary">
                    {COMPLIANCE_WORDS[request.topic] ?? request.topic}
                  </p>
                  <div className="flex items-center gap-2">
                    <Pill tone={request.completedAt ? "good" : "warn"}>
                      {request.completedAt ? "Handled" : "In progress"}
                    </Pill>
                    <span className="text-small text-text-secondary">
                      {formatWhen(request.createdAt)}
                    </span>
                  </div>
                </div>
                {request.topic === "customers/data_request" && request.result && (
                  <details className="text-small text-text-secondary">
                    <summary className="cursor-pointer text-primary">
                      What we hold on this customer
                    </summary>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-surface-elevated p-3 text-xs">
                      {JSON.stringify(request.result, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

"use client";

// Connecting the business's own Razorpay and/or Stripe account for payment
// links, with the webhook set-up spelled out step by step — without the
// webhook, links can be sent but ChatWise never learns they were paid.

import { Check, Copy, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorNote, Pill } from "@/components/dashboard/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi } from "@/lib/client-api";

type Provider = "RAZORPAY" | "STRIPE";

type Account = {
  provider: Provider;
  keyId: string | null;
  currency: string;
  hasWebhookSecret: boolean;
  webhookUrl: string;
};

const GUIDE: Record<Provider, { name: string; keys: string; webhook: string; events: string[] }> = {
  RAZORPAY: {
    name: "Razorpay",
    keys: "Razorpay Dashboard → Account & Settings → API Keys.",
    webhook:
      "Razorpay Dashboard → Account & Settings → Webhooks → Add new webhook. Paste the address below, choose a secret of your own, and tick these events:",
    events: ["payment_link.paid", "payment_link.expired", "payment_link.cancelled", "payment.failed", "refund.processed"],
  },
  STRIPE: {
    name: "Stripe",
    keys: "Stripe Dashboard → Developers → API keys → Secret key.",
    webhook:
      "Stripe Dashboard → Developers → Webhooks → Add endpoint. Paste the address below, pick these events, then copy the endpoint's signing secret (whsec_…):",
    events: [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
      "payment_intent.payment_failed",
      "charge.refunded",
    ],
  },
};

export function PaymentAccountsPanel({ available, accounts }: { available: boolean; accounts: Account[] }) {
  if (!available) {
    return (
      <p className="text-small text-text-secondary">
        Payment links aren&apos;t switched on for this ChatWise installation yet.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {(["RAZORPAY", "STRIPE"] as const).map((provider) => (
        <ProviderCard
          key={provider}
          provider={provider}
          account={accounts.find((account) => account.provider === provider) ?? null}
        />
      ))}
    </div>
  );
}

function ProviderCard({ provider, account }: { provider: Provider; account: Account | null }) {
  const router = useRouter();
  const guide = GUIDE[provider];
  const [keyId, setKeyId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [currency, setCurrency] = useState(provider === "RAZORPAY" ? "INR" : "USD");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function run(method: string, body?: unknown, url = "/api/payments/accounts") {
    setBusy(true);
    setError(null);
    setFields({});

    const result = await callApi(url, { method, body });

    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      setFields(result.fields);
      return;
    }

    setSecretKey("");
    setWebhookSecret("");
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-text-primary">{guide.name}</h3>
        {account ? (
          <Pill tone={account.hasWebhookSecret ? "good" : "warn"}>
            {account.hasWebhookSecret ? "Connected" : "Webhook needed"}
          </Pill>
        ) : (
          <Pill>Not connected</Pill>
        )}
      </div>

      <ErrorNote message={error} />

      {!account ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run("POST", { provider, keyId, secretKey, currency });
          }}
        >
          <p className="text-small text-text-secondary">Find your keys in {guide.keys}</p>
          {provider === "RAZORPAY" && (
            <FieldBox id={`${provider}-key-id`} label="Key ID" error={fields.keyId}>
              <Input id={`${provider}-key-id`} value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="rzp_live_…" required autoComplete="off" />
            </FieldBox>
          )}
          <FieldBox id={`${provider}-secret`} label={provider === "RAZORPAY" ? "Key Secret" : "Secret key"} error={fields.secretKey}>
            <Input id={`${provider}-secret`} type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} required autoComplete="off" />
          </FieldBox>
          <FieldBox id={`${provider}-currency`} label="Currency you charge in" error={fields.currency}>
            <Input id={`${provider}-currency`} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} className="w-28" />
          </FieldBox>
          <Button type="submit" disabled={busy}>
            {busy && <LoaderCircle className="animate-spin" />}
            Check and connect
          </Button>
          <p className="text-xs text-text-secondary">
            We check the keys with {guide.name} before saving them, and store them encrypted. They&apos;re never shown again.
          </p>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-small text-text-secondary">
            {account.keyId ? `${account.keyId} · ` : ""}Charging in {account.currency}.
          </p>

          <div className="space-y-2 text-small text-text-secondary">
            <p>{guide.webhook}</p>
            <ul className="list-inside list-disc font-mono text-xs">
              {guide.events.map((event) => (
                <li key={event}>{event}</li>
              ))}
            </ul>
            <CopyField value={account.webhookUrl} />
          </div>

          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void run("PATCH", { provider, webhookSecret });
            }}
          >
            <Label htmlFor={`${provider}-webhook-secret`}>
              {account.hasWebhookSecret ? "Replace the webhook secret" : "Webhook secret"}
            </Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id={`${provider}-webhook-secret`}
                type="password"
                className="min-w-48 flex-1"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                autoComplete="off"
                required
              />
              <Button type="submit" variant="outline" disabled={busy}>
                Save
              </Button>
            </div>
            {fields.webhookSecret && <p className="text-xs text-error">{fields.webhookSecret}</p>}
          </form>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Disconnect ${guide.name}? Links already sent can still be paid, but ChatWise won't hear about them.`)) {
                void run("DELETE", undefined, `/api/payments/accounts?provider=${provider}`);
              }
            }}
          >
            Disconnect
          </Button>
        </div>
      )}
    </div>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md bg-surface-elevated px-3 py-2 text-xs">{value}</code>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label="Copy the webhook address"
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => {});
          setCopied(true);
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

function FieldBox({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}

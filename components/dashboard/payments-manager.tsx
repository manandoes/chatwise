"use client";

// The Payments screen: a form to send a new payment link, and the list of
// links already sent with where each one got to.

import { Check, Copy, LoaderCircle, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorNote, NativeSelect, Pill } from "@/components/dashboard/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi } from "@/lib/client-api";

type Account = { provider: "RAZORPAY" | "STRIPE"; label: string; currency: string };

type PaymentRow = {
  id: string;
  provider: string;
  amount: string;
  refunded: string | null;
  status: string;
  description: string;
  reference: string | null;
  linkUrl: string | null;
  receiptPath: string;
  who: string;
  when: string;
};

const STATUS: Record<string, { label: string; tone: "neutral" | "good" | "warn" | "bad" | "primary" }> = {
  CREATED: { label: "Waiting for payment", tone: "primary" },
  PAID: { label: "Paid", tone: "good" },
  FAILED: { label: "Payment failed", tone: "bad" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
  PARTIALLY_REFUNDED: { label: "Partly refunded", tone: "warn" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export function PaymentsManager({ accounts, payments }: { accounts: Account[]; payments: PaymentRow[] }) {
  const router = useRouter();
  const [provider, setProvider] = useState(accounts[0].provider);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [sentLink, setSentLink] = useState<string | null>(null);

  const currency = accounts.find((account) => account.provider === provider)?.currency ?? "INR";

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    setSentLink(null);

    const result = await callApi<{ linkUrl: string }>("/api/payments", {
      body: { provider, phone, name, amount, description, reference },
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      setFields(result.fields);
      return;
    }

    setSentLink(result.data.linkUrl);
    setPhone("");
    setName("");
    setAmount("");
    setDescription("");
    setReference("");
    router.refresh();
  }

  return (
    <div className="space-y-10">
      <form onSubmit={send} className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-h3 font-semibold text-text-primary">Send a payment link</h2>
        <ErrorNote message={error} />

        {sentLink && (
          <p className="flex flex-wrap items-center gap-2 text-small text-success">
            <Check className="size-4" /> Sent on WhatsApp. The link is also{" "}
            <CopyLink url={sentLink} label="here to copy" />.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="pay-phone" label="Their WhatsApp number" error={fields.phone}>
            <Input id="pay-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" required />
          </Field>
          <Field id="pay-name" label="Their name (optional)">
            <Input id="pay-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id="pay-amount" label={`Amount (${currency})`} error={fields.amount}>
            <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1499" required />
          </Field>
          <Field id="pay-description" label="What it's for" error={fields.description}>
            <Input id="pay-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Consultation, 12 March" required />
          </Field>
          <Field id="pay-reference" label="Invoice or reference (optional)">
            <Input id="pay-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          {accounts.length > 1 && (
            <Field id="pay-provider" label="Take payment with" error={fields.provider}>
              <NativeSelect id="pay-provider" value={provider} onChange={(e) => setProvider(e.target.value as Account["provider"])}>
                {accounts.map((account) => (
                  <option key={account.provider} value={account.provider}>
                    {account.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>

        <Button type="submit" disabled={busy}>
          {busy && <LoaderCircle className="animate-spin" />}
          Send link
        </Button>
      </form>

      <section className="space-y-3">
        <h2 className="text-h3 font-semibold text-text-primary">Sent links</h2>
        {payments.length === 0 ? (
          <p className="text-small text-text-secondary">No payment links yet.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {payments.map((payment) => (
              <PaymentItem key={payment.id} payment={payment} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PaymentItem({ payment }: { payment: PaymentRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const status = STATUS[payment.status] ?? { label: payment.status, tone: "neutral" as const };
  const canResend = ["CREATED", "FAILED", "EXPIRED", "CANCELLED"].includes(payment.status);

  async function resend() {
    setBusy(true);
    setMessage(null);

    const result = await callApi<{ fresh: boolean }>(`/api/payments/${payment.id}/resend`, { method: "POST" });

    setBusy(false);
    setMessage(result.ok ? (result.data.fresh ? "A fresh link was sent." : "Sent again.") : result.message);
    router.refresh();
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-text-primary">{payment.amount}</p>
          <Pill tone={status.tone}>{status.label}</Pill>
          {payment.refunded && <span className="text-xs text-text-secondary">{payment.refunded} refunded</span>}
        </div>
        <p className="truncate text-small text-text-secondary">
          {payment.who} · {payment.description}
          {payment.reference ? ` · ${payment.reference}` : ""} · {payment.provider} · {payment.when}
        </p>
        {message && <p className="mt-1 text-xs text-text-secondary">{message}</p>}
      </div>

      <div className="flex items-center gap-2">
        {payment.status === "CREATED" && payment.linkUrl && <CopyLink url={payment.linkUrl} label="Copy link" />}
        <a href={payment.receiptPath} target="_blank" rel="noreferrer" className="text-small text-primary underline">
          Receipt
        </a>
        {canResend && (
          <Button type="button" variant="outline" size="sm" onClick={resend} disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" /> : <RotateCw />}
            Send again
          </Button>
        )}
      </div>
    </li>
  );
}

function CopyLink({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-small text-primary underline"
      onClick={async () => {
        await navigator.clipboard.writeText(url).catch(() => {});
        setCopied(true);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}

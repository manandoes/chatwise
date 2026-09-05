"use client";

// Connecting a number through the official WhatsApp Business API.
//
// Each customer brings their own Meta app, so this asks for four things from
// it, and then hands back two things to paste in return: the customer's own
// webhook address and the verify token that goes with it.
//
// What this screen deliberately does *not* do is state Meta's approval or
// verification requirements as fact — those are Meta's to define and they
// change (docs/Rules.md §8, docs/PRD.md §10). It describes what we need and
// points at Meta's own console for the rest.

import { AlertCircle, Check, Copy, LoaderCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type SavedCredentials = {
  phoneNumberId: string;
  appId: string | null;
  businessAccountId: string | null;
  displayPhoneNumber: string | null;
  webhookPathToken: string;
  webhookVerifyToken: string;
  webhookVerifiedAt: string | null;
} | null;

export function ApiConnect({
  saved,
  status,
  lastError,
  messagesReceived,
  messagesSent,
  appOrigin,
}: {
  saved: SavedCredentials;
  status: string;
  lastError: string | null;
  messagesReceived: number;
  messagesSent: number;
  /** Where this app is reachable, used to build the customer's webhook address. */
  appOrigin: string;
}) {
  const [phoneNumberId, setPhoneNumberId] = useState(saved?.phoneNumberId ?? "");
  const [appId, setAppId] = useState(saved?.appId ?? "");
  const [businessAccountId, setBusinessAccountId] = useState(
    saved?.businessAccountId ?? "",
  );
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isConnected = status === "CONNECTED" && Boolean(saved);
  const webhookUrl = saved
    ? `${appOrigin}/api/whatsapp/business-api/webhook/${saved.webhookPathToken}`
    : null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsSaving(true);

    try {
      const response = await fetch("/api/whatsapp/business-api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId,
          appId,
          businessAccountId,
          accessToken,
          appSecret,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFieldErrors(payload?.error?.fields ?? {});
        setError(payload?.error?.message ?? "We couldn't save those credentials.");
        setIsSaving(false);
        return;
      }

      // Neither secret is ever sent back, and there is no reason to keep them
      // in the browser once they're stored.
      setAccessToken("");
      setAppSecret("");
      window.location.reload();
    } catch {
      setError("We couldn't reach ChatWise. Check your connection and try again.");
      setIsSaving(false);
    }
  }

  async function disconnect() {
    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/whatsapp/business-api/credentials", {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.message ?? "We couldn't disconnect.");
        setIsSaving(false);
      } else {
        window.location.reload();
      }
    } catch {
      setError("We couldn't reach ChatWise. Try again.");
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-h3 flex items-center gap-2.5">
            <ShieldCheck aria-hidden className="size-5 text-text-secondary" />
            Your Meta app
          </CardTitle>
          <CardDescription>
            {isConnected
              ? "Your agent is live on this number."
              : "Four things from your own Meta app. Everything is on one or two screens there — the guide below says where."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <p className="flex items-center gap-2 text-text-primary">
              <span
                aria-hidden
                className={`size-2.5 shrink-0 rounded-full ${
                  isConnected ? "bg-primary shadow-glow" : "bg-text-disabled"
                }`}
              />
              {isConnected ? "Connected" : "Not connected"}
            </p>

            {saved?.displayPhoneNumber && (
              <p className="font-mono text-small text-text-secondary">
                {saved.displayPhoneNumber}
              </p>
            )}
          </div>

          {lastError && !isConnected && (
            <p className="text-pretty text-small text-error">{lastError}</p>
          )}

          <form onSubmit={submit} noValidate className="space-y-5">
            <Field
              id="phoneNumberId"
              label="Phone number ID"
              hint="A long number, in your Meta app under WhatsApp → API Setup."
              value={phoneNumberId}
              error={fieldErrors.phoneNumberId}
              disabled={isSaving}
              onChange={setPhoneNumberId}
              placeholder="123456789012345"
            />

            <Field
              id="accessToken"
              label="Access token"
              hint={
                isConnected
                  ? "Stored and encrypted. Paste a new one here only to replace it."
                  : "From the same API Setup screen. Treat it like a password."
              }
              value={accessToken}
              error={fieldErrors.accessToken}
              disabled={isSaving}
              onChange={setAccessToken}
              type="password"
              placeholder={isConnected ? "Leave blank to keep the current one" : "EAAG…"}
            />

            <Field
              id="appSecret"
              label="App secret"
              hint="Under Settings → Basic in your Meta app. We use it to check that incoming messages really came from Meta — without it, your agent can't receive anything."
              value={appSecret}
              error={fieldErrors.appSecret}
              disabled={isSaving}
              onChange={setAppSecret}
              type="password"
              placeholder={isConnected ? "Leave blank to keep the current one" : "a1b2c3…"}
            />

            <Field
              id="appId"
              label="App ID"
              hint="Optional. Alongside the app secret. Useful if you ever need our help."
              value={appId}
              error={fieldErrors.appId}
              disabled={isSaving}
              onChange={setAppId}
              placeholder="123456789012345"
            />

            <Field
              id="businessAccountId"
              label="WhatsApp Business Account ID"
              hint="Optional. Also on the API Setup screen."
              value={businessAccountId}
              error={fieldErrors.businessAccountId}
              disabled={isSaving}
              onChange={setBusinessAccountId}
              placeholder="123456789012345"
            />

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Checking with Meta…
                  </>
                ) : isConnected ? (
                  "Update credentials"
                ) : (
                  "Connect"
                )}
              </Button>

              {saved && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={disconnect}
                  disabled={isSaving}
                >
                  Disconnect
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {saved && webhookUrl && (
        <WebhookDetails
          url={webhookUrl}
          verifyToken={saved.webhookVerifyToken}
          verifiedAt={saved.webhookVerifiedAt}
        />
      )}

      {isConnected && <TestMessage />}

      <SetupGuide hasCredentials={Boolean(saved)} />

      <Card>
        <CardHeader>
          <CardTitle className="text-h3">Messages so far</CardTitle>
          <CardDescription>
            We count messages to show the connection is alive. We don&rsquo;t
            store what they said here.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex gap-10">
          <div>
            <p className="text-label uppercase text-text-secondary">Received</p>
            <p className="mt-1 text-h2 font-semibold text-text-primary">
              {messagesReceived}
            </p>
          </div>
          <div>
            <p className="text-label uppercase text-text-secondary">Sent</p>
            <p className="mt-1 text-h2 font-semibold text-text-primary">
              {messagesSent}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The two values the customer takes *back* to Meta. This address is theirs
 * alone — every customer gets a different one.
 */
function WebhookDetails({
  url,
  verifyToken,
  verifiedAt,
}: {
  url: string;
  verifyToken: string;
  verifiedAt: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">Your webhook</CardTitle>
        <CardDescription>
          Paste these two into your Meta app, under WhatsApp →
          Configuration, so your customers&rsquo; messages reach your agent.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="flex items-center gap-2 text-small">
          <span
            aria-hidden
            className={`size-2 shrink-0 rounded-full ${
              verifiedAt ? "bg-primary shadow-glow" : "bg-warning"
            }`}
          />
          <span className={verifiedAt ? "text-text-primary" : "text-text-secondary"}>
            {verifiedAt
              ? "Meta has confirmed this webhook."
              : "Meta hasn't confirmed this webhook yet."}
          </span>
        </p>

        <CopyRow label="Callback URL" value={url} />
        <CopyRow label="Verify token" value={verifyToken} />

        <p className="text-pretty text-small leading-relaxed text-text-secondary">
          This address is yours alone — don&rsquo;t share it. After saving it in
          Meta, subscribe to the <span className="text-text-primary">messages</span>{" "}
          field so messages are actually delivered.
        </p>
      </CardContent>
    </Card>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-label uppercase text-text-secondary">{label}</p>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <code className="min-w-0 flex-1 break-all font-mono text-small text-text-primary">
          {value}
        </code>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  error,
  disabled,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-text-primary">
        {label}
      </Label>

      {!error && (
        <p className="text-pretty text-small text-text-secondary">{hint}</p>
      )}

      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />

      {error && (
        <p id={`${id}-error`} className="text-small text-error">
          {error}
        </p>
      )}
    </div>
  );
}

function SetupGuide({ hasCredentials }: { hasCredentials: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">Where to find these</CardTitle>
        <CardDescription>
          Everything comes from your own app in Meta&rsquo;s developer console.
          You keep control of it — ChatWise never has access to your Meta
          account.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <ol className="space-y-4">
          {[
            {
              title: "Create an app in Meta's developer console",
              body: "Add WhatsApp to it, and register the phone number you want your agent to answer on.",
            },
            {
              title: "Go to WhatsApp → API Setup",
              body: "The phone number ID and the WhatsApp Business Account ID are here, next to your number. So is a temporary access token.",
            },
            {
              title: "Generate a permanent access token",
              body: "The temporary one on that screen is fine for a first test, but it stops working after a while and your agent goes quiet with it. For a number you rely on, create a permanent one.",
            },
            {
              title: "Copy your app secret",
              body: "Settings → Basic, next to the app ID. This is what lets us tell a real message from Meta apart from someone pretending to be them.",
            },
            {
              title: "Save those here, then set up the webhook",
              body: hasCredentials
                ? "Your callback URL and verify token are above — paste them into WhatsApp → Configuration in Meta, then subscribe to the messages field."
                : "Once you save the details above, we'll show you a callback URL and verify token to paste back into Meta.",
            },
          ].map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-small text-text-secondary">
                {index + 1}
              </span>
              <div>
                <p className="font-medium text-text-primary">{step.title}</p>
                <p className="mt-1 text-pretty text-small leading-relaxed text-text-secondary">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <p className="text-pretty text-small leading-relaxed text-text-secondary">
          Meta runs its own review and business-verification process before a
          number can message the public, and the steps change from time to time.
          Follow the instructions in Meta&rsquo;s own console — we can&rsquo;t
          speak for what they currently require.
        </p>
      </CardContent>
    </Card>
  );
}

function TestMessage() {
  const [to, setTo] = useState("");
  const [body, setBody] = useState(
    "Hello from ChatWise — this is a test message.",
  );
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setIsSending(true);

    try {
      const response = await fetch("/api/whatsapp/business-api/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, body }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error?.message ?? "That message couldn't be sent.");
      } else {
        setResult("Sent. It should arrive on that phone in a moment.");
      }
    } catch {
      setError("We couldn't reach ChatWise. Try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">Send a test message</CardTitle>
        <CardDescription>
          Check the connection works end to end. Note that WhatsApp restricts
          messaging someone who hasn&rsquo;t contacted you recently — message
          your own number, having first sent it a message from that phone.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={submit} noValidate className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result && <p className="text-small text-primary">{result}</p>}

          <Field
            id="test-to"
            label="Send to"
            hint="Full number including the country code, no spaces or symbols."
            value={to}
            disabled={isSending}
            onChange={setTo}
            placeholder="919876543210"
          />

          <Field
            id="test-body"
            label="Message"
            hint="Anything you like."
            value={body}
            disabled={isSending}
            onChange={setBody}
          />

          <Button type="submit" disabled={isSending}>
            {isSending ? (
              <>
                <LoaderCircle className="animate-spin" />
                Sending…
              </>
            ) : (
              "Send test message"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

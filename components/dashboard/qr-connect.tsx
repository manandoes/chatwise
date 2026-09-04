"use client";

// Connecting a WhatsApp number by scanning a QR code.
//
// The page polls while anything is in motion, because the whole flow is driven
// by the customer's phone rather than by anything they do here — they press
// Connect, then a code appears, then it disappears once they've scanned it.

import {
  AlertCircle,
  LoaderCircle,
  QrCode,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Status =
  | "NOT_CONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "DISCONNECTED"
  | "ERROR";

type SessionState = {
  status: Status;
  message: string | null;
  phoneNumber: string | null;
  qrImage: string | null;
  messagesReceived: number;
  messagesSent: number;
  lastMessageAt: string | null;
  lastError: string | null;
  serviceAvailable: boolean;
};

/** Plain words for each state, never a code (docs/Rules.md §7). */
const STATUS_LABEL: Record<Status, { text: string; dot: string }> = {
  NOT_CONNECTED: { text: "Not connected", dot: "bg-text-disabled" },
  CONNECTING: { text: "Waiting for you to scan", dot: "bg-warning" },
  CONNECTED: { text: "Connected", dot: "bg-primary shadow-glow" },
  RECONNECTING: { text: "Reconnecting…", dot: "bg-warning" },
  DISCONNECTED: { text: "Disconnected", dot: "bg-error" },
  ERROR: { text: "Needs attention", dot: "bg-error" },
};

/** States where something is still happening, so keep polling. */
const IN_MOTION: Status[] = ["CONNECTING", "RECONNECTING"];

export function QrConnect({ initial }: { initial: SessionState }) {
  const [state, setState] = useState<SessionState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/whatsapp/qr-session/status");
      if (!response.ok) return;

      setState((await response.json()) as SessionState);
    } catch {
      // A dropped poll isn't worth interrupting anyone over; the next one will
      // pick it up.
    }
  }, []);

  // Poll while a connection is being established, and slowly the rest of the
  // time so a drop is noticed without hammering the server.
  useEffect(() => {
    const interval = IN_MOTION.includes(state.status) ? 2_000 : 15_000;

    pollTimer.current = setTimeout(() => {
      void refresh();
    }, interval);

    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [state, refresh]);

  async function act(path: string, body?: unknown) {
    setError(null);
    setIsWorking(true);

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.message ?? "That didn't work. Try again.");
      } else {
        await refresh();
      }
    } catch {
      setError(
        "We couldn't reach ChatWise. Check your connection and try again.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  const label = STATUS_LABEL[state.status];
  const isConnected = state.status === "CONNECTED";

  return (
    <div className="space-y-6">
      {!state.serviceAvailable && (
        <Alert>
          <AlertCircle />
          <AlertDescription>
            The WhatsApp connection service isn&rsquo;t running right now, so you
            can&rsquo;t connect a number yet. Nothing you&rsquo;ve set up is
            affected.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-h3 flex items-center gap-2.5">
            <Smartphone aria-hidden className="size-5 text-text-secondary" />
            Your WhatsApp number
          </CardTitle>
          <CardDescription>
            {isConnected
              ? "Your agent is live on this number."
              : "Scan a code with the phone that has your business WhatsApp on it."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <p className="flex items-center gap-2 text-text-primary">
              <span
                aria-hidden
                className={`size-2.5 shrink-0 rounded-full ${label.dot}`}
              />
              {label.text}
            </p>

            {state.phoneNumber && (
              <p className="font-mono text-small text-text-secondary">
                +{state.phoneNumber}
              </p>
            )}
          </div>

          {state.message && (
            <p className="text-pretty text-small text-text-secondary">
              {state.message}
            </p>
          )}

          {state.lastError && state.status === "ERROR" && (
            <p className="text-pretty text-small text-error">{state.lastError}</p>
          )}

          {state.qrImage && (
            <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-background p-6 sm:flex-row sm:items-start">
              <Image
                src={state.qrImage}
                alt="QR code to link your WhatsApp account"
                width={200}
                height={200}
                unoptimized
                className="rounded-md"
              />

              <ol className="space-y-2 text-small text-text-secondary">
                <li>1. Open WhatsApp on your phone.</li>
                <li>
                  2. Tap <span className="text-text-primary">Settings</span> →{" "}
                  <span className="text-text-primary">Linked devices</span>.
                </li>
                <li>
                  3. Tap{" "}
                  <span className="text-text-primary">Link a device</span> and
                  point your camera at this code.
                </li>
                <li className="pt-2 text-text-disabled">
                  The code refreshes every so often. That&rsquo;s normal.
                </li>
              </ol>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {!isConnected && (
              <Button
                type="button"
                onClick={() => act("/api/whatsapp/qr-session/start")}
                disabled={isWorking || !state.serviceAvailable}
              >
                {isWorking ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Working…
                  </>
                ) : (
                  <>
                    <QrCode />
                    {state.status === "CONNECTING"
                      ? "Get a new code"
                      : "Connect WhatsApp"}
                  </>
                )}
              </Button>
            )}

            {isConnected && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void refresh()}
                disabled={isWorking}
              >
                <RefreshCw />
                Check again
              </Button>
            )}

            {state.status !== "NOT_CONNECTED" && (
              <Button
                type="button"
                variant="destructive"
                onClick={() =>
                  act("/api/whatsapp/qr-session/stop", { forget: true })
                }
                disabled={isWorking || !state.serviceAvailable}
              >
                Disconnect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isConnected && <TestMessage />}

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
              {state.messagesReceived}
            </p>
          </div>
          <div>
            <p className="text-label uppercase text-text-secondary">Sent</p>
            <p className="mt-1 text-h2 font-semibold text-text-primary">
              {state.messagesSent}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
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
      const response = await fetch("/api/whatsapp/qr-session/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, body }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
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
          Send yourself a message to check everything works end to end. Use your
          own number.
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

          <div className="space-y-2">
            <label
              htmlFor="test-to"
              className="block text-label uppercase text-text-secondary"
            >
              Send to
            </label>
            <input
              id="test-to"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="919876543210"
              disabled={isSending}
              className="h-10 w-full rounded-md border border-input bg-surface px-3 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <p className="text-small text-text-secondary">
              Full number including the country code, no spaces or symbols.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="test-body"
              className="block text-label uppercase text-text-secondary"
            >
              Message
            </label>
            <input
              id="test-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              disabled={isSending}
              className="h-10 w-full rounded-md border border-input bg-surface px-3 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

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

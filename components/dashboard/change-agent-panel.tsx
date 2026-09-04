"use client";

// Changing which agent runs, or how it connects.
//
// This is deliberately not an "add another agent" button, and there isn't one
// anywhere in the app. An account runs exactly one agent on one connection
// (docs/PRD.md §3.1); changing either means going back through setup and
// replacing what's there, never running two side by side (docs/Rules.md §6).
//
// The confirmation says plainly what will happen, because a customer clicking
// this has a working agent answering their customers.

import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ChangeAgentPanel({ currentBotName }: { currentBotName: string }) {
  const router = useRouter();

  const [isConfirming, setIsConfirming] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startAgain() {
    setError(null);
    setIsWorking(true);

    try {
      const response = await fetch("/api/agents/re-setup", { method: "POST" });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "We couldn't do that. Try again.");
        setIsWorking(false);
        return;
      }

      router.push("/onboarding/choose-bots");
      router.refresh();
    } catch {
      setError(
        "We couldn't reach ChatWise. Check your connection and try again.",
      );
      setIsWorking(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface/50 p-6">
      <h2 className="text-h3 font-semibold text-text-primary">
        Change your agent or connection
      </h2>

      <p className="mt-2 max-w-[70ch] text-pretty text-small leading-relaxed text-text-secondary">
        Your account runs one agent on one WhatsApp connection. Changing either
        replaces what you have now — it doesn&rsquo;t add a second. If you need
        two agents running at once, that means a second account.
      </p>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!isConfirming ? (
        <Button
          type="button"
          variant="outline"
          className="mt-5"
          onClick={() => setIsConfirming(true)}
        >
          <RefreshCw />
          Change setup
        </Button>
      ) : (
        <div className="mt-5 rounded-md border border-warning/40 bg-warning/5 p-5">
          <h3 className="font-medium text-text-primary">
            Go back through setup?
          </h3>

          <ul className="mt-3 space-y-2">
            {[
              "You'll walk through the four setup steps again, with today's answers already filled in.",
              `If you pick a different agent, the answers you gave for ${currentBotName} are cleared — a different agent asks different questions.`,
              "Your WhatsApp connection, conversations and leads are not touched.",
              "Your dashboard stays closed until you finish setup again.",
            ].map((line) => (
              <li
                key={line}
                className="flex gap-3 text-small leading-relaxed text-text-secondary"
              >
                <span
                  aria-hidden
                  className="mt-2 size-1 shrink-0 rounded-full bg-warning"
                />
                <span className="text-pretty">{line}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button type="button" onClick={startAgain} disabled={isWorking}>
              {isWorking ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Taking you to setup…
                </>
              ) : (
                "Yes, go back to setup"
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsConfirming(false)}
              disabled={isWorking}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

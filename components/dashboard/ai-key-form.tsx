"use client";

// Bringing your own AI key.
//
// An account that sets a key here is billed by Google for what its agents
// think, instead of running on ChatWise's own key. Removing it is not a way to
// switch the agent off — it goes back to ours.
//
// The key itself is never sent back to this screen once saved, so the box is
// always empty and the only thing shown is whether one is in place.

import { AlertCircle, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

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

export function AiKeyForm({ hasKey }: { hasKey: boolean }) {
  const router = useRouter();

  const [apiKey, setApiKey] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/settings/ai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFieldError(payload?.error?.fields?.apiKey ?? null);
        setError(payload?.error?.message ?? "We couldn't save that key.");
        setIsSaving(false);
        return;
      }

      // It is stored now, and there is no reason to keep it in the browser.
      setApiKey("");
      setIsSaving(false);
      router.refresh();
    } catch {
      setError("We couldn't reach ChatWise. Check your connection and try again.");
      setIsSaving(false);
    }
  }

  async function remove() {
    setError(null);
    setFieldError(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/settings/ai-key", { method: "DELETE" });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.message ?? "We couldn't remove that key.");
        setIsSaving(false);
        return;
      }

      setIsSaving(false);
      router.refresh();
    } catch {
      setError("We couldn't reach ChatWise. Try again.");
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">Your AI key</CardTitle>
        <CardDescription>
          Bring your own Google Gemini key and your agent thinks on it, billed
          to you by Google. Leave this empty and it runs on ChatWise&rsquo;s
          key instead.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <p className="flex items-center gap-2 text-text-primary">
          <span
            aria-hidden
            className={`size-2.5 shrink-0 rounded-full ${
              hasKey ? "bg-primary shadow-glow" : "bg-text-disabled"
            }`}
          />
          {hasKey
            ? "Your agent is using your own key."
            : "Your agent is using ChatWise's key."}
        </p>

        <form onSubmit={save} noValidate className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="apiKey" className="text-text-primary">
              Gemini API key
            </Label>

            {!fieldError && (
              <p className="text-pretty text-small leading-relaxed text-text-secondary">
                Create one at{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-4"
                >
                  Google AI Studio
                </a>
                . We store it encrypted and never show it again — treat it like
                a password.
              </p>
            )}

            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              placeholder={hasKey ? "Paste a new key to replace it" : "AIza…"}
              disabled={isSaving}
              autoComplete="off"
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? "apiKey-error" : undefined}
              onChange={(event) => setApiKey(event.target.value)}
            />

            {fieldError && (
              <p id="apiKey-error" className="text-small text-error">
                {fieldError}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isSaving || !apiKey.trim()}>
              {isSaving ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Saving…
                </>
              ) : hasKey ? (
                "Replace key"
              ) : (
                "Save key"
              )}
            </Button>

            {hasKey && (
              <Button
                type="button"
                variant="destructive"
                onClick={remove}
                disabled={isSaving}
              >
                Remove key
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

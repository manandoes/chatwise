"use client";

// Privacy: masking contact numbers on screen.

import { AlertCircle, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function PrivacySettingsForm({ initialMasked }: { initialMasked: boolean }) {
  const router = useRouter();

  const [masked, setMasked] = useState(initialMasked);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !masked;
    setError(null);
    setIsSaving(true);
    setMasked(next);

    try {
      const response = await fetch("/api/settings/privacy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maskContactPhone: next }),
      });

      if (!response.ok) {
        setMasked(!next);
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.message ?? "We couldn't save that.");
        return;
      }

      router.refresh();
    } catch {
      setMasked(!next);
      setError("We couldn't reach ChatWise. Check your connection.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">Privacy</CardTitle>
        <CardDescription>
          Hide most of a contact&rsquo;s number in the inbox — e.g.
          &ldquo;+9198••••10&rdquo; instead of the full number.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-text-primary">
          <input
            type="checkbox"
            checked={masked}
            disabled={isSaving}
            onChange={toggle}
            className="size-4 rounded border-border"
          />
          Mask contact phone numbers
        </label>

        {isSaving && (
          <p className="flex items-center gap-1.5 text-small text-text-secondary">
            <LoaderCircle className="size-3.5 animate-spin" />
            Saving…
          </p>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

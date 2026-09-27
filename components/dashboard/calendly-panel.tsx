"use client";

// Connecting Calendly on the Integrations screen. The booking link alone is
// enough to send people links; a personal access token adds booking
// confirmations and reminders (Calendly's webhooks, on its paid plans).

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorNote, Pill } from "@/components/dashboard/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi } from "@/lib/client-api";

export function CalendlyPanel({
  available,
  connection,
}: {
  available: boolean;
  connection: { bookingUrl: string; webhooks: boolean } | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!connection);
  const [bookingUrl, setBookingUrl] = useState(connection?.bookingUrl ?? "");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);

  if (!available) {
    return (
      <p className="text-small text-text-secondary">Calendly isn&apos;t switched on for this ChatWise installation yet.</p>
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    setNote(null);

    const result = await callApi<{ webhooks: boolean; note: string | null }>("/api/calendly", {
      body: { bookingUrl, token },
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      setFields(result.fields);
      return;
    }

    setToken("");
    setNote(result.data.note);
    setEditing(false);
    router.refresh();
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Calendly? Confirmations and reminders stop. Bookings already made stay here.")) return;

    setBusy(true);
    setError(null);

    const result = await callApi("/api/calendly", { method: "DELETE" });

    setBusy(false);

    if (!result.ok) setError(result.message);
    else {
      setEditing(true);
      setBookingUrl("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />
      {note && <p className="text-small text-warning">{note}</p>}

      {connection && !editing ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-5">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex flex-wrap items-center gap-2 font-medium text-text-primary">
              <a href={connection.bookingUrl} target="_blank" rel="noreferrer" className="truncate text-primary underline">
                {connection.bookingUrl}
              </a>
              <Pill tone={connection.webhooks ? "good" : "warn"}>
                {connection.webhooks ? "Confirmations and reminders on" : "Links only"}
              </Pill>
            </p>
            <p className="text-small text-text-secondary">
              {connection.webhooks
                ? "When someone books, they get a confirmation on WhatsApp, then reminders 24 hours and 1 hour before."
                : "You can send this link. Add a personal access token to hear about bookings and send confirmations and reminders."}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>
            Change
          </Button>
          <Button type="button" variant="ghost" onClick={disconnect} disabled={busy}>
            Disconnect
          </Button>
        </div>
      ) : (
        <form onSubmit={save} className="max-w-2xl space-y-4 rounded-lg border border-border bg-surface p-5">
          <div className="space-y-1">
            <Label htmlFor="calendly-url">Your booking link</Label>
            <Input
              id="calendly-url"
              value={bookingUrl}
              onChange={(e) => setBookingUrl(e.target.value)}
              placeholder="https://calendly.com/your-name/30min"
              required
            />
            {fields.bookingUrl && <p className="text-xs text-error">{fields.bookingUrl}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="calendly-token">Personal access token (for confirmations and reminders)</Label>
            <Input
              id="calendly-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              placeholder={connection?.webhooks ? "Leave blank to keep the current one" : ""}
            />
            {fields.token && <p className="text-xs text-error">{fields.token}</p>}
            <p className="text-xs text-text-secondary">
              In Calendly: Integrations &amp; apps → API and webhooks → Personal access tokens → Generate new
              token. Booking updates need a paid Calendly plan. We store the token encrypted and never show it again.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy && <LoaderCircle className="animate-spin" />}
              {connection ? "Save" : "Connect Calendly"}
            </Button>
            {connection && (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

"use client";

// "Send my booking link" on the Bookings page: picks a contact and sends them
// the Calendly link on WhatsApp, tagged so their booking comes back to them.

import { Check, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { ErrorNote } from "@/components/dashboard/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi } from "@/lib/client-api";

export function BookingInviteForm({ contacts }: { contacts: { id: string; label: string }[] }) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function send(event: React.FormEvent) {
    event.preventDefault();

    const contact = contacts.find((one) => one.label === label);

    if (!contact) {
      setError("Choose someone from the list.");
      return;
    }

    setBusy(true);
    setError(null);
    setSent(null);

    const result = await callApi("/api/bookings/invite", { body: { contactId: contact.id } });

    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setSent(contact.label);
    setLabel("");
  }

  return (
    <form onSubmit={send} className="max-w-xl space-y-3 rounded-lg border border-border bg-surface p-5">
      <h2 className="font-semibold text-text-primary">Send your booking link</h2>
      <ErrorNote message={error} />
      {sent && (
        <p className="flex items-center gap-1 text-small text-success">
          <Check className="size-4" /> Sending to {sent}.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-60 flex-1 space-y-1">
          <Label htmlFor="invite-contact">To</Label>
          <Input id="invite-contact" list="invite-contacts" value={label} onChange={(e) => setLabel(e.target.value)} required />
          <datalist id="invite-contacts">
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.label} />
            ))}
          </datalist>
        </div>
        <Button type="submit" disabled={busy}>
          {busy && <LoaderCircle className="animate-spin" />}
          Send link
        </Button>
      </div>
      <p className="text-xs text-text-secondary">
        Uses the &ldquo;Book a consultation&rdquo; wording from Integrations → Automated messages.
      </p>
    </form>
  );
}

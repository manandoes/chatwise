"use client";

// Adding one contact by hand, from the Contacts page header.

import { LoaderCircle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorNote } from "@/components/dashboard/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi } from "@/lib/client-api";

export function AddContactButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus /> Add contact
      </Button>
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await callApi<{ id: string }>("/api/contacts", { body: { phone, name, email } });

    setBusy(false);

    if (!result.ok) {
      setError(result.fields.phone ?? result.message);
      return;
    }

    router.push(`/dashboard/contacts/${result.data.id}`);
  }

  return (
    <form onSubmit={save} className="w-full max-w-sm space-y-3 rounded-lg border border-border bg-surface p-4 sm:w-80">
      <ErrorNote message={error} />
      <div className="space-y-1">
        <Label htmlFor="new-contact-phone">WhatsApp number</Label>
        <Input id="new-contact-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="new-contact-name">Name</Label>
        <Input id="new-contact-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="new-contact-email">Email</Label>
        <Input id="new-contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy && <LoaderCircle className="animate-spin" />}
          Add
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

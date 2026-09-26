"use client";

// Editing one contact: details, tags and consent. Each part saves on its own.

import { Check, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorNote, NativeSelect } from "@/components/dashboard/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi } from "@/lib/client-api";

type Consent = "PENDING" | "OPTED_IN" | "OPTED_OUT";

type EditableContact = {
  id: string;
  name: string;
  email: string;
  language: string;
  optInStatus: Consent;
  tags: { name: string; byRule: boolean }[];
};

export function ContactEditor({ contact, knownTags }: { contact: EditableContact; knownTags: string[] }) {
  const router = useRouter();
  const [name, setName] = useState(contact.name);
  const [email, setEmail] = useState(contact.email);
  const [language, setLanguage] = useState(contact.language);
  const [newTag, setNewTag] = useState("");
  const [consent, setConsent] = useState<Consent>(contact.optInStatus);
  const [consentNote, setConsentNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(what: string, url: string, method: string, body?: unknown) {
    setBusy(what);
    setError(null);
    setSaved(null);

    const result = await callApi(url, { method, body });

    setBusy(null);

    if (!result.ok) {
      setError(Object.values(result.fields)[0] ?? result.message);
      return false;
    }

    setSaved(what);
    router.refresh();
    return true;
  }

  const base = `/api/contacts/${contact.id}`;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-3">
        <ErrorNote message={error} />
      </div>

      <form
        className="space-y-3 rounded-lg border border-border bg-surface p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void call("details", base, "PATCH", { name, email, language });
        }}
      >
        <h2 className="font-semibold text-text-primary">Details</h2>
        <div className="space-y-1">
          <Label htmlFor="contact-name">Name</Label>
          <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="contact-email">Email</Label>
          <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="contact-language">Language</Label>
          <Input id="contact-language" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en" className="w-28" />
        </div>
        <SaveRow busy={busy === "details"} saved={saved === "details"} />
      </form>

      <div className="space-y-3 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-semibold text-text-primary">Tags</h2>
        {contact.tags.length === 0 ? (
          <p className="text-small text-text-secondary">No tags yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {contact.tags.map((tag) => (
              <li key={tag.name} className="inline-flex items-center gap-1 rounded-full bg-surface-elevated py-0.5 pl-2.5 pr-1 text-xs text-text-primary">
                {tag.name}
                {tag.byRule && <span className="text-text-secondary">(auto)</span>}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-border"
                  aria-label={`Remove ${tag.name}`}
                  onClick={() => call("tags", `${base}/tags?name=${encodeURIComponent(tag.name)}`, "DELETE")}
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault();

            if (await call("tags", `${base}/tags`, "POST", { name: newTag })) setNewTag("");
          }}
        >
          <Input
            aria-label="New tag"
            list="known-tags"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="Add a tag"
          />
          <datalist id="known-tags">
            {knownTags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
          <Button type="submit" variant="outline" disabled={busy === "tags" || !newTag.trim()}>
            Add
          </Button>
        </form>
        <p className="text-xs text-text-secondary">
          &ldquo;(auto)&rdquo; tags come from auto-tag rules and update themselves. Tags you add stay
          until you remove them.
        </p>
      </div>

      <form
        className="space-y-3 rounded-lg border border-border bg-surface p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void call("consent", `${base}/consent`, "POST", { status: consent, note: consentNote });
        }}
      >
        <h2 className="font-semibold text-text-primary">Consent</h2>
        <NativeSelect aria-label="Consent" value={consent} onChange={(e) => setConsent(e.target.value as Consent)}>
          <option value="PENDING">Not asked yet</option>
          <option value="OPTED_IN">Opted in — happy to hear from you</option>
          <option value="OPTED_OUT">Opted out — send nothing</option>
        </NativeSelect>
        <Input
          aria-label="Why"
          value={consentNote}
          onChange={(e) => setConsentNote(e.target.value)}
          placeholder="Why? e.g. said yes in store"
        />
        <p className="text-xs text-text-secondary">
          Opted-out contacts get no campaigns and no automated messages. They can also reply STOP or
          START themselves on WhatsApp.
        </p>
        <SaveRow busy={busy === "consent"} saved={saved === "consent"} disabled={consent === contact.optInStatus} />
      </form>
    </div>
  );
}

function SaveRow({ busy, saved, disabled }: { busy: boolean; saved: boolean; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" disabled={busy || disabled}>
        {busy && <LoaderCircle className="animate-spin" />}
        Save
      </Button>
      {saved && (
        <span className="flex items-center gap-1 text-small text-success">
          <Check className="size-4" /> Saved
        </span>
      )}
    </div>
  );
}

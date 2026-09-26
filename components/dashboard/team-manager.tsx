"use client";

// Inviting people to the team and managing who is on it.
//
// The invite link is shown once, right after it is made, with a copy button —
// there is no email service to send it (docs/Memory.md), so the owner passes
// it on themselves.

import { Check, Copy, LoaderCircle, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorNote, NativeSelect, Pill } from "@/components/dashboard/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi } from "@/lib/client-api";

type Member = {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "AGENT";
  isCreator: boolean;
};

type Invite = { id: string; email: string; role: "OWNER" | "AGENT"; expiresAt: string };

export function TeamManager({
  members,
  invites,
  isOwner,
  you,
}: {
  members: Member[];
  invites: Invite[];
  isOwner: boolean;
  you: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"AGENT" | "OWNER">("AGENT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function invite() {
    setBusy(true);
    setError(null);
    setLink(null);

    const result = await callApi<{ link: string }>("/api/team/invites", {
      body: { email, role },
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.fields.email ?? result.message);
      return;
    }

    setLink(result.data.link);
    setEmail("");
    router.refresh();
  }

  async function act(url: string, method: string, body?: unknown) {
    setError(null);
    const result = await callApi(url, { method, body });

    if (!result.ok) setError(result.message);
    else router.refresh();
  }

  async function copy() {
    if (!link) return;

    await navigator.clipboard.writeText(link).catch(() => {});
    setCopied(true);
  }

  return (
    <div className="space-y-8">
      <ErrorNote message={error} />

      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-text-primary">
                {member.name} {member.id === you && <span className="text-text-secondary">(you)</span>}
              </p>
              <p className="truncate text-small text-text-secondary">{member.email}</p>
            </div>

            {isOwner && !member.isCreator ? (
              <>
                <NativeSelect
                  className="w-44"
                  aria-label={`Role for ${member.name}`}
                  value={member.role}
                  onChange={(event) =>
                    act(`/api/team/members/${member.id}`, "PATCH", { role: event.target.value })
                  }
                >
                  <option value="AGENT">Team member</option>
                  <option value="OWNER">Owner</option>
                </NativeSelect>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${member.name}`}
                  onClick={() => act(`/api/team/members/${member.id}`, "DELETE")}
                >
                  <Trash2 />
                </Button>
              </>
            ) : (
              <Pill tone={member.role === "OWNER" ? "primary" : "neutral"}>
                {member.role === "OWNER" ? "Owner" : "Team member"}
              </Pill>
            )}
          </li>
        ))}
      </ul>

      {isOwner && (
        <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
          <div>
            <h2 className="text-h3 font-semibold text-text-primary">Invite someone</h2>
            <p className="mt-1 text-small text-text-secondary">
              Team members can answer conversations, manage contacts and deals, and send
              campaigns. Only owners can change billing, integrations and the team.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Their email address</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <NativeSelect
                id="invite-role"
                value={role}
                onChange={(event) => setRole(event.target.value as "AGENT" | "OWNER")}
              >
                <option value="AGENT">Team member</option>
                <option value="OWNER">Owner</option>
              </NativeSelect>
            </div>
            <Button type="button" onClick={invite} disabled={busy || !email.trim()}>
              {busy ? <LoaderCircle className="animate-spin" /> : <UserPlus />}
              Create invite link
            </Button>
          </div>

          {link && (
            <div className="space-y-2 rounded-md border border-primary/30 bg-primary/10 p-4">
              <p className="text-small text-text-primary">
                Send this link to them. It works once, for 7 days, and only when they sign in
                with that email address. You won&rsquo;t see it again.
              </p>
              <div className="flex gap-2">
                <Input readOnly value={link} aria-label="Invite link" />
                <Button type="button" variant="outline" onClick={copy}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          )}

          {invites.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-small font-medium text-text-primary">Waiting to be accepted</h3>
              <ul className="space-y-2">
                {invites.map((open) => (
                  <li
                    key={open.id}
                    className="flex items-center justify-between gap-3 text-small text-text-secondary"
                  >
                    <span>
                      {open.email} · {open.role === "OWNER" ? "Owner" : "Team member"} · expires{" "}
                      {new Date(open.expiresAt).toLocaleDateString()}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => act(`/api/team/invites/${open.id}`, "DELETE")}
                    >
                      Withdraw
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

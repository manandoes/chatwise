"use client";

// The team's side of one conversation: who is handling it, whether it's
// urgent, the AI's summary of it, and the notes the team leaves each other.
// None of this is ever sent to the customer.

import { AtSign, LoaderCircle, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { NativeSelect } from "@/components/dashboard/form-bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ThreadState } from "@/lib/conversations";
import { formatWhen } from "@/lib/format-when";
import type { TeamNote } from "@/lib/team-inbox";

export type Member = { id: string; userId: string; name: string };

/** How often open notes are re-read, so a teammate's note appears. */
const NOTES_REFRESH_MS = 15_000;

export function ThreadTeamPanel({
  conversationId,
  state,
  members,
  summary,
  onChanged,
}: {
  conversationId: string;
  state: ThreadState;
  members: Member[];
  summary: { text: string; at: string } | null;
  /** Called after a change, so the thread re-reads its state. */
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<"assign" | "priority" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patch(what: "assign" | "priority", body: Record<string, unknown>) {
    setBusy(what);
    setError(null);

    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.message ?? "That didn't save. Try again.");
      }

      onChanged();
    } catch {
      setError("We couldn't reach ChatWise. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  const urgent = state.priority === "HIGH";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-5 py-4">
        <label htmlFor="assignee" className="text-small text-text-secondary">
          Handled by
        </label>
        <NativeSelect
          id="assignee"
          className="w-52"
          value={state.assignedToId ?? ""}
          disabled={busy === "assign"}
          onChange={(event) => patch("assign", { assignedTo: event.target.value || null })}
        >
          <option value="">Nobody yet</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </NativeSelect>

        <div className="ml-auto flex items-center gap-3">
          {urgent && (
            <span className="rounded-full bg-error/15 px-2.5 py-0.5 text-xs font-medium text-error" title={state.priorityReason ?? undefined}>
              Urgent{state.priorityReason ? ` — ${state.priorityReason}` : ""}
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy === "priority"}
            onClick={() => patch("priority", { priority: urgent ? "NORMAL" : "HIGH" })}
          >
            {busy === "priority" && <LoaderCircle className="animate-spin" />}
            {urgent ? "No longer urgent" : "Mark urgent"}
          </Button>
        </div>

        {error && <p className="w-full text-small text-error">{error}</p>}
      </div>

      {summary && (
        <div className="rounded-lg border border-primary/25 bg-primary/5 px-5 py-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
            <Sparkles className="size-3.5 text-primary" aria-hidden /> Summary so far
            <span className="font-normal" suppressHydrationWarning>
              · {formatWhen(new Date(summary.at))}
            </span>
          </p>
          <p className="mt-1 whitespace-pre-wrap text-pretty text-small leading-relaxed text-text-primary">{summary.text}</p>
        </div>
      )}

      <TeamNotes conversationId={conversationId} members={members} />
    </div>
  );
}

function TeamNotes({ conversationId, members }: { conversationId: string; members: Member[] }) {
  const [notes, setNotes] = useState<TeamNote[] | null>(null);
  const [draft, setDraft] = useState("");
  const [mentioned, setMentioned] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read now, and again every little while so a teammate's note appears.
  useEffect(() => {
    let current = true;

    const load = () =>
      fetch(`/api/conversations/${conversationId}/notes`)
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: { notes: TeamNote[] } | null) => {
          if (current && payload) setNotes(payload.notes);
        })
        .catch(() => {});

    void load();

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, NOTES_REFRESH_MS);

    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [conversationId]);

  function mention(member: Member) {
    setDraft((text) => `${text}${text && !text.endsWith(" ") ? " " : ""}@${member.name} `);
    setMentioned((ids) => (ids.includes(member.id) ? ids : [...ids, member.id]));
  }

  async function post() {
    if (!draft.trim()) return;

    setBusy(true);
    setError(null);

    // Only people whose @name is still in the text are notified.
    const stillMentioned = mentioned.filter((id) => {
      const member = members.find((one) => one.id === id);
      return member && draft.includes(`@${member.name}`);
    });

    try {
      const response = await fetch(`/api/conversations/${conversationId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft, mentionedMemberIds: stillMentioned }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error?.message ?? "That note wasn't saved. Try again.");
        return;
      }

      setNotes((current) => [...(current ?? []), payload.note as TeamNote]);
      setDraft("");
      setMentioned([]);
    } catch {
      setError("We couldn't reach ChatWise. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-5">
      <h2 className="text-small font-medium text-text-primary">Team notes</h2>
      <p className="text-xs text-text-secondary">Only your team sees these — never the customer. Mention someone to let them know.</p>

      {notes === null ? (
        <p className="text-small text-text-secondary">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-small text-text-secondary">No notes yet.</p>
      ) : (
        <ol className="space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="border-l-2 border-primary/30 pl-3 text-small">
              <p className="whitespace-pre-wrap text-text-primary">{note.body}</p>
              <p className="text-xs text-text-secondary" suppressHydrationWarning>
                {note.author} · {formatWhen(new Date(note.at))}
                {note.mentions.length > 0 && ` · told ${note.mentions.join(", ")}`}
              </p>
            </li>
          ))}
        </ol>
      )}

      <Textarea
        aria-label="New team note"
        rows={2}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Add a note for your team…"
        className="text-small"
      />
      <div className="flex flex-wrap items-center gap-2">
        {members.length > 1 &&
          members.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => mention(member)}
              className="inline-flex items-center gap-0.5 rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary hover:bg-surface-elevated"
            >
              <AtSign className="size-3" aria-hidden />
              {member.name}
            </button>
          ))}
        <Button type="button" size="sm" className="ml-auto" onClick={post} disabled={busy || !draft.trim()}>
          {busy && <LoaderCircle className="animate-spin" />}
          Add note
        </Button>
      </div>
      {error && <p className="text-small text-error">{error}</p>}
    </section>
  );
}

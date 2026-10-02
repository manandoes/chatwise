"use client";

// One conversation, live — and the box you type into to join it.
//
// This is the whole of Phase 9 in one component: watch a thread the agent is
// handling, step in when you want to, and hand it back when you're done
// (docs/PRD.md §6, docs/Phases.md Phase 9).
//
// The one rule it exists to make obvious is that **the agent and you never
// answer at the same time**. Typing here takes the thread over, and it says so
// before you type rather than after. Handing it back is a deliberate press of a
// button, never something that happens quietly on a timer — a customer being
// answered by a person and then, mid-conversation, by a bot again is exactly
// the loop docs/Rules.md §5 is about.

import { Check, LoaderCircle, MessageSquareText, Send, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ThreadTeamPanel, type Member } from "@/components/dashboard/thread-team-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ThreadMessage, ThreadState } from "@/lib/conversations";
import { formatWhen } from "@/lib/format-when";
import type { QuickReplyRow } from "@/lib/quick-replies";

/** Short relative time, e.g. "3 minutes ago" or "2 hours ago". */
function formatWhenRelative(from: Date): string {
  const seconds = Math.floor((Date.now() - from.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** How often an open thread re-asks what has been said. */
const REFRESH_MS = 5_000;

export function ConversationThread({
  conversationId,
  who,
  agentName,
  initialMessages,
  initialState,
  initialTags,
  initialNotes,
  quickReplies,
  members,
  currentUserId,
  summary,
}: {
  conversationId: string;
  /** What to call the customer on screen. */
  who: string;
  /** What to call the agent on screen, e.g. "Your Receptionist". */
  agentName: string;
  initialMessages: ThreadMessage[];
  initialState: ThreadState;
  initialTags: string[];
  initialNotes: string;
  quickReplies: QuickReplyRow[];
  /** The team, for assigning and @mentions. */
  members: Member[];
  /** The signed-in person, so their own replies say "You". */
  currentUserId: string;
  summary: { text: string; at: string } | null;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [state, setState] = useState(initialState);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQuickReplies, setShowQuickReplies] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  // The newest message we already have. Sent with every poll so the server
  // returns what is new rather than the whole conversation again.
  const newest = useRef<string | null>(
    initialMessages.at(-1)?.at ?? null,
  );

  const takeInMessages = useCallback((arriving: ThreadMessage[]) => {
    if (arriving.length === 0) return;

    setMessages((current) => {
      const known = new Set(current.map((message) => message.id));
      const added = arriving.filter((message) => !known.has(message.id));

      if (added.length === 0) return current;

      return [...current, ...added];
    });

    const last = arriving.at(-1);

    if (last && (!newest.current || last.at > newest.current)) {
      newest.current = last.at;
    }
  }, []);

  /** Tells the server somebody has actually looked, so the badge clears. */
  const markRead = useCallback(async () => {
    try {
      await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
    } catch {
      // An unread badge that lingers is a small thing; interrupting somebody
      // reading a conversation over it would be a bigger one.
    }
  }, [conversationId]);

  const refresh = useCallback(async () => {
    try {
      const query = newest.current
        ? `?after=${encodeURIComponent(newest.current)}`
        : "";
      const response = await fetch(
        `/api/conversations/${conversationId}/messages${query}`,
      );

      if (!response.ok) return;

      const payload = (await response.json()) as {
        state: ThreadState;
        messages: ThreadMessage[];
      };

      setState(payload.state);
      takeInMessages(payload.messages);

      if (payload.messages.some((message) => message.fromCustomer)) {
        void markRead();
      }
    } catch {
      // The next poll will pick it up.
    }
  }, [conversationId, markRead, takeInMessages]);

  useEffect(() => {
    void markRead();
  }, [markRead]);

  useEffect(() => {
    function tick() {
      timer.current = setTimeout(async () => {
        if (document.visibilityState === "visible") await refresh();

        tick();
      }, REFRESH_MS);
    }

    function onVisible() {
      if (document.visibilityState === "visible") void refresh();
    }

    tick();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Follow the conversation down as it grows, the way a chat app does.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function setWhoAnswers(escalated: boolean) {
    setError(null);
    setIsSwitching(true);

    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escalated }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);

        setError(payload?.error?.message ?? "We couldn't do that. Try again.");

        return;
      }

      await refresh();
    } catch {
      setError("We couldn't reach ChatWise. Check your connection.");
    } finally {
      setIsSwitching(false);
    }
  }

  async function send() {
    const body = draft.trim();

    if (!body || isSending) return;

    setError(null);
    setIsSending(true);

    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        // The draft stays in the box on purpose: nothing was sent, and asking
        // somebody to type it again would be the second annoyance after the
        // first (docs/Rules.md §4).
        setError(
          payload?.error?.message ??
            "That message wasn't sent. Try again in a moment.",
        );

        return;
      }

      setDraft("");
      setState(payload.state as ThreadState);
      takeInMessages([payload.message as ThreadMessage]);
    } catch {
      setError("We couldn't reach ChatWise. Check your connection.");
    } finally {
      setIsSending(false);
    }
  }

  const agentIsAnswering = !state.escalatedAt;

  return (
    <div className="space-y-6">
      <WhoIsAnswering
        state={state}
        agentName={agentName}
        isSwitching={isSwitching}
        onChange={setWhoAnswers}
      />

      <ThreadTeamPanel
        conversationId={conversationId}
        state={state}
        members={members}
        summary={summary}
        onChanged={() => void refresh()}
      />

      <TagsAndNotes
        conversationId={conversationId}
        initialTags={initialTags}
        initialNotes={initialNotes}
      />

      {messages.length === 0 ? (
        <p className="text-small text-text-secondary">
          Nothing has been said in this conversation yet.
        </p>
      ) : (
        <ol className="space-y-4">
          {messages.map((message) => (
            <li
              key={message.id}
              className={message.fromCustomer ? "" : "flex justify-end"}
            >
              <div
                className={[
                  "max-w-[85%] rounded-lg px-4 py-3 sm:max-w-[70%]",
                  message.fromCustomer
                    ? "border border-border bg-surface"
                    : message.author === "HUMAN"
                      ? "border border-primary/40 bg-primary/15"
                      : "border border-primary/25 bg-primary/10",
                ].join(" ")}
              >
                <p className="whitespace-pre-wrap text-pretty text-small leading-relaxed text-text-primary">
                  {message.body}
                </p>

                <p
                  className="mt-2 text-xs text-text-secondary"
                  suppressHydrationWarning
                >
                  {message.fromCustomer
                    ? who
                    : message.author === "SYSTEM"
                      ? "ChatWise"
                      : message.author === "HUMAN"
                        ? !message.sentBy || message.sentBy.userId === currentUserId
                          ? "You"
                          : message.sentBy.name
                        : message.author === "CAMPAIGN"
                          ? "A campaign you sent"
                          : message.author === "AUTOMATION"
                            ? "Automated message"
                            : agentName}
                  {" · "}
                  {formatWhen(new Date(message.at))}
                </p>

                {message.failureReason && (
                  <p className="mt-2 text-xs text-error">
                    Not delivered — {message.failureReason}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <div ref={bottom} />

      <div className="space-y-2 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="reply" className="text-small font-medium text-text-primary">
            Reply yourself
          </label>

          {quickReplies.length > 0 && (
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowQuickReplies((open) => !open)}
              >
                <MessageSquareText className="size-4" />
                Quick reply
              </Button>

              {showQuickReplies && (
                <div className="absolute right-0 z-10 mt-1 w-72 max-w-[80vw] rounded-lg border border-border bg-surface-elevated p-1 shadow-lg">
                  <ul className="max-h-64 overflow-y-auto">
                    {quickReplies.map((reply) => (
                      <li key={reply.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setDraft((current) =>
                              current ? `${current}\n${reply.body}` : reply.body,
                            );
                            setShowQuickReplies(false);
                          }}
                          className="block w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-surface"
                        >
                          <span className="block text-small font-medium text-text-primary">
                            {reply.title}
                          </span>
                          <span className="block line-clamp-1 text-xs text-text-secondary">
                            {reply.body}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <Textarea
          id="reply"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter starts a new line — the way every
            // messaging app people already use behaves.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={`Write to ${who}…`}
          disabled={isSending}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-text-secondary">
            {agentIsAnswering
              ? "Sending this takes the conversation over, so your agent stops replying here."
              : "Your agent isn't replying in this conversation."}
          </p>

          <Button type="button" onClick={send} disabled={isSending || !draft.trim()}>
            {isSending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {isSending ? "Sending…" : "Send"}
          </Button>
        </div>

        {error && <p className="text-small text-error">{error}</p>}
      </div>
    </div>
  );
}

/** Tags and a private note on this thread — visible only inside the account. */
function TagsAndNotes({
  conversationId,
  initialTags,
  initialNotes,
}: {
  conversationId: string;
  initialTags: string[];
  initialNotes: string;
}) {
  const [tags, setTags] = useState(initialTags);
  const [tagDraft, setTagDraft] = useState("");
  const [notes, setNotes] = useState(initialNotes);
  const [savedNotes, setSavedNotes] = useState(initialNotes);
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  async function saveTags(next: string[]) {
    setTags(next);

    try {
      await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: next }),
      });
    } catch {
      // The next successful save reconciles it; not worth blocking on.
    }
  }

  function addTag() {
    const tag = tagDraft.trim();

    if (!tag || tags.includes(tag)) {
      setTagDraft("");
      return;
    }

    setTagDraft("");
    void saveTags([...tags, tag]);
  }

  function removeTag(tag: string) {
    void saveTags(tags.filter((existing) => existing !== tag));
  }

  async function saveNotes() {
    if (notes === savedNotes) return;

    setIsSavingNotes(true);

    try {
      await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      setSavedNotes(notes);
    } catch {
      // Left as a draft in the box; the next blur tries again.
    } finally {
      setIsSavingNotes(false);
    }
  }

  return (
    <div className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2">
      <div className="space-y-2">
        <p className="text-small font-medium text-text-primary">Tags</p>

        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2.5 py-0.5 text-xs text-text-secondary"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => removeTag(tag)}
                className="text-text-disabled hover:text-text-primary"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}

          <Input
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
            placeholder="Add a tag…"
            className="h-7 w-28 border-none bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor="conversation-notes"
            className="text-small font-medium text-text-primary"
          >
            Pinned note
          </label>
          {isSavingNotes ? (
            <LoaderCircle className="size-3.5 animate-spin text-text-secondary" />
          ) : (
            notes === savedNotes &&
            notes.trim() && <Check className="size-3.5 text-primary" />
          )}
        </div>

        <Textarea
          id="conversation-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={saveNotes}
          placeholder="Only your team sees this — never the customer."
          rows={2}
          className="text-small"
        />
      </div>
    </div>
  );
}

/** The banner that says who is answering, and the button that changes it. */
function WhoIsAnswering({
  state,
  agentName,
  isSwitching,
  onChange,
}: {
  state: ThreadState;
  agentName: string;
  isSwitching: boolean;
  onChange: (escalated: boolean) => void;
}) {
  if (!state.escalatedAt) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-5 py-4">
        <p className="text-small text-text-secondary">
          {agentName} is answering this conversation.
        </p>

        <Button
          type="button"
          variant="outline"
          onClick={() => onChange(true)}
          disabled={isSwitching}
        >
          {isSwitching && <LoaderCircle className="size-4 animate-spin" />}
          Take over
        </Button>
      </div>
    );
  }

  const handedOverByAgent = state.escalatedBy !== "HUMAN";

  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 p-5">
      <h2 className="font-medium text-text-primary">
        {handedOverByAgent ? "Waiting for you" : "You're handling this"}
      </h2>

      <p className="mt-1 max-w-[62ch] text-pretty text-small leading-relaxed text-text-secondary">
        {state.escalationReason ?? "Your agent handed this conversation over."}{" "}
        {agentName} has stopped replying here so it doesn&rsquo;t talk over you.
        Answer below, and let it carry on when you&rsquo;re done.
      </p>

      <div className="mt-4">
        <Button
          type="button"
          onClick={() => onChange(false)}
          disabled={isSwitching}
        >
          {isSwitching && <LoaderCircle className="size-4 animate-spin" />}
          My agent can carry on
        </Button>
      </div>

      {/* Gap 5: SLA clock — show how long a human has had this thread. */}
      {state.escalatedAt && state.firstHumanResponseAt && (
        <p className="mt-3 text-xs text-text-secondary">
          First human reply{" "}
          {formatWhenRelative(new Date(state.firstHumanResponseAt))} —{" "}
          {formatWhenRelative(new Date(state.escalatedAt))} after escalation.
        </p>
      )}
      {state.escalatedAt && !state.firstHumanResponseAt && (
        <p className="mt-3 text-xs text-warning">
          No human reply yet — waiting{" "}
          {formatWhenRelative(new Date())} since escalation.
        </p>
      )}
    </div>
  );
}

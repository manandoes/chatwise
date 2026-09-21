"use client";

// The inbox, watching itself.
//
// The list arrives already drawn from the server, so there is never a spinner
// on first paint. From then on it re-asks the server every few seconds, because
// the thing it is showing happens somewhere else entirely — on a customer's
// phone — and nobody should have to press reload to find out.
//
// It stops asking while the tab is in the background. A dashboard left open on
// a second monitor all day should not keep a database busy on behalf of nobody
// (docs/Rules.md §4).

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { InboxRow } from "@/lib/conversations";
import { formatWhen } from "@/lib/format-when";
import { maskPhone } from "@/lib/phone-mask";

/** How often the list re-asks, while somebody is actually looking at it. */
const REFRESH_MS = 10_000;

export function InboxList({
  initial,
  tags,
  activeTag,
  maskPhone: shouldMaskPhone,
}: {
  initial: InboxRow[];
  /** Every tag in use, for the filter dropdown. */
  tags: string[];
  /** The tag currently filtering the list, from the URL. */
  activeTag: string | null;
  /** Whether Settings → Privacy asks the inbox to hide full numbers. */
  maskPhone: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const query = activeTag ? `?tag=${encodeURIComponent(activeTag)}` : "";
      const response = await fetch(`/api/conversations${query}`);

      if (!response.ok) return;

      const payload = (await response.json()) as { conversations: InboxRow[] };

      setRows(payload.conversations);
    } catch {
      // A dropped poll is not worth interrupting anyone over — the next one
      // picks it up, and the list on screen is still the last true thing we
      // knew.
    }
  }, [activeTag]);

  useEffect(() => {
    function tick() {
      timer.current = setTimeout(async () => {
        if (document.visibilityState === "visible") await refresh();

        tick();
      }, REFRESH_MS);
    }

    // Coming back to the tab should show the current state at once, rather
    // than whatever was true when it was last in front.
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

  function chooseTag(tag: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (tag) params.set("tag", tag);
    else params.delete("tag");

    router.push(`/dashboard/conversations${params.toString() ? `?${params}` : ""}`);
  }

  const waiting = rows.filter((row) => row.escalatedAt).length;

  return (
    <div className="space-y-4">
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-secondary">Filter by tag:</span>
          <button
            type="button"
            onClick={() => chooseTag("")}
            aria-pressed={!activeTag}
            className={[
              "rounded-full border px-3 py-1 text-xs transition-colors",
              !activeTag
                ? "border-primary/40 bg-primary/10 text-text-primary"
                : "border-border text-text-secondary hover:bg-surface-elevated",
            ].join(" ")}
          >
            All
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => chooseTag(tag)}
              aria-pressed={activeTag === tag}
              className={[
                "rounded-full border px-3 py-1 text-xs transition-colors",
                activeTag === tag
                  ? "border-primary/40 bg-primary/10 text-text-primary"
                  : "border-border text-text-secondary hover:bg-surface-elevated",
              ].join(" ")}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* An account still waiting for its first message is watching for it too, so
          this state polls like any other rather than being a dead screen that needs
          reloading the moment somebody finally writes in. */}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface/50 p-8">
          <h2 className="text-h3 font-semibold text-text-primary">
            {activeTag ? "No conversations with this tag" : "Nothing yet"}
          </h2>
          <p className="mt-2 max-w-[62ch] text-pretty text-small leading-relaxed text-text-secondary">
            {activeTag
              ? "Try a different tag, or clear the filter to see everything."
              : "Once your WhatsApp number is connected and somebody messages it, the conversation shows up here with whatever your agent replied. You don't need to refresh — this page is watching."}
          </p>
          {!activeTag && (
            <Link
              href="/dashboard/connect-whatsapp"
              className="mt-4 inline-block text-small text-primary underline underline-offset-4"
            >
              Connect WhatsApp
            </Link>
          )}
        </div>
      ) : (
        <>
          {waiting > 0 && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-small text-text-primary">
              {waiting === 1
                ? "1 conversation is waiting for you."
                : `${waiting} conversations are waiting for you.`}{" "}
              Your agent has stopped replying in {waiting === 1 ? "it" : "them"} so
              it doesn&rsquo;t talk over you.
            </p>
          )}

          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/dashboard/conversations/${row.id}`}
                  className="block px-5 py-4 transition-colors hover:bg-surface-elevated"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="flex items-center gap-2 font-medium text-text-primary">
                      {row.contactName?.trim() ||
                        (shouldMaskPhone
                          ? maskPhone(row.contactPhone)
                          : `+${row.contactPhone}`)}

                      {row.unreadCount > 0 && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
                          {row.unreadCount}
                        </span>
                      )}
                    </span>

                    <span
                      className="text-small text-text-secondary"
                      suppressHydrationWarning
                    >
                      {formatWhen(new Date(row.lastMessageAt))}
                    </span>
                  </div>

                  {row.preview && (
                    <p className="mt-1 line-clamp-1 text-small text-text-secondary">
                      {!row.preview.fromCustomer && (
                        <span className="text-text-disabled">You: </span>
                      )}
                      {row.preview.body}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {row.escalatedAt && (
                      <span className="inline-block rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning">
                        {row.escalatedBy === "HUMAN"
                          ? "You're handling this"
                          : "Waiting for you"}
                      </span>
                    )}

                    {row.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-block rounded-full bg-surface-elevated px-2.5 py-0.5 text-xs text-text-secondary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <p className="text-xs text-text-secondary">
            This list keeps itself up to date while you have it open.
          </p>
        </>
      )}
    </div>
  );
}

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
import { useCallback, useEffect, useRef, useState } from "react";

import type { InboxRow } from "@/lib/conversations";
import { formatWhen } from "@/lib/format-when";

/** How often the list re-asks, while somebody is actually looking at it. */
const REFRESH_MS = 10_000;

export function InboxList({ initial }: { initial: InboxRow[] }) {
  const [rows, setRows] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/conversations");

      if (!response.ok) return;

      const payload = (await response.json()) as { conversations: InboxRow[] };

      setRows(payload.conversations);
    } catch {
      // A dropped poll is not worth interrupting anyone over — the next one
      // picks it up, and the list on screen is still the last true thing we
      // knew.
    }
  }, []);

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

  const waiting = rows.filter((row) => row.escalatedAt).length;

  // An account still waiting for its first message is watching for it too, so
  // this state polls like any other rather than being a dead screen that needs
  // reloading the moment somebody finally writes in.
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface/50 p-8">
        <h2 className="text-h3 font-semibold text-text-primary">Nothing yet</h2>
        <p className="mt-2 max-w-[62ch] text-pretty text-small leading-relaxed text-text-secondary">
          Once your WhatsApp number is connected and somebody messages it, the
          conversation shows up here with whatever your agent replied. You
          don&rsquo;t need to refresh — this page is watching.
        </p>
        <Link
          href="/dashboard/connect-whatsapp"
          className="mt-4 inline-block text-small text-primary underline underline-offset-4"
        >
          Connect WhatsApp
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
                  {row.contactName?.trim() || `+${row.contactPhone}`}

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

              {row.escalatedAt && (
                <span className="mt-2 inline-block rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning">
                  {row.escalatedBy === "HUMAN"
                    ? "You're handling this"
                    : "Waiting for you"}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-xs text-text-secondary">
        This list keeps itself up to date while you have it open.
      </p>
    </div>
  );
}

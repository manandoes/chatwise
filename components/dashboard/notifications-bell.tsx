"use client";

// The bell in the top bar: someone mentioned you in a team note, handed you a
// conversation, or a customer needs attention. Opening one takes you to the
// conversation and marks it read.

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatWhen } from "@/lib/format-when";

type Item = { id: string; kind: "MENTION" | "ASSIGNED" | "URGENT"; conversationId: string | null; text: string; read: boolean; at: string };

/** Often enough to notice a mention within a minute; rare enough to cost nothing. */
const REFRESH_MS = 30_000;

export function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const box = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications");

      if (!response.ok) return;

      const payload = (await response.json()) as { unread: number; items: Item[] };

      setUnread(payload.unread);
      setItems(payload.items);
    } catch {
      // The next check picks it up.
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);

    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  // Closes when clicking anywhere else.
  useEffect(() => {
    if (!open) return;

    function onClick(event: MouseEvent) {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", onClick);

    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function markRead(body: { ids: string[] } | { all: true }) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
    await load();
  }

  async function openItem(item: Item) {
    setOpen(false);

    if (!item.read) void markRead({ ids: [item.id] });
    if (item.conversationId) router.push(`/dashboard/conversations/${item.conversationId}`);
  }

  return (
    <div className="relative" ref={box}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-error px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[90vw] rounded-lg border border-border bg-surface-elevated shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <p className="text-small font-medium text-text-primary">Notifications</p>
            {unread > 0 && (
              <button type="button" className="text-xs text-primary underline" onClick={() => markRead({ all: true })}>
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-small text-text-secondary">
              Nothing yet. You&apos;ll see mentions, conversations handed to you and urgent customers here.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={`block w-full px-4 py-3 text-left transition-colors hover:bg-surface ${item.read ? "" : "bg-primary/5"}`}
                  >
                    <p className={`text-small ${item.read ? "text-text-secondary" : "text-text-primary"}`}>
                      {item.kind === "URGENT" && <span className="font-medium text-error">Urgent: </span>}
                      {item.text}
                    </p>
                    <p className="text-xs text-text-secondary" suppressHydrationWarning>
                      {formatWhen(new Date(item.at))}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

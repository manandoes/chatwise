"use client";

// The dashboard's left sidebar (Design.md §4 — fixed, 240px).
//
// On small screens it becomes a slide-in panel opened from the top bar, so the
// same navigation serves both without a second copy to keep in step.

import { X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavIcon } from "@/components/dashboard/nav-icon";
import { NAV_GROUPS } from "@/components/dashboard/nav-items";
import { ConnectionBadge } from "@/components/dashboard/connection-badge";
import { Button } from "@/components/ui/button";

export function Sidebar({
  connection,
  isOpen,
  onClose,
}: {
  connection: { type: "QR" | "API"; status: string } | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Dimmed backdrop behind the slide-in panel on small screens. */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-sidebar flex-col border-r border-border bg-surface transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Dashboard"
      >
        <div className="flex h-topbar shrink-0 items-center justify-between px-5">
          <Link href="/dashboard" className="rounded-md text-h3 font-semibold">
            Chat<span className="text-primary">Wise</span>
          </Link>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.heading} className="mt-5 first:mt-1">
              <h2 className="px-2 pb-2 text-label uppercase text-text-disabled">
                {group.heading}
              </h2>

              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isCurrent =
                    pathname === item.href ||
                    (item.href !== "/dashboard" &&
                      pathname.startsWith(`${item.href}/`));

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={isCurrent ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-md px-2.5 py-2 text-small transition-colors ${
                          isCurrent
                            ? "bg-surface-elevated text-text-primary"
                            : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                        }`}
                      >
                        <NavIcon
                          name={item.icon}
                          className={`size-4 shrink-0 ${
                            isCurrent ? "text-primary" : ""
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-border p-3">
          <ConnectionBadge connection={connection} />
        </div>
      </aside>
    </>
  );
}

"use client";

// Holds the dashboard's layout together: the sidebar, the top bar, and the
// scrollable content area (Design.md §4).
//
// This is a client component only because the sidebar has to open and close on
// small screens. Everything inside it is still rendered on the server and
// passed through as children.

import { Menu } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Sidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";

export function DashboardShell({
  connection,
  userMenu,
  children,
}: {
  connection: { type: "QR" | "API"; status: string } | null;
  /** Rendered on the server — who's signed in, and the log-out button. */
  userMenu: ReactNode;
  children: ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex flex-1">
      <Sidebar
        connection={connection}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col lg:pl-sidebar">
        <header className="sticky top-0 z-30 flex h-topbar shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu />
            </Button>

            <span className="truncate text-h3 font-semibold lg:hidden">
              Chat<span className="text-primary">Wise</span>
            </span>
          </div>

          {userMenu}
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}

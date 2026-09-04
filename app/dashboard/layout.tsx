// The dashboard frame: sidebar, top bar, content area (Design.md §4).
//
// Everything behind the login sits inside this. The sidebar's live connection
// status is read here on the server and handed down, so no screen has to fetch
// it for itself.

import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";
import { requireUser, signOut } from "@/lib/auth";
import { getOnboardingState, pathForStep } from "@/lib/onboarding";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();

  // Nothing in the dashboard means anything until setup is done, so anyone
  // part-way through goes back to the step they left off at. (The setup screens
  // send finished accounts the other way, so these two can't bounce forever.)
  const state = await getOnboardingState(user.id);
  if (!state.isComplete) redirect(pathForStep(state.nextStep));

  const userMenu = (
    <div className="flex items-center gap-3">
      <Link
        href="/dashboard/settings"
        className="hidden rounded-md text-small text-text-secondary transition-colors hover:text-text-primary sm:block"
      >
        {user.name || user.email}
      </Link>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <Button type="submit" variant="outline" size="sm">
          Log out
        </Button>
      </form>
    </div>
  );

  return (
    <DashboardShell
      connection={
        state.connection
          ? { type: state.connection.type, status: state.connection.status }
          : null
      }
      userMenu={userMenu}
    >
      {children}
    </DashboardShell>
  );
}

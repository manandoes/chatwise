// Accepting an invitation to somebody's team.
//
// Reachable signed out on purpose: the person following the link may not
// have an account yet, so they are offered sign-in and sign-up with a way
// back here afterwards.

import type { Metadata } from "next";
import Link from "next/link";

import { JoinTeamButton } from "@/components/dashboard/join-team-button";
import { auth } from "@/lib/auth";
import { findOpenInvite } from "@/lib/team";

export const metadata: Metadata = { title: "Join a team" };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [session, invite] = await Promise.all([auth(), findOpenInvite(token)]);
  const back = encodeURIComponent(`/join/${token}`);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      {!invite ? (
        <>
          <h1 className="text-h2 font-bold text-text-primary">This invitation can&rsquo;t be used</h1>
          <p className="text-text-secondary">
            It has expired, was withdrawn, or has already been accepted. Ask whoever sent it for a
            new link.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-h2 font-bold text-text-primary">
            Join {invite.business.name ?? "this team"} on ChatWise
          </h1>
          <p className="text-text-secondary">
            You&rsquo;ve been invited as {invite.role === "OWNER" ? "an owner" : "a team member"}.
            The invitation is for <strong className="text-text-primary">{invite.email}</strong>.
          </p>

          {session?.user ? (
            <JoinTeamButton token={token} />
          ) : (
            <div className="flex gap-3">
              <Link
                href={`/login?next=${back}`}
                className="rounded-md bg-primary px-4 py-2 text-small font-medium text-primary-foreground"
              >
                Log in to accept
              </Link>
              <Link
                href={`/signup?next=${back}`}
                className="rounded-md border border-border px-4 py-2 text-small font-medium text-text-primary"
              >
                Create an account
              </Link>
            </div>
          )}
        </>
      )}
    </main>
  );
}

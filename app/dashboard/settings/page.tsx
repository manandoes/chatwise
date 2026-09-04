// Settings — the account/profile shell.
//
// Phase 1 shows the account details we already hold and how the person signs
// in. Editing the profile, notification preferences and team members come in
// later phases.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const sessionUser = await requireUser();

  // Read by the signed-in user's own id — never an id taken from the URL or the
  // request body (docs/Rules.md §3).
  const user = await db.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      name: true,
      email: true,
      createdAt: true,
      passwordHash: true,
      accounts: { select: { provider: true } },
    },
  });

  // The session cookie outlived the account it points at — e.g. the account was
  // deleted while the browser still had a valid cookie.
  if (!user) notFound();

  const signInMethods = [
    ...(user.passwordHash ? ["Email and password"] : []),
    ...user.accounts.map((account) =>
      account.provider === "google" ? "Google" : account.provider,
    ),
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Your account details. Team members and notification preferences come later."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-h3">Your profile</CardTitle>
          <CardDescription>
            How ChatWise knows you. Editing these comes in a later update.
          </CardDescription>
        </CardHeader>

        <CardContent className="divide-y divide-border">
          <DetailRow label="Name" value={user.name || "Not set"} />
          <DetailRow label="Email" value={user.email} />
          <DetailRow
            label="You sign in with"
            value={signInMethods.join(" and ") || "Not set"}
          />
          <DetailRow
            label="Member since"
            value={user.createdAt.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          />
        </CardContent>
      </Card>

    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-6">
      <span className="text-label uppercase text-text-secondary sm:w-48 sm:shrink-0">
        {label}
      </span>
      <span className="text-text-primary">{value}</span>
    </div>
  );
}

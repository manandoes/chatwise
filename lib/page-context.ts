// What every dashboard page needs to know about who is looking.
//
// The signed-in user, the business they work in, and their role in it —
// looked up through their team membership (lib/team.ts), so a team member
// sees the business that invited them.

import "server-only";

import { requireUser } from "@/lib/auth";
import { getOnboardingState } from "@/lib/onboarding";
import { findMembership } from "@/lib/team";

export async function requirePageContext() {
  const user = await requireUser();
  const { business } = await getOnboardingState(user.id);
  const membership = await findMembership(user.id);

  return {
    user,
    business,
    role: membership?.role ?? "OWNER",
    memberId: membership?.memberId ?? null,
    isOwner: (membership?.role ?? "OWNER") === "OWNER",
  };
}

// The paywall — shown to anyone who is signed in but has no active subscription.
//
// This is the chokepoint between signing up and actually using the product.
// Two plans are shown side by side, and picking one takes the user to the
// billing flow (which starts a Razorpay subscription and waits for payment).
//
// If the user is not yet signed in, they are redirected to /signup instead,
// because an unauthenticated person has no business being on this page.

import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { PricingPlans } from "@/components/marketing/pricing-plans";
import { requireUser } from "@/lib/auth";
import { readAccountPlan } from "@/lib/subscription";
import { isPaidPlan } from "@/lib/plans";
import { findMembership } from "@/lib/team";

export const metadata: Metadata = {
  title: "Pick a plan to continue",
  description:
    "Your account is ready. Choose a plan to start using your WhatsApp agent, campaigns, and inbox.",
};

export default async function PaywallPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const membership = await findMembership(user.id);

  // Safety net: if for some reason the middleware didn't catch this, redirect
  // to signup so the flow stays clean.
  if (!membership) redirect("/signup");

  const account = await readAccountPlan(membership.businessId);

  // Already on a plan — shouldn't happen because middleware gates this, but
  // being defensive doesn't hurt.
  if (isPaidPlan(account.plan)) redirect("/dashboard");

  const searchParams = await props.searchParams;
  const next =
    (typeof searchParams.next === "string" ? searchParams.next : undefined) ??
    "/dashboard";

  return (
    <div className="mx-auto w-full max-w-content px-6 py-16 lg:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-balance text-[clamp(2rem,4vw,2.75rem)] font-bold leading-tight tracking-[-0.02em] text-text-primary">
          Pick a plan to unlock ChatWise
        </h1>
        <p className="mt-4 text-pretty text-[1.0625rem] leading-relaxed text-text-secondary">
          Your account is created and your business profile is ready. Choose a
          plan below and you'll be able to connect WhatsApp, set up your agent,
          and start answering customers right away.
        </p>
      </div>

      <div className="mt-12">
        <PricingPlans paywall />
      </div>

      <p className="mt-8 text-center text-small text-text-secondary">
        Need help picking?{" "}
        <a href="/faq" className="text-primary hover:underline">
          Read the FAQ
        </a>
        .
      </p>
    </div>
  );
}

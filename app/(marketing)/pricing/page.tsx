import { Info } from "lucide-react";
import type { Metadata } from "next";

import { CtaBand } from "@/components/marketing/cta-band";
import { PricingPlans } from "@/components/marketing/pricing-plans";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "One agent, one WhatsApp connection, one simple choice: a free QR connection, or the official WhatsApp Business API.",
};

export default function PricingPage() {
  return (
    <>
      <section className="mx-auto w-full max-w-content px-6 py-16 lg:py-20">
        <div className="max-w-[62ch]">
          <h1 className="text-balance text-[clamp(2rem,4vw,2.75rem)] font-bold leading-tight tracking-[-0.02em] text-text-primary">
            Pay for the connection, not per agent
          </h1>
          <p className="mt-5 text-pretty text-[1.0625rem] leading-relaxed text-text-secondary">
            Every account runs one agent, so there is nothing to add up. The only
            real decision is how your number connects to WhatsApp — and one of
            those options costs nothing.
          </p>
        </div>

        {/* Deliberate placeholder: final pricing is an open decision in
            docs/PRD.md §10. */}
        <div className="mt-8 flex max-w-[70ch] gap-3 rounded-lg border border-info/30 bg-info/5 p-4">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
          <p className="text-pretty text-small leading-relaxed text-text-secondary">
            <span className="font-medium text-text-primary">
              Business API pricing is still being finalised.
            </span>{" "}
            The free plan is live and genuinely free. Create an account now and
            start on the free tier — you can move across later.
          </p>
        </div>

        <div className="mt-12">
          <PricingPlans />
        </div>

        <div className="mt-14 grid gap-10 border-t border-border pt-10 sm:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="font-semibold text-text-primary">
              Why is there a per-message cost on the paid plan?
            </h2>
            <p className="mt-2 text-pretty text-small leading-relaxed text-text-secondary">
              Meta charges for messages sent over the official WhatsApp Business
              API. That is their charge, not ours, and it is passed through to
              you. The free plan avoids it entirely because it uses the same
              connection your phone does.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-text-primary">
              Need a second agent?
            </h2>
            <p className="mt-2 text-pretty text-small leading-relaxed text-text-secondary">
              That means a second account. Keeping it to one agent per account is
              what makes it obvious which one replied to a customer, and it keeps
              the setup something you can hold in your head.
            </p>
          </div>
        </div>
      </section>

      <CtaBand
        heading="Start on the free plan"
        body="No card, no Meta application. Scan a QR code and your agent is answering."
        secondary={{ href: "/faq", label: "Read the FAQ" }}
      />
    </>
  );
}

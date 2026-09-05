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
            One agent, one number, four sizes
          </h1>
          <p className="mt-5 text-pretty text-[1.0625rem] leading-relaxed text-text-secondary">
            Every plan runs one agent on one WhatsApp number, so there is nothing
            to add up per seat or per bot. What changes is how much you send, how
            far back your history goes, and whether you use the official WhatsApp
            Business API. Start free — no card.
          </p>
        </div>

        <div className="mt-8 flex max-w-[70ch] gap-3 rounded-lg border border-info/30 bg-info/5 p-4">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
          <p className="text-pretty text-small leading-relaxed text-text-secondary">
            <span className="font-medium text-text-primary">
              Prices are in rupees, billed monthly.
            </span>{" "}
            Move up or down whenever you like — moving up takes effect straight
            away, and moving down waits until the month you&rsquo;ve paid for has
            finished. On the Growth and Pro plans, Meta also charges per message
            for the official API; that is their charge, passed through.
          </p>
        </div>

        <div className="mt-12">
          <PricingPlans />
        </div>

        <div className="mt-14 grid gap-10 border-t border-border pt-10 sm:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="font-semibold text-text-primary">
              What happens if I run out of messages?
            </h2>
            <p className="mt-2 text-pretty text-small leading-relaxed text-text-secondary">
              Your agent stops replying by itself and hands those conversations
              to you, so nobody is left in silence. You can still answer anyone
              by hand from the inbox — that is never limited — and moving up a
              plan takes effect immediately.
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

import { Info } from "lucide-react";
import type { Metadata } from "next";

import { CtaBand } from "@/components/marketing/cta-band";
import { PricingPlans } from "@/components/marketing/pricing-plans";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "One agent, one WhatsApp connection, one simple choice: a QR connection with no per-message cost, or the official WhatsApp Business API with Meta's charges on top.",
};

export default function PricingPage() {
  return (
    <>
      <section className="mx-auto w-full max-w-content px-6 py-16 lg:py-20">
        <div className="max-w-[62ch]">
          <h1 className="text-balance text-[clamp(2rem,4vw,2.75rem)] font-bold leading-tight tracking-[-0.02em] text-text-primary">
            One agent, one number, two ways to connect
          </h1>
          <p className="mt-5 text-pretty text-[1.0625rem] leading-relaxed text-text-secondary">
            There are two plans, one for each way of connecting to WhatsApp —
            and nothing else to work out. Both run one agent on one WhatsApp
            number, so there is nothing to add up per seat or per bot. Pick the
            connection that suits your business and that is your plan.
          </p>
        </div>

        <div className="mt-8 flex max-w-[70ch] gap-3 rounded-lg border border-info/30 bg-info/5 p-4">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
          <p className="text-pretty text-small leading-relaxed text-text-secondary">
            <span className="font-medium text-text-primary">
              Prices are in rupees, billed monthly.
            </span>{" "}
            Switch between the two whenever you like — moving up takes effect
            straight away, and moving down waits until the month you&rsquo;ve
            paid for has finished. On Small Business this price is your whole
            bill. On Enterprise, Meta charges you per conversation on top,
            billed by Meta to your own Meta account at their rates — we never
            see that money and cannot quote it for you.
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
        heading="Start on Small Business"
        body="No Meta application, and nothing charged per message. Scan a QR code and your agent is answering."
        secondary={{ href: "/faq", label: "Read the FAQ" }}
      />
    </>
  );
}

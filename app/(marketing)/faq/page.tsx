import type { Metadata } from "next";

import { CtaBand } from "@/components/marketing/cta-band";
import { FAQ_GROUPS, FaqList } from "@/components/marketing/faq-list";

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description:
    "How ChatWise connects to WhatsApp, what the agents can and can't do, the limits on bulk messaging, and how your data is kept separate.",
};

export default function FaqPage() {
  return (
    <>
      <section className="mx-auto w-full max-w-content px-6 py-16 lg:py-20">
        <div className="max-w-[62ch]">
          <h1 className="text-balance text-[clamp(2rem,4vw,2.75rem)] font-bold leading-tight tracking-[-0.02em] text-text-primary">
            Questions, answered straight
          </h1>
          <p className="mt-5 text-pretty text-[1.0625rem] leading-relaxed text-text-secondary">
            Including the awkward ones. If something here isn&rsquo;t clear,
            it&rsquo;s better you know before you connect your number than after.
          </p>
        </div>

        <div className="mt-14">
          <FaqList groups={FAQ_GROUPS} />
        </div>
      </section>

      <CtaBand
        heading="Still deciding?"
        body="Small Business takes minutes to set up and charges nothing per message. It's the fastest way to find out whether this works for you."
        secondary={{ href: "/features", label: "See what it does" }}
      />
    </>
  );
}

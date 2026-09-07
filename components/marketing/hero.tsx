import Link from "next/link";

import { ConversationPreview } from "@/components/marketing/conversation-preview";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Decorative glow behind the fold. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-64 left-1/2 size-[44rem] -translate-x-1/2 rounded-full bg-primary/8 blur-[140px]"
      />

      <div className="relative mx-auto grid w-full max-w-content items-center gap-14 px-6 py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-24">
        <div>
          <h1 className="max-w-[18ch] text-balance text-[clamp(2.25rem,5vw,3.25rem)] font-bold leading-[1.08] tracking-[-0.02em] text-text-primary">
            Your WhatsApp, answered while you get on with work.
          </h1>

          <p className="mt-6 max-w-[58ch] text-pretty text-[1.0625rem] leading-relaxed text-text-secondary">
            Pick a ready-made agent — a receptionist, a lead qualifier, a sales
            assistant — connect your own WhatsApp number, and it starts replying
            to customers. Every chat, contact and lead lands in one dashboard.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <Link href="/signup">Get started</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>

          <p className="mt-5 text-pretty text-small text-text-secondary">
            Small businesses connect by scanning a QR code — no Meta
            application, and no per-message fee on top of your plan.
          </p>
        </div>

        <ConversationPreview />
      </div>
    </section>
  );
}

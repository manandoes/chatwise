import Link from "next/link";

import { Button } from "@/components/ui/button";

export function CtaBand({
  heading = "Put your WhatsApp on autopilot",
  body = "Create an account, pick your agent, and scan a QR code. You can be answering customers today.",
  secondary = { href: "/faq", label: "Read the FAQ" },
}: {
  heading?: string;
  body?: string;
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="relative overflow-hidden border-t border-border">
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-72 left-1/2 size-[40rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[140px]"
      />

      <div className="relative mx-auto w-full max-w-content px-6 py-20 text-center lg:py-28">
        <h2 className="mx-auto max-w-[24ch] text-balance text-h1 font-bold tracking-tight text-text-primary">
          {heading}
        </h2>
        <p className="mx-auto mt-4 max-w-[56ch] text-pretty text-text-secondary">
          {body}
        </p>

        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/signup">Get started free</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href={secondary.href}>{secondary.label}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

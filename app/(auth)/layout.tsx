// The frame around the log-in and sign-up screens: centred card, the ChatWise
// wordmark above it, and the soft green glow in the background (Design.md §7).

import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-16">
      {/* Blurred green orbs. Decorative only, so hidden from screen readers. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[32rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-52 -right-32 size-[28rem] rounded-full bg-primary/5 blur-[120px]"
      />

      <div className="relative w-full max-w-md">
        <Link
          href="/"
          className="mx-auto mb-8 block w-fit rounded-md text-h2 font-semibold text-text-primary"
        >
          Chat<span className="text-primary">Wise</span>
        </Link>

        {children}
      </div>
    </div>
  );
}

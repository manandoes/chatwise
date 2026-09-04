// The page for an address that doesn't exist.

import { Compass } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-md text-center">
        <Compass aria-hidden className="mx-auto size-8 text-text-secondary" />

        <h1 className="mt-6 text-h2 font-semibold text-text-primary">
          We couldn&rsquo;t find that page
        </h1>

        <p className="mt-3 text-pretty leading-relaxed text-text-secondary">
          The link may be out of date, or the address might have a typo in it.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/">Back to the homepage</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/dashboard">Go to your dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

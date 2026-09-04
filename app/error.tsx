"use client";

// What someone sees when something breaks.
//
// Never a stack trace or a blank screen (docs/Rules.md §4) — a plain sentence,
// a way to try again, and a reference number they can quote to support. The
// real error is logged on the server, where developers can find it.

import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-md text-center">
        <AlertTriangle
          aria-hidden
          className="mx-auto size-8 text-warning"
        />

        <h1 className="mt-6 text-h2 font-semibold text-text-primary">
          Something went wrong
        </h1>

        <p className="mt-3 text-pretty leading-relaxed text-text-secondary">
          That&rsquo;s on us, not you. Nothing you&rsquo;d already saved has been
          lost — try again, and if it keeps happening, get in touch.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button type="button" size="lg" onClick={reset}>
            Try again
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/">Back to the homepage</Link>
          </Button>
        </div>

        {error.digest && (
          <p className="mt-8 text-small text-text-secondary">
            If you contact us, quote this:{" "}
            <span className="font-mono text-text-primary">{error.digest}</span>
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

// Cancelling a plan.
//
// The confirmation says the thing people are most afraid of and most often get
// wrong: cancelling does not switch anything off today. The month already paid
// for is theirs, and the agent keeps answering until it ends (docs/Rules.md §7).

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function CancelSubscriptionButton({
  /** When the paid period runs out, already in words. Null if unknown. */
  endsOn,
}: {
  endsOn: string | null;
}) {
  const router = useRouter();
  const [isAsking, setIsAsking] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setError(null);
    setIsCancelling(true);

    try {
      const response = await fetch("/api/billing/subscription", {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);

        setError(
          payload?.error?.message ?? "We couldn't cancel that. Try again.",
        );

        return;
      }

      setIsAsking(false);
      router.refresh();
    } catch {
      setError("We couldn't reach ChatWise. Check your connection.");
    } finally {
      setIsCancelling(false);
    }
  }

  if (!isAsking) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="ghost" onClick={() => setIsAsking(true)}>
          Cancel my plan
        </Button>

        {error && <p className="text-small text-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="max-w-[56ch] text-pretty text-small leading-relaxed text-text-primary">
        Nothing switches off today. You keep everything until{" "}
        {endsOn ?? "the end of the month you've paid for"}, and then your agent
        stops sending until you pick a plan again. Your conversations, leads and
        knowledge base all stay where they are.
      </p>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="destructive"
          onClick={cancel}
          disabled={isCancelling}
        >
          {isCancelling && <LoaderCircle className="size-4 animate-spin" />}
          Yes, cancel
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() => setIsAsking(false)}
          disabled={isCancelling}
        >
          Keep my plan
        </Button>
      </div>

      {error && <p className="text-small text-error">{error}</p>}
    </div>
  );
}

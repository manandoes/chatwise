"use client";

// Stopping a campaign that is still going out.
//
// The confirmation says what this can and cannot do, because the difference
// matters and people assume the wrong one: messages already sent are gone for
// good, and stopping only spares the people who haven't been reached yet
// (docs/Rules.md §7).

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function CancelCampaignButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [isAsking, setIsAsking] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function stop() {
    setError(null);
    setIsStopping(true);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);

        setError(payload?.error?.message ?? "We couldn't stop it. Try again.");

        return;
      }

      setIsAsking(false);
      router.refresh();
    } catch {
      setError("We couldn't reach ChatWise. Check your connection.");
    } finally {
      setIsStopping(false);
    }
  }

  if (!isAsking) {
    return (
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsAsking(true)}
        >
          Stop this campaign
        </Button>

        {error && <p className="text-small text-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="max-w-[52ch] text-pretty text-small leading-relaxed text-text-primary">
        Anyone who has already been messaged stays messaged — that can&rsquo;t
        be undone. Stopping means nobody else on the list will hear from you.
      </p>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="destructive"
          onClick={stop}
          disabled={isStopping}
        >
          {isStopping && <LoaderCircle className="size-4 animate-spin" />}
          Yes, stop it
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() => setIsAsking(false)}
          disabled={isStopping}
        >
          Keep sending
        </Button>
      </div>

      {error && <p className="text-small text-error">{error}</p>}
    </div>
  );
}

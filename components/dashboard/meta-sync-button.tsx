"use client";

// "Check with Meta" on the Templates screen: reads each template's real
// approval status from Meta instead of the owner setting it by hand.

import { LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/client-api";

type SyncResult = { updated: number; imported: number; skippedNoOptOut: number };

export function MetaSyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setNote(null);

    const result = await callApi<SyncResult>("/api/templates/sync", { method: "POST" });

    setBusy(false);

    if (!result.ok) {
      setNote(result.message);
      return;
    }

    const { updated, imported, skippedNoOptOut } = result.data;
    const parts = [`${updated} checked`];

    if (imported) parts.push(`${imported} approved template${imported === 1 ? "" : "s"} brought in`);
    if (skippedNoOptOut) {
      parts.push(
        `${skippedNoOptOut} left out because ${skippedNoOptOut === 1 ? "it doesn't" : "they don't"} tell people how to opt out`,
      );
    }

    setNote(`Done: ${parts.join(", ")}.`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" onClick={sync} disabled={busy}>
        {busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
        Check with Meta
      </Button>
      <p className="text-small text-text-secondary">
        {note ?? "We also check automatically every six hours."}
      </p>
    </div>
  );
}

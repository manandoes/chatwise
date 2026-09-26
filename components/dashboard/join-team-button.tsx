"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorNote } from "@/components/dashboard/form-bits";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/client-api";

export function JoinTeamButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);

    const result = await callApi("/api/team/join", { body: { token } });

    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      return;
    }

    router.push("/dashboard/conversations");
  }

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />
      <Button type="button" onClick={join} disabled={busy}>
        {busy && <LoaderCircle className="animate-spin" />}
        Accept and join
      </Button>
    </div>
  );
}

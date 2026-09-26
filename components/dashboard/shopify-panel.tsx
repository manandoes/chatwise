"use client";

// Connecting, watching and disconnecting the account's Shopify store.
//
// Connecting is an ordinary form that goes to /api/shopify/install, which
// hands over to Shopify's own approval screen — so it works even before any
// JavaScript has loaded.

import { CheckCircle2, LoaderCircle, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorNote, Pill } from "@/components/dashboard/form-bits";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi } from "@/lib/client-api";

type ShopSummary = {
  shopDomain: string;
  active: boolean;
  connectedWhen: string;
  webhooksReady: boolean;
  webhookError: string | null;
  backfillStatus: string | null;
  backfilledWhen: string | null;
};

export function ShopifyPanel({
  available,
  result,
  prefillShop,
  shop,
}: {
  available: boolean;
  result: { tone: "good" | "bad"; text: string } | null;
  prefillShop: string;
  shop: ShopSummary | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    if (!window.confirm("Disconnect this store? Order updates and cart reminders will stop. Your contacts and order history stay.")) {
      return;
    }

    setBusy(true);
    setError(null);

    const response = await callApi("/api/shopify/disconnect", { method: "POST" });

    setBusy(false);

    if (!response.ok) setError(response.message);
    else router.refresh();
  }

  const banner = result && (
    <Alert variant={result.tone === "bad" ? "destructive" : "default"}>
      {result.tone === "good" ? <CheckCircle2 /> : null}
      <AlertDescription>{result.text}</AlertDescription>
    </Alert>
  );

  if (shop?.active) {
    return (
      <div className="space-y-4">
        {banner}
        <ErrorNote message={error} />

        <div className="flex flex-wrap items-start gap-4 rounded-lg border border-border bg-surface p-5">
          <Store className="mt-0.5 size-5 text-primary" aria-hidden />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-text-primary">{shop.shopDomain}</p>
              <Pill tone={shop.webhookError ? "warn" : "good"}>
                {shop.webhookError ? "Needs attention" : "Connected"}
              </Pill>
            </div>
            <p className="text-small text-text-secondary">Connected {shop.connectedWhen}.</p>

            {shop.webhookError ? (
              <p className="text-small text-warning">{shop.webhookError}</p>
            ) : (
              <p className="text-small text-text-secondary">
                {shop.webhooksReady
                  ? "Receiving new orders, checkouts and customers as they happen."
                  : "Setting up live updates from your store…"}
              </p>
            )}

            <p className="text-small text-text-secondary">
              {shop.backfillStatus === "Done"
                ? `Past customers, orders and products imported ${shop.backfilledWhen ?? ""}.`
                : `Importing your history: ${shop.backfillStatus ?? "waiting to start"}.`}
            </p>
          </div>

          <Button type="button" variant="outline" onClick={disconnect} disabled={busy}>
            {busy && <LoaderCircle className="animate-spin" />}
            Disconnect
          </Button>
        </div>
      </div>
    );
  }

  if (!available) {
    return (
      <div className="space-y-4">
        {banner}
        <p className="text-small text-text-secondary">
          Shopify isn&apos;t switched on for this ChatWise installation yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {banner}

      {shop && !shop.active && (
        <p className="text-small text-text-secondary">
          {shop.shopDomain} was disconnected. Its contacts and orders are still here; connect it
          again to pick up where you left off.
        </p>
      )}

      <form
        method="get"
        action="/api/shopify/install"
        className="flex max-w-xl flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-5"
      >
        <div className="min-w-60 flex-1 space-y-2">
          <Label htmlFor="shopify-shop">Your store</Label>
          <Input
            id="shopify-shop"
            name="shop"
            required
            defaultValue={prefillShop || shop?.shopDomain || ""}
            placeholder="your-store.myshopify.com"
            autoComplete="off"
          />
          <p className="text-xs text-text-secondary">
            The address ending in .myshopify.com — find it in Shopify under Settings → Domains.
          </p>
        </div>
        <Button type="submit">Connect Shopify</Button>
      </form>
    </div>
  );
}

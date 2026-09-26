// Starts connecting a Shopify store: GET /api/shopify/install?shop=example
//
// Sends the owner to Shopify's "install ChatWise?" screen. Somebody not signed
// in goes to the login screen first and comes back to the Integrations page
// with the store name filled in. Only the account owner may connect a store.
//
// Any failure lands back on Integrations with a plain-English reason in the
// address, never a raw error (docs/Rules.md §4).

import { NextResponse } from "next/server";

import { getApiUser } from "@/lib/auth";
import { isFeatureEnabled, publicAppUrl } from "@/lib/features";
import { findMembership } from "@/lib/team";
import { authorizeUrl, isShopifyConfigured, normalizeShopDomain } from "@/integrations/shopify/client";
import { beginShopifyOAuth } from "@/integrations/shopify/oauth-state";

export const dynamic = "force-dynamic";

function backToIntegrations(result: string) {
  return NextResponse.redirect(`${publicAppUrl()}/dashboard/integrations?shopify=${result}`);
}

export async function GET(request: Request) {
  try {
    if (!isFeatureEnabled("shopify") || !isShopifyConfigured()) return backToIntegrations("off");

    const shop = normalizeShopDomain(new URL(request.url).searchParams.get("shop"));

    if (!shop) return backToIntegrations("bad-domain");

    const user = await getApiUser();

    if (!user) {
      const next = `/dashboard/integrations?shop=${encodeURIComponent(shop)}`;

      return NextResponse.redirect(`${publicAppUrl()}/login?next=${encodeURIComponent(next)}`);
    }

    const membership = await findMembership(user.id);

    if (!membership) return NextResponse.redirect(`${publicAppUrl()}/onboarding`);
    if (membership.role !== "OWNER") return backToIntegrations("owner-only");

    const state = await beginShopifyOAuth(shop);

    return NextResponse.redirect(authorizeUrl(shop, state, `${publicAppUrl()}/api/shopify/callback`));
  } catch (error) {
    console.error("[shopify/install]", error instanceof Error ? error.message : error);

    return backToIntegrations("error");
  }
}

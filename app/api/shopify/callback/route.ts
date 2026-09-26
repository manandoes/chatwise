// Where Shopify sends the owner back after they approve ChatWise.
//
// Four checks before anything is stored, each of which alone refuses:
//   1. Shopify's signature on the address (`hmac`) is valid for our app secret.
//   2. The `state` matches the cookie this browser was given on the way out,
//      for the same store (integrations/shopify/oauth-state.ts).
//   3. The person is still signed in and owns the business.
//   4. The store isn't already connected to a different ChatWise account.
//
// Then the one-time code is traded for a token, which is stored encrypted,
// and the set-up jobs are queued (integrations/shopify/connect.ts).

import { NextResponse } from "next/server";

import { getApiUser } from "@/lib/auth";
import { isFeatureEnabled, publicAppUrl } from "@/lib/features";
import { findMembership } from "@/lib/team";
import {
  exchangeCodeForToken,
  isShopifyConfigured,
  normalizeShopDomain,
  verifyOAuthQuery,
} from "@/integrations/shopify/client";
import { saveConnectedShop } from "@/integrations/shopify/connect";
import { finishShopifyOAuth } from "@/integrations/shopify/oauth-state";

export const dynamic = "force-dynamic";

function backToIntegrations(result: string, extra = "") {
  return NextResponse.redirect(`${publicAppUrl()}/dashboard/integrations?shopify=${result}${extra}`);
}

export async function GET(request: Request) {
  try {
    if (!isFeatureEnabled("shopify") || !isShopifyConfigured()) return backToIntegrations("off");

    const query = new URL(request.url).searchParams;
    const shop = normalizeShopDomain(query.get("shop"));

    if (!shop || !verifyOAuthQuery(query)) return backToIntegrations("bad-signature");
    if (!(await finishShopifyOAuth(query.get("state"), shop))) return backToIntegrations("expired");

    const user = await getApiUser();
    const membership = user ? await findMembership(user.id) : null;

    if (!membership) return NextResponse.redirect(`${publicAppUrl()}/login`);
    if (membership.role !== "OWNER") return backToIntegrations("owner-only");

    const code = query.get("code");

    if (!code) return backToIntegrations("error");

    const token = await exchangeCodeForToken(shop, code);

    if (!token.ok) return backToIntegrations("error");

    const saved = await saveConnectedShop({
      businessId: membership.businessId,
      shopDomain: shop,
      accessToken: token.accessToken,
      scopes: token.scope,
    });

    if (!saved.ok) {
      return saved.reason === "owned-elsewhere"
        ? backToIntegrations("owned-elsewhere")
        : backToIntegrations("other-store", `&other=${encodeURIComponent(saved.otherDomain ?? "")}`);
    }

    return backToIntegrations("connected");
  } catch (error) {
    console.error("[shopify/callback]", error instanceof Error ? error.message : error);

    return backToIntegrations("error");
  }
}

// Where Google sends the owner back. Checks the state cookie, trades the code
// for a refresh token, and stores it encrypted against the business.

import { NextResponse } from "next/server";

import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptText } from "@/lib/encryption";
import { isFeatureEnabled, publicAppUrl } from "@/lib/features";
import { finishOAuth, GOOGLE_OAUTH } from "@/lib/oauth-state";
import { findMembership } from "@/lib/team";
import { exchangeGoogleCode, forgetAccessToken, isGoogleConfigured } from "@/integrations/google/client";

export const dynamic = "force-dynamic";

function back(result: string) {
  return NextResponse.redirect(`${publicAppUrl()}/dashboard/integrations?google=${result}#sheets`);
}

export async function GET(request: Request) {
  try {
    if (!isFeatureEnabled("googleSheets") || !isGoogleConfigured()) return back("off");

    const query = new URL(request.url).searchParams;

    // They pressed "Cancel" on Google's screen.
    if (query.get("error")) return back("cancelled");

    const user = await getApiUser();
    const membership = user ? await findMembership(user.id) : null;

    if (!user || membership?.role !== "OWNER") return back("owner-only");
    if (!(await finishOAuth(GOOGLE_OAUTH, query.get("state"), membership.businessId))) return back("expired");

    const code = query.get("code");

    if (!code) return back("error");

    const tokens = await exchangeGoogleCode(code);

    if (!tokens.ok) return back("error");

    if (!tokens.value.refreshToken) return back("no-refresh");

    if (!tokens.value.scopes.includes("https://www.googleapis.com/auth/spreadsheets")) return back("no-scope");

    const data = {
      connectedById: user.id,
      googleEmail: tokens.value.email,
      refreshToken: new Uint8Array(encryptText(tokens.value.refreshToken)),
      scopes: tokens.value.scopes,
    };

    await db.googleConnection.upsert({
      where: { businessId: membership.businessId },
      create: { businessId: membership.businessId, ...data },
      update: data,
    });
    forgetAccessToken(membership.businessId);

    return back("connected");
  } catch (error) {
    console.error("[google/callback]", error instanceof Error ? error.message : error);

    return back("error");
  }
}

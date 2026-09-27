// Starts connecting a Google account for Sheets: GET /api/google/connect
// Owner only — the connection can read and write the business's contacts.

import { NextResponse } from "next/server";

import { getApiUser } from "@/lib/auth";
import { isFeatureEnabled, publicAppUrl } from "@/lib/features";
import { beginOAuth, GOOGLE_OAUTH } from "@/lib/oauth-state";
import { findMembership } from "@/lib/team";
import { googleAuthorizeUrl, isGoogleConfigured } from "@/integrations/google/client";

export const dynamic = "force-dynamic";

function back(result: string) {
  return NextResponse.redirect(`${publicAppUrl()}/dashboard/integrations?google=${result}#sheets`);
}

export async function GET() {
  try {
    if (!isFeatureEnabled("googleSheets") || !isGoogleConfigured()) return back("off");

    const user = await getApiUser();

    if (!user) return NextResponse.redirect(`${publicAppUrl()}/login?next=${encodeURIComponent("/dashboard/integrations")}`);

    const membership = await findMembership(user.id);

    if (membership?.role !== "OWNER") return back("owner-only");

    // Bound to the business, so a redirect finishing in another account's
    // session is refused.
    const state = await beginOAuth(GOOGLE_OAUTH, membership.businessId);

    return NextResponse.redirect(googleAuthorizeUrl(state));
  } catch (error) {
    console.error("[google/connect]", error instanceof Error ? error.message : error);

    return back("error");
  }
}

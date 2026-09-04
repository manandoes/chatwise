// Setup Step B — how this account connects to WhatsApp.
//
// Either the free QR connection or the official Business API, never both
// (docs/PRD.md §3.1). One row per business, enforced by a unique index.

import { apiError, unexpectedError } from "@/lib/api-response";
import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrCreateBusiness } from "@/lib/onboarding";
import { isConnectionType } from "@/lib/validation/onboarding";

export async function POST(request: Request) {
  try {
    const user = await getApiUser();
    if (!user) {
      return apiError("Please log in and try again.", "NOT_AUTHENTICATED", 401);
    }

    const body = await request.json().catch(() => null);
    const connectionType = (body as { connectionType?: unknown } | null)
      ?.connectionType;

    if (!isConnectionType(connectionType)) {
      return apiError(
        "Choose how you want to connect.",
        "VALIDATION_FAILED",
        400,
        { connectionType: "Pick one to carry on." },
      );
    }

    const business = await getOrCreateBusiness(user.id);

    // Can't choose a connection before choosing what's answering on it.
    if (!business.agent) {
      return apiError(
        "Choose your agent first.",
        "VALIDATION_FAILED",
        400,
      );
    }

    if (business.onboardingCompletedAt && business.connection) {
      return apiError(
        "You already have a WhatsApp connection set up. Change it from your dashboard.",
        "ALREADY_EXISTS",
        409,
      );
    }

    const connection = await db.whatsAppConnection.upsert({
      where: { businessId: business.id },
      create: { businessId: business.id, type: connectionType },
      update: { type: connectionType },
      select: { type: true, status: true },
    });

    return Response.json({ connection }, { status: 200 });
  } catch (error) {
    return unexpectedError("onboarding/connection", error);
  }
}

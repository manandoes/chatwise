// Saving and removing a customer's WhatsApp Business API credentials.
//
// Every customer brings their own Meta app, so we need their app secret as well
// as their access token: the secret is what Meta signs their webhooks with, and
// without it no inbound message from them could ever be verified.
//
// The credentials are checked against Meta before they are stored, so a typo is
// caught here rather than discovered when a real customer's message goes
// unanswered. Both secrets are encrypted at rest and neither is ever sent back
// to the browser in any form (docs/Rules.md §3).

import { apiError, unexpectedError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { isEncryptionConfigured } from "@/lib/encryption";
import { takeFromBudget } from "@/lib/rate-limit";
import { checkApiConnectionAllowed } from "@/lib/usage";
import { requireApiConnection } from "@/lib/whatsapp-connection";
import {
  deleteCredentials,
  readCredentialSecrets,
  saveCredentials,
  verifyCredentials,
} from "@/whatsapp-connectors/business-api/credentials";

/** Meta's ids are numeric strings; the token is opaque but bounded. */
const MAX_ID_LENGTH = 40;
const MAX_TOKEN_LENGTH = 1000;

export async function POST(request: Request) {
  try {
    const found = await requireApiConnection();
    if (!found.ok) return found.response;

    // Every attempt here ends in a call to Meta on the customer's behalf
    // (lib/rate-limit.ts).
    const budget = await takeFromBudget("verifyCredentials", found.businessId);

    if (!budget.allowed) {
      return apiError(budget.message, "RATE_LIMITED", 429);
    }

    // The official WhatsApp Business API *is* the Enterprise plan (lib/plans.ts)
    // — the two plans are the two connection tiers. Checked here rather than in
    // the browser, because this is the point where the connection actually
    // starts working.
    const allowed = await checkApiConnectionAllowed(found.businessId);

    if (!allowed.ok) {
      return apiError(allowed.message, "NOT_AUTHORIZED", 403);
    }

    if (!isEncryptionConfigured()) {
      // Refuse rather than store a token we cannot encrypt.
      console.error("[business-api] ENCRYPTION_KEY missing; refusing to store a token");

      return apiError(
        "We can't store credentials securely right now. Please contact support.",
        "UNEXPECTED_ERROR",
        503,
      );
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    const phoneNumberId = String(body?.phoneNumberId ?? "").trim();
    const appId = String(body?.appId ?? "").trim();
    const businessAccountId = String(body?.businessAccountId ?? "").trim();

    // Someone updating their details can leave either secret blank to mean
    // "keep the one you already have" — they were never shown it to retype.
    const existing = await readCredentialSecrets(found.connection.id);
    const accessToken =
      String(body?.accessToken ?? "").trim() || existing?.accessToken || "";
    const appSecret =
      String(body?.appSecret ?? "").trim() || existing?.appSecret || "";

    const fields: Record<string, string> = {};

    if (appId && (!/^\d+$/.test(appId) || appId.length > MAX_ID_LENGTH)) {
      fields.appId = "This should be a long number, or left blank.";
    }

    // Required, not optional: without it every inbound message would be
    // unverifiable, and an unverifiable message is refused rather than trusted.
    if (!appSecret) {
      fields.appSecret =
        "Needed so we can check that incoming messages really came from Meta.";
    } else if (!/^[a-f0-9]{16,128}$/i.test(appSecret)) {
      fields.appSecret = "That doesn't look like an app secret.";
    }

    if (!/^\d+$/.test(phoneNumberId) || phoneNumberId.length > MAX_ID_LENGTH) {
      fields.phoneNumberId = "This should be the long number from your Meta app.";
    }

    if (
      businessAccountId &&
      (!/^\d+$/.test(businessAccountId) || businessAccountId.length > MAX_ID_LENGTH)
    ) {
      fields.businessAccountId = "This should be a long number, or left blank.";
    }

    if (!accessToken) {
      fields.accessToken = "Paste the access token from your Meta app.";
    } else if (accessToken.length > MAX_TOKEN_LENGTH) {
      fields.accessToken = "That doesn't look like an access token.";
    }

    if (Object.keys(fields).length > 0) {
      return apiError(
        "Please check the highlighted boxes.",
        "VALIDATION_FAILED",
        400,
        fields,
      );
    }

    // Ask Meta whether these actually work before storing them.
    const check = await verifyCredentials({ phoneNumberId, accessToken });

    if (!check.ok) {
      await db.whatsAppConnection
        .update({
          where: { id: found.connection.id },
          data: { status: "ERROR", lastError: check.message },
        })
        .catch(() => {});

      return apiError(check.message, "VALIDATION_FAILED", 400);
    }

    const saved = await saveCredentials({
      connectionId: found.connection.id,
      phoneNumberId,
      appId: appId || null,
      businessAccountId: businessAccountId || null,
      accessToken,
      appSecret,
      displayPhoneNumber: check.data.displayPhoneNumber,
    });

    if (!saved.ok) {
      return apiError(saved.message, "ALREADY_EXISTS", 409);
    }

    await db.whatsAppConnection.update({
      where: { id: found.connection.id },
      data: {
        status: "CONNECTED",
        phoneNumber: check.data.displayPhoneNumber,
        lastConnectedAt: new Date(),
        lastError: null,
      },
    });

    return Response.json({
      connected: true,
      displayPhoneNumber: check.data.displayPhoneNumber,
      verifiedName: check.data.verifiedName,
      // The customer needs both of these to finish setting up the webhook in
      // their own Meta app. Neither is a secret we hold on their behalf — the
      // verify token is one we generated *for* them to paste in.
      webhook: saved.webhook,
    });
  } catch (error) {
    return unexpectedError("whatsapp/business-api/credentials", error);
  }
}

/** Disconnect: forget the credentials entirely. */
export async function DELETE() {
  try {
    const found = await requireApiConnection();
    if (!found.ok) return found.response;

    await deleteCredentials(found.connection.id);

    await db.whatsAppConnection.update({
      where: { id: found.connection.id },
      data: {
        status: "NOT_CONNECTED",
        phoneNumber: null,
        lastError: null,
      },
    });

    return Response.json({ disconnected: true });
  } catch (error) {
    return unexpectedError("whatsapp/business-api/credentials/delete", error);
  }
}

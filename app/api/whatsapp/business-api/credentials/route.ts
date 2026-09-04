// Saving and removing a customer's WhatsApp Business API credentials.
//
// The credentials are checked against Meta before they are stored, so a typo is
// caught here rather than discovered when a real customer message goes
// unanswered. The token is encrypted at rest and is never sent back to the
// browser in any form (docs/Rules.md §3).

import { apiError, unexpectedError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { isEncryptionConfigured } from "@/lib/encryption";
import { requireApiConnection } from "@/lib/whatsapp-connection";
import {
  deleteCredentials,
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
    const businessAccountId = String(body?.businessAccountId ?? "").trim();
    const accessToken = String(body?.accessToken ?? "").trim();

    const fields: Record<string, string> = {};

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
      businessAccountId: businessAccountId || null,
      accessToken,
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

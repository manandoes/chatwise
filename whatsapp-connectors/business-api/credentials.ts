// Storing and checking a customer's WhatsApp Business API credentials.
//
// The access token is the sensitive part: anyone holding it can send messages
// as that business. It is encrypted before it is stored and only ever decrypted
// on the server, at the moment a message is sent (docs/Rules.md §3).
//
// Nothing in this file returns a token to a caller that might send it to the
// browser — `describeCredentials` deliberately returns only whether one exists.

import "server-only";

import { db } from "@/lib/db";
import { decryptText, encryptText } from "@/lib/encryption";
import { graphRequest } from "@/whatsapp-connectors/business-api/graph-api";

/** What Meta tells us about a phone number when we ask. */
type PhoneNumberInfo = {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
};

/**
 * Checks a set of credentials actually works, by asking Meta about the number.
 *
 * This is worth doing at the moment they are entered: a customer who has
 * mistyped a token finds out immediately, rather than discovering it when a
 * real customer message goes unanswered.
 */
export async function verifyCredentials({
  phoneNumberId,
  accessToken,
}: {
  phoneNumberId: string;
  accessToken: string;
}) {
  const result = await graphRequest<PhoneNumberInfo>(
    `${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name`,
    { accessToken },
  );

  if (!result.ok) return result;

  return {
    ok: true as const,
    data: {
      displayPhoneNumber: result.data.display_phone_number ?? null,
      verifiedName: result.data.verified_name ?? null,
    },
  };
}

/**
 * Saves credentials for a connection, replacing any already there.
 *
 * Two accounts cannot claim the same phone number ID: inbound webhooks all
 * arrive at one endpoint and that id is what decides whose message it is, so a
 * duplicate would make routing ambiguous. The unique index enforces it; this
 * turns the resulting database error into something readable.
 */
export async function saveCredentials({
  connectionId,
  phoneNumberId,
  businessAccountId,
  accessToken,
  displayPhoneNumber,
}: {
  connectionId: string;
  phoneNumberId: string;
  businessAccountId: string | null;
  accessToken: string;
  displayPhoneNumber: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const sealed = new Uint8Array(encryptText(accessToken));

  try {
    await db.whatsAppApiCredential.upsert({
      where: { connectionId },
      create: {
        connectionId,
        phoneNumberId,
        businessAccountId,
        displayPhoneNumber,
        accessToken: sealed,
        verifiedAt: new Date(),
      },
      update: {
        phoneNumberId,
        businessAccountId,
        displayPhoneNumber,
        accessToken: sealed,
        verifiedAt: new Date(),
      },
    });

    return { ok: true };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        message:
          "That phone number is already connected to another ChatWise account. Disconnect it there first.",
      };
    }

    throw error;
  }
}

/** Everything needed to send a message. Server-side callers only. */
export async function readCredentials(connectionId: string) {
  const stored = await db.whatsAppApiCredential.findUnique({
    where: { connectionId },
  });

  if (!stored) return null;

  return {
    phoneNumberId: stored.phoneNumberId,
    businessAccountId: stored.businessAccountId,
    displayPhoneNumber: stored.displayPhoneNumber,
    accessToken: decryptText(Buffer.from(stored.accessToken)),
  };
}

/**
 * What the dashboard is allowed to know: that credentials exist, which number
 * they are for, and when they last worked. Never the token, not even part of it.
 */
export async function describeCredentials(connectionId: string) {
  const stored = await db.whatsAppApiCredential.findUnique({
    where: { connectionId },
    select: {
      phoneNumberId: true,
      businessAccountId: true,
      displayPhoneNumber: true,
      verifiedAt: true,
    },
  });

  if (!stored) return null;

  return {
    phoneNumberId: stored.phoneNumberId,
    businessAccountId: stored.businessAccountId,
    displayPhoneNumber: stored.displayPhoneNumber,
    verifiedAt: stored.verifiedAt,
  };
}

/** Finds whose connection a webhook belongs to, by the number it arrived on. */
export async function findConnectionByPhoneNumberId(phoneNumberId: string) {
  const credential = await db.whatsAppApiCredential.findUnique({
    where: { phoneNumberId },
    select: { connectionId: true },
  });

  return credential?.connectionId ?? null;
}

export async function deleteCredentials(connectionId: string) {
  await db.whatsAppApiCredential.deleteMany({ where: { connectionId } });
}

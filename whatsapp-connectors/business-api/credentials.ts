// Storing and checking a customer's WhatsApp Business API credentials.
//
// Every customer brings their own Meta app, so everything here — including the
// app secret Meta signs webhooks with — belongs to one customer. Nothing about
// Meta is configured platform-wide.
//
// Two of these values are keys to that business's WhatsApp: the access token
// (which can send messages as them) and the app secret (which proves a webhook
// really came from Meta). Both are encrypted at rest and never leave the server
// (docs/Rules.md §3). Nothing in this file hands either back to a caller that
// might put it in a page — `describeCredentials` returns only what is safe to
// show.

import { randomBytes } from "node:crypto";

import "server-only";

import { db } from "../../lib/db.ts";
import { decryptText, encryptText } from "../../lib/encryption.ts";
import { graphRequest } from "./graph-api.ts";

/** What Meta tells us about a phone number when we ask. */
type PhoneNumberInfo = {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
};

/**
 * Checks a set of credentials actually works, by asking Meta about the number.
 *
 * Worth doing the moment they are entered: a customer who mistyped a token
 * finds out immediately, rather than discovering it when a real customer's
 * message goes unanswered.
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
 * The webhook tokens are generated once and then kept: changing them would
 * silently break the webhook the customer has already configured in Meta.
 */
export async function saveCredentials({
  connectionId,
  phoneNumberId,
  appId,
  businessAccountId,
  accessToken,
  appSecret,
  displayPhoneNumber,
}: {
  connectionId: string;
  phoneNumberId: string;
  appId: string | null;
  businessAccountId: string | null;
  accessToken: string;
  appSecret: string;
  displayPhoneNumber: string | null;
}): Promise<
  { ok: true; webhook: WebhookDetails } | { ok: false; message: string }
> {
  const existing = await db.whatsAppApiCredential.findUnique({
    where: { connectionId },
    select: { webhookPathToken: true, webhookVerifyToken: true },
  });

  // Keep the customer's existing webhook address and verify token if they have
  // one — they may already have pasted both into Meta.
  const webhookPathToken = existing?.webhookPathToken ?? randomBytes(24).toString("hex");
  const webhookVerifyToken =
    existing?.webhookVerifyToken ?? randomBytes(24).toString("hex");

  try {
    await db.whatsAppApiCredential.upsert({
      where: { connectionId },
      create: {
        connectionId,
        phoneNumberId,
        appId,
        businessAccountId,
        displayPhoneNumber,
        accessToken: new Uint8Array(encryptText(accessToken)),
        appSecret: new Uint8Array(encryptText(appSecret)),
        webhookPathToken,
        webhookVerifyToken,
        verifiedAt: new Date(),
      },
      update: {
        phoneNumberId,
        appId,
        businessAccountId,
        displayPhoneNumber,
        accessToken: new Uint8Array(encryptText(accessToken)),
        appSecret: new Uint8Array(encryptText(appSecret)),
        verifiedAt: new Date(),
      },
    });

    return {
      ok: true,
      webhook: { pathToken: webhookPathToken, verifyToken: webhookVerifyToken },
    };
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

export type WebhookDetails = { pathToken: string; verifyToken: string };

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
 * Finds a connection by the random segment in its webhook address, and returns
 * that customer's own signing secret and verify token.
 *
 * This is how a webhook is attributed to an account *before* anything in the
 * payload is trusted.
 */
export async function readWebhookSecrets(pathToken: string) {
  const stored = await db.whatsAppApiCredential.findUnique({
    where: { webhookPathToken: pathToken },
    select: {
      connectionId: true,
      phoneNumberId: true,
      appSecret: true,
      webhookVerifyToken: true,
    },
  });

  if (!stored) return null;

  return {
    connectionId: stored.connectionId,
    phoneNumberId: stored.phoneNumberId,
    appSecret: decryptText(Buffer.from(stored.appSecret)),
    verifyToken: stored.webhookVerifyToken,
  };
}

/**
 * Both stored secrets, decrypted.
 *
 * Used only when someone updates their credentials and leaves a secret blank,
 * meaning "keep the one you already have". Never call this from anything that
 * builds a page.
 */
export async function readCredentialSecrets(connectionId: string) {
  const stored = await db.whatsAppApiCredential.findUnique({
    where: { connectionId },
    select: { accessToken: true, appSecret: true },
  });

  if (!stored) return null;

  return {
    accessToken: decryptText(Buffer.from(stored.accessToken)),
    appSecret: decryptText(Buffer.from(stored.appSecret)),
  };
}

/** Notes that Meta successfully completed the handshake against this URL. */
export async function markWebhookVerified(connectionId: string) {
  await db.whatsAppApiCredential
    .update({
      where: { connectionId },
      data: { webhookVerifiedAt: new Date() },
    })
    .catch(() => {});
}

/**
 * What the dashboard is allowed to know: which number is connected, the
 * customer's own webhook address and verify token, and when things last worked.
 *
 * Never the access token and never the app secret, not even part of them.
 */
export async function describeCredentials(connectionId: string) {
  const stored = await db.whatsAppApiCredential.findUnique({
    where: { connectionId },
    select: {
      phoneNumberId: true,
      appId: true,
      businessAccountId: true,
      displayPhoneNumber: true,
      webhookPathToken: true,
      webhookVerifyToken: true,
      verifiedAt: true,
      webhookVerifiedAt: true,
    },
  });

  return stored;
}

export async function deleteCredentials(connectionId: string) {
  await db.whatsAppApiCredential.deleteMany({ where: { connectionId } });
}

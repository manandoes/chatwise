// Receiving what Meta sends us.
//
// This is the one endpoint in ChatWise that the public internet can reach
// without logging in, which makes it the one that has to be most careful.
// Anyone can POST to it; only Meta can sign a request correctly. Every payload
// is therefore checked against a signature before a single field is trusted.
//
// Meta delivers every customer's messages to the *same* URL, so the payload
// itself says which account a message belongs to — via the phone number id it
// arrived on. That is why that id is unique across accounts (see
// prisma/schema.prisma).

import { createHmac, timingSafeEqual } from "node:crypto";

import "server-only";

import { db } from "@/lib/db";
import { findConnectionByPhoneNumberId } from "@/whatsapp-connectors/business-api/credentials";

/**
 * Answers Meta's one-off check that we own this endpoint.
 *
 * Meta sends a token we chose in advance plus a challenge; echoing the
 * challenge back proves we know the token.
 */
export function verifyWebhookSubscription(params: URLSearchParams): {
  ok: boolean;
  challenge?: string;
} {
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!expected) {
    console.error(
      "[business-api] WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set, so webhook verification cannot succeed",
    );
    return { ok: false };
  }

  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) return { ok: false };

  if (!constantTimeEquals(token, expected)) return { ok: false };

  return { ok: true, challenge };
}

/**
 * Checks a payload really came from Meta.
 *
 * Meta signs the raw request body with the app secret. We recompute that
 * signature and compare — which means the *exact bytes* have to be hashed, not
 * a re-serialised version of the parsed JSON, because re-serialising can change
 * whitespace or key order and would break an otherwise valid signature.
 */
export function isSignatureValid(rawBody: string, header: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;

  if (!appSecret) {
    // Refusing everything is the right failure here. Accepting unsigned
    // payloads because we can't check them would let anyone write to a
    // customer's account (docs/Rules.md §3).
    console.error(
      "[business-api] META_APP_SECRET is not set, so no webhook can be verified",
    );
    return false;
  }

  if (!header?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  return constantTimeEquals(header.slice("sha256=".length), expected);
}

/** Compares without leaking, through timing, how much of a value was right. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}

// ─── What a payload looks like ──────────────────────────────────────────────
// Only the parts we use. Everything is optional because it comes from outside
// and must not be assumed.

type WebhookPayload = {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: { id?: string; from?: string; timestamp?: string }[];
        statuses?: { id?: string; status?: string }[];
      };
    }[];
  }[];
};

export type WebhookOutcome = {
  /** How many inbound messages we recognised and attributed to an account. */
  messagesHandled: number;
  /** Deliveries and reads Meta told us about. */
  statusesHandled: number;
  /** Messages for a number no ChatWise account has connected. */
  unknownNumbers: number;
};

/**
 * Processes a verified payload.
 *
 * Note what is deliberately *not* done here: the message text is never read or
 * stored. Handing a message to a bot is Phase 7 and the inbox is Phase 9; until
 * those exist there is no legitimate destination for the contents of somebody's
 * private conversation (docs/Rules.md §4). For now we record that a message
 * arrived, which is what keeps the connection-health indicator honest.
 */
export async function handleWebhookPayload(
  payload: unknown,
): Promise<WebhookOutcome> {
  const outcome: WebhookOutcome = {
    messagesHandled: 0,
    statusesHandled: 0,
    unknownNumbers: 0,
  };

  const body = payload as WebhookPayload;

  // Meta uses this endpoint shape for several products; ignore anything that
  // isn't WhatsApp.
  if (body?.object !== "whatsapp_business_account") return outcome;

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;

      if (!phoneNumberId) continue;

      const connectionId = await findConnectionByPhoneNumberId(phoneNumberId);

      if (!connectionId) {
        // A number nobody here has connected. Normal if a customer disconnects
        // without removing the webhook at Meta's end — worth counting, not
        // worth erroring over.
        outcome.unknownNumbers += 1;
        continue;
      }

      const messageCount = value?.messages?.length ?? 0;
      const statusCount = value?.statuses?.length ?? 0;

      if (messageCount > 0) {
        await db.whatsAppConnection
          .update({
            where: { id: connectionId },
            data: {
              messagesReceived: { increment: messageCount },
              lastMessageAt: new Date(),
              // Traffic arriving is proof the connection works.
              status: "CONNECTED",
              lastError: null,
            },
          })
          .catch(() => {});

        outcome.messagesHandled += messageCount;
      }

      outcome.statusesHandled += statusCount;
    }
  }

  return outcome;
}

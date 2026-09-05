// Receiving what Meta sends us.
//
// This is the one part of ChatWise the public internet can reach without
// logging in, which makes it the part that has to be most careful. Anyone can
// POST to it; only someone holding the customer's Meta app secret can sign a
// request correctly.
//
// Because every customer brings their own Meta app, **each customer has their
// own signing secret** — so before anything can be verified, we have to know
// whose webhook this is. That is why each customer gets their own webhook
// address, with a random segment in the path: the URL identifies the account,
// and only then is the payload checked. Meta's first verification call carries
// no phone number at all, so the path is the only thing that could identify the
// account there.

import { createHmac, timingSafeEqual } from "node:crypto";

import "server-only";

import { recordDeliveryReceipt } from "@/campaigns/send-campaign";
import { routeInboundMessage } from "@/message-router/router";
import { sendTextMessage } from "@/whatsapp-connectors/business-api/send-message";

/**
 * Answers Meta's one-off check that the customer owns this endpoint.
 *
 * Meta sends back the verify token the customer pasted into their app, plus a
 * challenge; echoing the challenge proves we hold the same token.
 */
export function verifySubscription(
  params: URLSearchParams,
  expectedVerifyToken: string,
): { ok: boolean; challenge?: string } {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) return { ok: false };
  if (!constantTimeEquals(token, expectedVerifyToken)) return { ok: false };

  return { ok: true, challenge };
}

/**
 * Checks a payload really came from Meta, using this customer's app secret.
 *
 * Meta signs the raw request body. We recompute that signature and compare —
 * which means the *exact bytes* have to be hashed, not a re-serialised version
 * of the parsed JSON, because re-serialising can change whitespace or key order
 * and would break an otherwise valid signature.
 */
export function isSignatureValid(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!appSecret) return false;
  if (!header?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  return constantTimeEquals(header.slice("sha256=".length), expected);
}

/** Compares without leaking, through timing, how much of a value was right. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}


// ─── What a payload looks like ────────────────────────────────────
// Only the parts we use. Everything is optional because it comes from outside
// and must not be assumed — a field Meta renames should make a message go
// unanswered, not make the process fall over.

type IncomingMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
};

type WebhookPayload = {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: IncomingMessage[];
        statuses?: { id?: string; status?: string }[];
      };
    }[];
  }[];
};

export type WebhookOutcome = {
  /** Inbound messages passed to the message router. */
  messagesHandled: number;
  /** Deliveries and reads Meta told us about. */
  statusesHandled: number;
  /**
   * Events whose phone number doesn't match the account this URL belongs to.
   * Normal if a customer re-points an old webhook; also what a mismatched
   * configuration looks like.
   */
  mismatchedNumbers: number;
};

/**
 * Processes a payload that has already been verified as coming from Meta, for a
 * known connection.
 *
 * Each message goes to the message router, which is the single place an inbound
 * message is dealt with whichever tier it arrived on. Nothing here knows what an
 * agent is, and nothing here writes a message's contents to a log.
 */
export async function handleVerifiedPayload(
  payload: unknown,
  connection: { connectionId: string; phoneNumberId: string },
): Promise<WebhookOutcome> {
  const outcome: WebhookOutcome = {
    messagesHandled: 0,
    statusesHandled: 0,
    mismatchedNumbers: 0,
  };

  const body = payload as WebhookPayload;

  // Meta uses this endpoint shape for several products; ignore anything that
  // isn't WhatsApp.
  if (body?.object !== "whatsapp_business_account") return outcome;

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;

      // The signature proved this came from that customer's Meta app, so a
      // payload for a different number is a misconfiguration rather than an
      // attack — but it still isn't ours to act on.
      if (!phoneNumberId || phoneNumberId !== connection.phoneNumberId) {
        outcome.mismatchedNumbers += 1;
        continue;
      }

      // Meta tells us what became of the messages we sent. The only ones we
      // have anything to record against are a campaign's (Phase 12) — an
      // ordinary reply's receipt is counted and otherwise ignored, because
      // nothing in the product asks when an agent's answer was read.
      for (const status of value?.statuses ?? []) {
        outcome.statusesHandled += 1;

        if (!status?.id || !status.status) continue;

        await recordDeliveryReceipt(status.id, status.status).catch(
          (error: unknown) => {
            console.error("[webhook] could not record a delivery receipt", error);

            return false;
          },
        );
      }

      for (const message of value?.messages ?? []) {
        const handled = await handleOneMessage(message, {
          connectionId: connection.connectionId,
          names: namesFrom(value?.contacts),
        });

        if (handled) outcome.messagesHandled += 1;
      }
    }
  }

  return outcome;
}

/** The display names Meta sent alongside the messages, by phone number. */
function namesFrom(
  contacts: { wa_id?: string; profile?: { name?: string } }[] | undefined,
): Map<string, string> {
  const names = new Map<string, string>();

  for (const contact of contacts ?? []) {
    if (contact.wa_id && contact.profile?.name) {
      names.set(contact.wa_id, contact.profile.name);
    }
  }

  return names;
}

/**
 * Hands one message to the router, and sends whatever comes back.
 *
 * Anything that isn't text is passed on as a short description with
 * `answerable: false` — the owner sees that something arrived without an agent
 * being told the customer said words they didn't say.
 */
async function handleOneMessage(
  message: IncomingMessage,
  context: { connectionId: string; names: Map<string, string> },
): Promise<boolean> {
  const from = message.from;

  if (!from) return false;

  const isText = message.type === "text" && Boolean(message.text?.body?.trim());

  const outcome = await routeInboundMessage(
    {
      connectionId: context.connectionId,
      from,
      text: isText ? (message.text?.body as string) : describe(message.type),
      answerable: isText,
      contactName: context.names.get(from) ?? null,
      externalId: message.id ?? null,
      at: timestampToDate(message.timestamp),
    },
    async (reply) => {
      const sent = await sendTextMessage({
        connectionId: context.connectionId,
        to: reply.to,
        body: reply.body,
      });

      return sent.ok ? { ok: true } : { ok: false, message: sent.message };
    },
  );

  return outcome.status !== "ignored";
}

/**
 * What to write in the thread when the message wasn't text.
 *
 * Meta's names for these, which are not the names whatsapp-web.js uses — see the
 * matching list in web-qr/worker.ts.
 */
function describe(type: string | undefined): string {
  switch (type) {
    case "image":
      return "Sent a photo.";
    case "video":
      return "Sent a video.";
    case "audio":
      return "Sent a voice message.";
    case "document":
      return "Sent a document.";
    case "sticker":
      return "Sent a sticker.";
    case "location":
      return "Shared a location.";
    case "contacts":
      return "Shared a contact.";
    default:
      return "Sent a message we couldn't read.";
  }
}

/** Meta sends seconds since 1970, as a string. */
function timestampToDate(timestamp: string | undefined): Date | undefined {
  if (!timestamp) return undefined;

  const seconds = Number(timestamp);

  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;

  return new Date(seconds * 1000);
}

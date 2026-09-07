// One way to send a WhatsApp message, whichever tier the account is on.
//
// An account is either free (a QR session driven by a worker) or paid (Meta's
// official API), never both — docs/PRD.md §3.1. Underneath, those two are not
// remotely alike: one is a queued command to a process holding a browser open
// on another machine, the other is an HTTPS call that knows its own answer
// before it returns.
//
// The point of this file is that nothing above it has to care. The message
// router (Phase 7), the inbox and campaigns ask for a connector and call
// `sendText`. If they branched on the tier instead, that branch would have to
// be repeated — and kept in step — in every feature that sends anything.
//
// What this file deliberately does NOT hide is the one difference that is real:
// the API tier can say "sent", the QR tier can only honestly say "accepted
// for sending". Flattening those two into a single boolean would mean telling a
// customer a message was delivered when nobody knows yet (docs/Rules.md §4), so
// `SendOutcome` keeps them apart and callers decide how to phrase it.
//
// Tier *differences* that are rules rather than mechanics — bulk caps,
// throttling, template approval — live in `capabilities.ts` as data.
//
// The imports here and down this whole subtree are relative and carry .ts
// extensions on purpose. This file is loaded by the Next.js app *and* by the
// always-on host that runs the campaign sender (Phase 12), which is plain Node
// and does not read the "@/..." shortcuts. Same rule as message-router/router.ts.

import "server-only";

import { db } from "../lib/db.ts";
import {
  capabilitiesFor,
  type ConnectionTypeValue,
  type TierCapabilities,
} from "./capabilities.ts";
import {
  sendTemplateMessage,
  sendTextMessage,
} from "./business-api/send-message.ts";
import {
  QueueUnavailableError,
  requestSendMessage,
} from "./web-qr/session-commands.ts";

export { capabilitiesFor };
export type { ConnectionTypeValue, TierCapabilities };

/**
 * What became of a send.
 *
 * Four outcomes rather than a success flag, because a caller has to do
 * something different about each one:
 *
 *   sent        it is with WhatsApp, and there is an id to match a receipt to.
 *   queued      accepted by the worker; nobody knows yet whether it arrived.
 *   failed      it will not work as asked — wrong number, expired token, no
 *               connection. Retrying unchanged is pointless. `message` is
 *               already safe to show a customer.
 *   unavailable our own plumbing is down, not the customer's fault. The same
 *               send is worth trying again later.
 */
export type SendOutcome =
  | { status: "sent"; messageId: string | null }
  | { status: "queued" }
  | { status: "failed"; message: string }
  | { status: "unavailable"; message: string };

export type SendTextInput = {
  connectionId: string;
  /** Any format; it is reduced to digits here. */
  to: string;
  body: string;
};

/**
 * A message sent as one of Meta's approved templates (Phase 12).
 *
 * Deliberately not a `body`. Meta will not let a business start a conversation
 * with free-form words — the message names a template they reviewed, and only
 * the placeholder values vary. Flattening this into `sendText` would mean
 * pretending the two tiers can do the same thing.
 */
export type SendTemplateInput = {
  connectionId: string;
  to: string;
  templateName: string;
  languageCode: string;
  /** Values for the template's body placeholders, in order. */
  parameters: string[];
};

export type WhatsAppConnector = {
  readonly type: ConnectionTypeValue;
  readonly capabilities: TierCapabilities;
  sendText(input: SendTextInput): Promise<SendOutcome>;
  sendTemplate(input: SendTemplateInput): Promise<SendOutcome>;
};

/**
 * A WhatsApp address is the full international number, digits only.
 *
 * Done here rather than in each caller so that one careless call site can't
 * send a number with spaces in it to Meta and get a confusing rejection back.
 */
function toDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** The API tier: an ordinary HTTPS call that knows its own outcome. */
const businessApiConnector: WhatsAppConnector = {
  type: "API",
  capabilities: capabilitiesFor("API"),

  async sendText({ connectionId, to, body }) {
    const result = await sendTextMessage({
      connectionId,
      to: toDigits(to),
      body,
    });

    if (result.ok) return { status: "sent", messageId: result.messageId };

    // Meta's reasons are already translated into something a customer can act
    // on (see business-api/graph-api.ts). Note this collapses "your token is
    // wrong" and "Meta is down" into one outcome; the difference is in the
    // server log, and neither is retryable by us.
    return { status: "failed", message: result.message };
  },

  async sendTemplate({ connectionId, to, templateName, languageCode, parameters }) {
    const result = await sendTemplateMessage({
      connectionId,
      to: toDigits(to),
      templateName,
      languageCode,
      parameters,
    });

    if (result.ok) return { status: "sent", messageId: result.messageId };

    return { status: "failed", message: result.message };
  },
};

/** The QR tier: a command handed to a worker, over a queue, on another host. */
const qrConnector: WhatsAppConnector = {
  type: "QR",
  capabilities: capabilitiesFor("QR"),

  async sendText({ connectionId, to, body }) {
    // A queue accepts anything. If the session isn't linked, the command would
    // sit there unanswered and the caller would be told "queued" — which is
    // true and useless. Checking first turns that into a real answer.
    const connection = await db.whatsAppConnection.findUnique({
      where: { id: connectionId },
      select: { status: true },
    });

    if (connection?.status !== "CONNECTED") {
      return {
        status: "failed",
        message:
          "This WhatsApp number isn't connected right now, so the message wasn't sent.",
      };
    }

    try {
      await requestSendMessage(connectionId, toDigits(to), body);
    } catch (error) {
      if (error instanceof QueueUnavailableError) {
        console.error("[whatsapp] queue unavailable while sending", error.message);

        return {
          status: "unavailable",
          message:
            "WhatsApp sending isn't available right now. Please try again shortly.",
        };
      }

      throw error;
    }

    // The worker will report what actually happened through the event queue.
    return { status: "queued" };
  },

  async sendTemplate() {
    // Meta templates belong to a Meta app, and a QR-tier account does not
    // have one. Saying so is better than quietly sending the template's text as
    // an ordinary message: on this tier the words go out unreviewed either way,
    // and a caller that asked for a template should learn it did not get one.
    return {
      status: "failed",
      message:
        "Approved templates are part of the WhatsApp Business API. On the QR connection, messages send as ordinary text.",
    };
  },
};

/** The connector for a tier. There are exactly two, and no third to add. */
export function connectorFor(type: ConnectionTypeValue): WhatsAppConnector {
  return type === "QR" ? qrConnector : businessApiConnector;
}

/**
 * Convenience for the common case: something already holding a connection row
 * (from `lib/whatsapp-connection.ts`) that just wants to send.
 */
export function connectorForConnection(connection: {
  type: ConnectionTypeValue;
}): WhatsAppConnector {
  return connectorFor(connection.type);
}

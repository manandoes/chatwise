// Sending a message over the official WhatsApp Business API.

import "server-only";

import { db } from "../../lib/db.ts";
import { readCredentials } from "./credentials.ts";
import { graphRequest } from "./graph-api.ts";

type SendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; message: string };

type MessagesResponse = {
  messages?: { id?: string }[];
};

/**
 * Sends a plain text message from a customer's connected number.
 *
 * A note on what this can and cannot do: Meta treats a reply inside an open
 * conversation differently from a message that starts one, and the second kind
 * generally has to use a template they have approved. This function sends plain
 * text, which is the right thing for replying to somebody who just messaged
 * you. Template sending arrives with campaigns in Phase 12, where the approval
 * rules matter (docs/Rules.md §8).
 */
export async function sendTextMessage({
  connectionId,
  to,
  body,
}: {
  connectionId: string;
  to: string;
  body: string;
}): Promise<SendResult> {
  const credentials = await readCredentials(connectionId);

  if (!credentials) {
    return {
      ok: false,
      message: "This account hasn't saved its WhatsApp API credentials yet.",
    };
  }

  const result = await graphRequest<MessagesResponse>(
    `${encodeURIComponent(credentials.phoneNumberId)}/messages`,
    {
      accessToken: credentials.accessToken,
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        // Digits only, in full international form.
        to: to.replace(/\D/g, ""),
        type: "text",
        text: { preview_url: false, body },
      },
    },
  );

  if (!result.ok) {
    // Record the failure so the dashboard's connection health is honest rather
    // than stale (docs/Rules.md §4).
    await db.whatsAppConnection
      .update({
        where: { id: connectionId },
        data: { lastError: result.message },
      })
      .catch(() => {});

    return { ok: false, message: result.message };
  }

  await db.whatsAppConnection
    .update({
      where: { id: connectionId },
      data: {
        messagesSent: { increment: 1 },
        lastMessageAt: new Date(),
        lastError: null,
      },
    })
    .catch(() => {});

  return { ok: true, messageId: result.data.messages?.[0]?.id ?? null };
}

/**
 * Sends one of the customer's Meta-approved templates (Phase 12).
 *
 * This is how the API tier does bulk outreach, and it is a genuinely different
 * thing from sending text. Meta will not let a business *start* a conversation
 * with free-form words: the message has to name a template they have already
 * reviewed, and the only part we get to vary is the values that fill its
 * placeholders. So this function sends a name, a language and a list of
 * parameters — never a sentence.
 *
 * A template Meta has not approved is refused by Meta, whatever ChatWise
 * thinks. The approval status we store (docs/Rules.md §8) is a pre-flight check
 * that produces a clear error early; it is not the enforcement.
 */
export async function sendTemplateMessage({
  connectionId,
  to,
  templateName,
  languageCode,
  parameters,
}: {
  connectionId: string;
  to: string;
  templateName: string;
  languageCode: string;
  /** Values for the template's body placeholders, in order. */
  parameters: string[];
}): Promise<SendResult> {
  const credentials = await readCredentials(connectionId);

  if (!credentials) {
    return {
      ok: false,
      message: "This account hasn't saved its WhatsApp API credentials yet.",
    };
  }

  const result = await graphRequest<MessagesResponse>(
    `${encodeURIComponent(credentials.phoneNumberId)}/messages`,
    {
      accessToken: credentials.accessToken,
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to.replace(/\D/g, ""),
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          // A template with no placeholders must be sent with no components at
          // all — Meta rejects an empty parameter list rather than ignoring it.
          ...(parameters.length > 0
            ? {
                components: [
                  {
                    type: "body",
                    parameters: parameters.map((text) => ({
                      type: "text",
                      text,
                    })),
                  },
                ],
              }
            : {}),
        },
      },
    },
  );

  if (!result.ok) {
    await db.whatsAppConnection
      .update({
        where: { id: connectionId },
        data: { lastError: result.message },
      })
      .catch(() => {});

    return { ok: false, message: result.message };
  }

  await db.whatsAppConnection
    .update({
      where: { id: connectionId },
      data: {
        messagesSent: { increment: 1 },
        lastMessageAt: new Date(),
        lastError: null,
      },
    })
    .catch(() => {});

  return { ok: true, messageId: result.data.messages?.[0]?.id ?? null };
}

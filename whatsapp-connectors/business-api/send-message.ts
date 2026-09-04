// Sending a message over the official WhatsApp Business API.

import "server-only";

import { db } from "@/lib/db";
import { readCredentials } from "@/whatsapp-connectors/business-api/credentials";
import { graphRequest } from "@/whatsapp-connectors/business-api/graph-api";

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

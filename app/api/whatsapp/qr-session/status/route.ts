// How the connection is doing right now — polled by the Connect WhatsApp page.
//
// Combines the durable status in the database with whatever the session manager
// last published to Redis, so the page shows the truth rather than a stale
// "connected" (docs/Rules.md §4).

import { unexpectedError } from "@/lib/api-response";
import { renderQrCode } from "@/whatsapp-connectors/web-qr/qr-generator";
import {
  isQueueReachable,
  readLiveState,
} from "@/whatsapp-connectors/web-qr/session-commands";
import { requireQrConnection } from "@/lib/whatsapp-connection";

export async function GET() {
  try {
    const found = await requireQrConnection();
    if (!found.ok) return found.response;

    // Ask Redis whether it is actually there, rather than assuming it is
    // because a URL is configured. A wrong answer here is what makes a
    // dashboard claim "connected" when nothing is (docs/Rules.md §4).
    const serviceAvailable = await isQueueReachable();
    const live = serviceAvailable ? await readLiveState(found.connection.id) : null;

    // The QR is turned into an image here, on the server. The raw code is a
    // short-lived credential and there is no reason to hand it to the browser.
    const qrImage = live?.qr ? await renderQrCode(live.qr) : null;

    return Response.json({
      status: live?.status ?? found.connection.status,
      message: live?.message ?? null,
      phoneNumber: live?.phoneNumber ?? found.connection.phoneNumber,
      qrImage,
      messagesReceived: found.connection.messagesReceived,
      messagesSent: found.connection.messagesSent,
      lastMessageAt: found.connection.lastMessageAt,
      lastError: found.connection.lastError,
      /** False means the worker service isn't reachable — the page says so. */
      serviceAvailable,
    });
  } catch (error) {
    return unexpectedError("whatsapp/qr-session/status", error);
  }
}

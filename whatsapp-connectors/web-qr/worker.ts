// One customer's WhatsApp Web session.
//
// This file is a whole operating-system process, and it handles exactly one
// connection. That is the point (docs/Architecture.md §5): whatsapp-web.js
// drives a real browser, and browsers crash, hang and get logged out. Giving
// each customer their own process means one customer's bad day — a crash, a
// ban, a wedged browser — cannot touch anybody else's session or data.
//
// It is started by session-manager.ts, never directly, and it talks only to its
// parent, over the process channel Node gives a forked child. It has no idea
// the web app exists.
//
// Note the imports below are relative and carry .ts extensions. This file runs
// under plain Node, which does not read the "@/..." shortcuts that the Next.js
// app uses — see docs/Memory.md for how the worker is launched.

// whatsapp-web.js is a CommonJS package, so it has to be brought in whole and
// unpacked rather than imported by name.
import whatsappWeb from "whatsapp-web.js";

const { Client, RemoteAuth } = whatsappWeb;

/**
 * The parts of an incoming message we use.
 *
 * whatsapp-web.js ships its own types, but it is a CommonJS package brought in
 * whole, so naming what we actually touch is clearer than casting.
 */
type WaMessage = {
  from?: string;
  body?: string;
  type?: string;
  id?: { _serialized?: string };
  getContact?: () => Promise<{ pushname?: string; name?: string } | undefined>;
};

import { createEncryptedSessionStore, sessionNameFor } from "./session-store.ts";
import type { SessionEvent } from "./protocol.ts";

const connectionId = process.env.CONNECTION_ID;

if (!connectionId) {
  console.error("[worker] started without a CONNECTION_ID — nothing to do");
  process.exit(1);
}

/** Where this session's browser profile lives while the worker is running. */
const dataPath =
  process.env.WHATSAPP_SESSION_PATH ?? "./.whatsapp-sessions";

/** Tells the parent something happened. */
function report(event: SessionEvent) {
  process.send?.(event);
}

const store = createEncryptedSessionStore({ connectionId, dataPath });

const client = new Client({
  authStrategy: new RemoteAuth({
    store,
    clientId: sessionNameFor(connectionId),
    dataPath,
    // How often the session is re-saved. One minute is the lowest the library
    // allows, and frequent saves mean less rescanning if a worker dies.
    backupSyncIntervalMs: 60_000,
  }),
  puppeteer: {
    headless: true,
    // Point at a browser that is already installed rather than shipping one.
    // On the worker host, set CHROME_PATH.
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  },
});

// ─── What WhatsApp tells us ─────────────────────────────────────────────────

client.on("qr", (qr: string) => {
  report({ type: "qr", connectionId, qr });
});

client.on("authenticated", () => {
  report({
    type: "status",
    connectionId,
    status: "CONNECTING",
    message: "Scanned — finishing the connection.",
  });
});

client.on("auth_failure", () => {
  // Deliberately vague about the cause: whatsapp-web.js does not reliably tell
  // us why, and guessing at a reason is worse than admitting we don't know.
  report({
    type: "status",
    connectionId,
    status: "ERROR",
    message: "WhatsApp wouldn't accept that sign-in. Try scanning again.",
  });
});

client.on("ready", () => {
  report({
    type: "status",
    connectionId,
    status: "CONNECTED",
    phoneNumber: client.info?.wid?.user,
    message: "Connected.",
  });
});

client.on("disconnected", (reason: string) => {
  report({
    type: "status",
    connectionId,
    status: "DISCONNECTED",
    message:
      reason === "LOGOUT"
        ? "This number was unlinked from WhatsApp on the phone. Scan again to reconnect."
        : "The connection dropped. Trying to reconnect.",
  });
});

client.on("message", async (message: WaMessage) => {
  // Only one-to-one chats. A WhatsApp account also receives group messages and
  // status updates, and an agent replying inside somebody's group chat — or to
  // a status — would be both wrong and embarrassing.
  if (!message.from?.endsWith("@c.us")) return;

  const isText = message.type === "chat" && Boolean(message.body?.trim());

  // The name their phone reports. Asking for it can fail if the contact is
  // gone, and a missing name is not worth losing the message over.
  let contactName: string | null = null;

  try {
    const contact = await message.getContact?.();
    contactName = contact?.pushname ?? contact?.name ?? null;
  } catch {
    contactName = null;
  }

  report({
    type: "inbound",
    connectionId,
    at: new Date().toISOString(),
    from: message.from.replace(/\D/g, ""),
    text: isText ? message.body : describe(message.type),
    answerable: isText,
    contactName,
    externalId: message.id?._serialized ?? null,
  });
});

/**
 * What to record when the message wasn't text an agent could read.
 *
 * There is a similar list in the Business API handler. They look alike but are
 * not the same thing: whatsapp-web.js and Meta name these kinds differently
 * ("chat" vs "text", "ptt" vs "audio", "vcard" vs "contacts"), so sharing one
 * table would mean a mapping that is wrong for both.
 */
function describe(type: string | undefined): string {
  switch (type) {
    case "image":
      return "Sent a photo.";
    case "video":
      return "Sent a video.";
    case "ptt":
    case "audio":
      return "Sent a voice message.";
    case "document":
      return "Sent a document.";
    case "sticker":
      return "Sent a sticker.";
    case "location":
      return "Shared a location.";
    case "vcard":
      return "Shared a contact.";
    default:
      return "Sent a message we couldn't read.";
  }
}

// ─── What the manager asks us to do ─────────────────────────────────────────

process.on("message", async (command: unknown) => {
  const message = command as { type?: string; to?: string; body?: string };

  if (message?.type !== "send" || !message.to || !message.body) return;

  try {
    // WhatsApp addresses look like 919876543210@c.us.
    const digits = message.to.replace(/\D/g, "");
    await client.sendMessage(`${digits}@c.us`, message.body);

    report({ type: "sent", connectionId, at: new Date().toISOString() });
  } catch (error) {
    console.error("[worker] could not send message", error);
    report({
      type: "status",
      connectionId,
      status: "ERROR",
      message: "That message couldn't be sent. Check the number and try again.",
    });
  }
});

// ─── Starting and stopping ──────────────────────────────────────────────────

async function shutdown() {
  try {
    await client.destroy();
  } catch {
    // Already gone.
  }
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

report({
  type: "status",
  connectionId,
  status: "CONNECTING",
  message: "Starting up.",
});

client.initialize().catch((error: unknown) => {
  console.error("[worker] failed to start", error);
  report({
    type: "status",
    connectionId,
    status: "ERROR",
    message: "We couldn't start the WhatsApp connection. Please try again.",
  });
  process.exit(1);
});

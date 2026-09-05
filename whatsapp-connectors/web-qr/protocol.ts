// The words the web app, the session manager and the per-user workers use to
// talk to each other.
//
// Three processes are involved and they may be on different machines:
//
//   the web app  ──(command queue)──▶  session manager  ──(child process)──▶  worker
//        ◀────────(event queue)───────        ◀────────(process messages)─────
//
// Keeping the message shapes in one file means none of the three can drift
// apart without TypeScript noticing. This file has no imports on purpose — the
// worker, the manager and the Next.js app all load it, and it must stay
// loadable everywhere.

/** Queue the web app writes commands to, and the session manager reads. */
export const COMMAND_QUEUE = "whatsapp-qr-commands";

/** Queue the session manager writes events to, and the web app reads. */
export const EVENT_QUEUE = "whatsapp-qr-events";

/**
 * Redis key holding the current live state of one connection, including the QR
 * code while it is waiting to be scanned.
 *
 * The QR is deliberately kept here rather than in the database: it is valid for
 * under a minute, it is replaced repeatedly while someone is scanning, and it
 * should disappear on its own if nobody does.
 */
export function liveStateKey(connectionId: string): string {
  return `whatsapp:qr:state:${connectionId}`;
}

/** How long a stored QR code stays valid, in seconds. */
export const QR_TTL_SECONDS = 90;

// ─── Commands: web app → session manager ────────────────────────────────────

export type StartSessionCommand = {
  type: "start";
  connectionId: string;
  businessId: string;
};

export type StopSessionCommand = {
  type: "stop";
  connectionId: string;
  /** True when the customer is deliberately unlinking, which wipes the saved session. */
  forget: boolean;
};

export type SendMessageCommand = {
  type: "send";
  connectionId: string;
  /** Phone number in international format, digits only. */
  to: string;
  body: string;
};

export type SessionCommand =
  | StartSessionCommand
  | StopSessionCommand
  | SendMessageCommand;

// ─── Events: worker → session manager → web app ─────────────────────────────

/**
 * The states a connection moves through. These mirror the ConnectionStatus
 * enum in prisma/schema.prisma; the manager writes them straight through.
 */
export type ConnectionStatusValue =
  | "NOT_CONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "DISCONNECTED"
  | "ERROR";

export type QrEvent = {
  type: "qr";
  connectionId: string;
  /** The raw string WhatsApp wants encoded into the square. */
  qr: string;
};

export type StatusEvent = {
  type: "status";
  connectionId: string;
  status: ConnectionStatusValue;
  /** Set once we know which number was linked. */
  phoneNumber?: string;
  /** A plain-English reason, safe to show a customer (docs/Rules.md §4). */
  message?: string;
};

/**
 * A message arrived.
 *
 * This one carries what the customer said, because from Phase 7 there is
 * somewhere for it to go: the agent has to read it to answer it, and the owner
 * has to see it in their inbox.
 *
 * It travels only over the private channel between a worker and its own parent
 * process. The manager strips the contents before relaying anything to the
 * shared event queue — a customer's conversation has no business sitting in
 * Redis where every part of the system can read it (docs/Rules.md §4).
 */
export type InboundMessageEvent = {
  type: "inbound";
  connectionId: string;
  at: string;
  /** The customer's number, digits only. */
  from?: string;
  /** What they said — or a short description, if it wasn't text. */
  text?: string;
  /** False when it wasn't text and so isn't something an agent can read. */
  answerable?: boolean;
  /** Whatever name their phone reports. */
  contactName?: string | null;
  /** WhatsApp's own id for the message, so a repeat isn't answered twice. */
  externalId?: string | null;
};

export type SentMessageEvent = {
  type: "sent";
  connectionId: string;
  at: string;
};

export type SessionEvent =
  | QrEvent
  | StatusEvent
  | InboundMessageEvent
  | SentMessageEvent;

// ─── The live state the web app polls ───────────────────────────────────────

export type LiveSessionState = {
  status: ConnectionStatusValue;
  /** The QR string, present only while waiting to be scanned. */
  qr?: string;
  phoneNumber?: string;
  message?: string;
  updatedAt: string;
};

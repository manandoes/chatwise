// Where a customer's WhatsApp Web session is kept between restarts.
//
// whatsapp-web.js hands us the session as a zip file on disk and asks us to
// stash it somewhere. We encrypt it and put it in the database, so:
//
//   • a worker machine can be replaced without anyone rescanning a QR code
//   • the session is never readable at rest, on disk or in the database
//     (docs/Rules.md §3)
//   • one customer's session is a row keyed to their own connection, so it
//     cannot be confused with anyone else's
//
// This runs on the worker host, not in the web app.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Relative, with .ts extensions: this file is loaded by the worker under plain
// Node, which doesn't understand the "@/..." shortcuts the Next.js app uses.
import { db } from "../../lib/db.ts";
import { decrypt, encrypt } from "../../lib/encryption.ts";

/**
 * The shape whatsapp-web.js's RemoteAuth expects. Its calls pass the session
 * name we gave it, which is the connection id — see `sessionNameFor` below.
 */
export type RemoteAuthStore = {
  sessionExists(options: { session: string }): Promise<boolean>;
  save(options: { session: string }): Promise<void>;
  extract(options: { session: string; path: string }): Promise<void>;
  delete(options: { session: string }): Promise<void>;
};

/**
 * RemoteAuth only allows letters, digits, underscores and hyphens in a session
 * name, and uses it as a folder name. Connection ids are cuids, which already
 * satisfy that — this guards against that ever changing.
 */
export function sessionNameFor(connectionId: string): string {
  return connectionId.replace(/[^-_\w]/g, "");
}

/**
 * Builds a store for one connection.
 *
 * `dataPath` must match the one given to RemoteAuth, because that is where it
 * writes the zip it wants saved.
 */
export function createEncryptedSessionStore({
  connectionId,
  dataPath,
}: {
  connectionId: string;
  dataPath: string;
}): RemoteAuthStore {
  const zipPathFor = (session: string) => path.join(dataPath, `${session}.zip`);

  return {
    async sessionExists() {
      const existing = await db.whatsAppSession.findUnique({
        where: { connectionId },
        select: { id: true },
      });

      return Boolean(existing);
    },

    async save({ session }) {
      // RemoteAuth has just written the zip here for us to pick up.
      const archive = await readFile(zipPathFor(session));

      // Prisma's Bytes column wants a plain Uint8Array; Node's Buffer is a
      // subclass of one, but with a wider backing-buffer type.
      const sealed = new Uint8Array(encrypt(archive));

      await db.whatsAppSession.upsert({
        where: { connectionId },
        create: { connectionId, data: sealed },
        update: { data: sealed },
      });
    },

    async extract({ path: destination }) {
      const stored = await db.whatsAppSession.findUnique({
        where: { connectionId },
        select: { data: true },
      });

      if (!stored) return;

      // If this throws, the session was stored under a different
      // ENCRYPTION_KEY, or altered. Better to fail and make the customer
      // rescan than to hand WhatsApp a corrupted session.
      await writeFile(destination, decrypt(Buffer.from(stored.data)));
    },

    async delete() {
      // deleteMany rather than delete: unlinking twice is not an error, and
      // this way it doesn't raise one to be swallowed.
      await db.whatsAppSession.deleteMany({ where: { connectionId } });
    },
  };
}

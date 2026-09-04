// Encrypting things that must not sit readable in the database.
//
// A WhatsApp session file is, in effect, a key to somebody's WhatsApp account:
// anyone holding it can read and send that business's messages. docs/Rules.md §3
// requires session data and API credentials to be encrypted at rest, and this is
// how that is done.
//
// AES-256-GCM, which both encrypts and authenticates — if a stored value is
// altered by so much as a byte, decryption fails loudly rather than returning
// something subtly wrong.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import "server-only";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12; // 96 bits, the size GCM is designed around
const AUTH_TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

/**
 * Reads ENCRYPTION_KEY once and checks it is actually a 32-byte key.
 *
 * Throws rather than falling back to anything. A missing or malformed key is a
 * deployment mistake, and quietly storing readable session data would be far
 * worse than refusing to start.
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.ENCRYPTION_KEY;

  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32",
    );
  }

  const key = Buffer.from(raw, "base64");

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}. ` +
        "Generate one with: openssl rand -base64 32",
    );
  }

  cachedKey = key;
  return key;
}

/** True when a usable ENCRYPTION_KEY is configured. Never throws. */
export function isEncryptionConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypts arbitrary bytes.
 *
 * The result is [12-byte IV][16-byte auth tag][ciphertext] in one buffer, so
 * there is only ever one value to store and no way to lose half of it. A fresh
 * random IV per call means encrypting the same session twice produces different
 * output.
 */
export function encrypt(plaintext: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

/**
 * Reverses `encrypt`. Throws if the value was tampered with, truncated, or
 * encrypted under a different key.
 */
export function decrypt(payload: Buffer): Buffer {
  if (payload.length < IV_BYTES + AUTH_TAG_BYTES) {
    throw new Error("Encrypted value is too short to be valid.");
  }

  const iv = payload.subarray(0, IV_BYTES);
  const authTag = payload.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = payload.subarray(IV_BYTES + AUTH_TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Convenience wrappers for encrypting text, e.g. an API token. */
export function encryptText(plaintext: string): Buffer {
  return encrypt(Buffer.from(plaintext, "utf8"));
}

export function decryptText(payload: Buffer): string {
  return decrypt(payload).toString("utf8");
}

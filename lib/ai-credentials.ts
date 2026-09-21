// A business's own Gemini API key.
//
// An account can bring its own key rather than run on the platform's. Where
// one is set it is what that account's agents think with; where it isn't, the
// platform's GEMINI_API_KEY is used instead (lib/ai-client.ts).
//
// The key is a key to somebody else's billing account, so it is encrypted at
// rest and never leaves the server (docs/Rules.md §3). Nothing here hands it
// back to a caller that might put it in a page — the Settings screen is told
// only whether one is saved.
//
// Relative .ts imports: this file is loaded by the Next.js app and by the
// always-on WhatsApp session manager, which runs under plain Node and doesn't
// read the "@/..." shortcuts.

import "server-only";

import { db } from "./db.ts";
import { decryptText, encryptText } from "./encryption.ts";

/** Saves a key for a business, replacing any already there. */
export async function saveGeminiApiKey(businessId: string, apiKey: string) {
  await db.business.update({
    where: { id: businessId },
    data: { geminiApiKey: new Uint8Array(encryptText(apiKey)) },
  });
}

/** Drops the business's own key, so its agents fall back to the platform's. */
export async function clearGeminiApiKey(businessId: string) {
  await db.business.update({
    where: { id: businessId },
    data: { geminiApiKey: null },
  });
}

/** What the dashboard is allowed to know: whether a key is saved at all. */
export async function hasGeminiApiKey(businessId: string): Promise<boolean> {
  const stored = await db.business.findUnique({
    where: { id: businessId },
    select: { geminiApiKey: true },
  });

  return Boolean(stored?.geminiApiKey);
}

/**
 * The key itself, decrypted. Server-side callers only — never call this from
 * anything that builds a page.
 *
 * A key stored under a different ENCRYPTION_KEY, or altered, cannot be
 * recovered. That reads as "this account has no key of its own", which falls
 * back to the platform's rather than taking every agent on the account down.
 */
export async function readGeminiApiKey(businessId: string): Promise<string | null> {
  const stored = await db.business.findUnique({
    where: { id: businessId },
    select: { geminiApiKey: true },
  });

  if (!stored?.geminiApiKey) return null;

  return decryptStoredKey(stored.geminiApiKey);
}

/**
 * Turns a stored ciphertext into the key, or null if it cannot be read.
 *
 * Exported because the message router already has the column in hand from its
 * own query and shouldn't fetch the row a second time.
 */
export function decryptStoredKey(stored: Uint8Array): string | null {
  try {
    return decryptText(Buffer.from(stored));
  } catch {
    console.error("[ai] a stored API key could not be decrypted; using the default key");

    return null;
  }
}

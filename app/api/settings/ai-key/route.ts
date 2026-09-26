// Saving and removing a business's own AI API key.
//
// The key is never read back out to the browser, not even masked — the Settings
// screen is told only whether one is saved (lib/ai-credentials.ts). Removing it
// is not "switching the agent off": the account falls back to the platform's
// own key, which is how every account runs until it sets one.
//
// The business is always found from the signed-in user, never from an id in the
// request (docs/Rules.md §3).

import {
  clearGeminiApiKey,
  saveGeminiApiKey,
} from "@/lib/ai-credentials";
import { apiError, unexpectedError } from "@/lib/api-response";
import { getApiUser, refuseUnlessOwner } from "@/lib/auth";
import { isEncryptionConfigured } from "@/lib/encryption";
import { getOrCreateBusiness } from "@/lib/onboarding";

/** Long enough for any provider key, short enough that nobody pastes a file. */
const MAX_KEY_LENGTH = 200;

export async function POST(request: Request) {
  try {
    const user = await getApiUser();

    if (!user) {
      return apiError("Please sign in again.", "NOT_AUTHENTICATED", 401);
    }

    if (!isEncryptionConfigured()) {
      // Refuse rather than store a key we cannot encrypt.
      console.error("[ai-key] ENCRYPTION_KEY missing; refusing to store a key");

      return apiError(
        "We can't store your key securely right now. Please contact support.",
        "UNEXPECTED_ERROR",
        503,
      );
    }

    const body = (await request.json().catch(() => null)) as {
      apiKey?: unknown;
    } | null;

    const apiKey = String(body?.apiKey ?? "").trim();

    if (!apiKey) {
      return apiError("Enter your API key.", "VALIDATION_FAILED", 400, {
        apiKey: "Paste the key from Google AI Studio.",
      });
    }

    if (apiKey.length > MAX_KEY_LENGTH) {
      return apiError("That key is too long.", "VALIDATION_FAILED", 400, {
        apiKey: "That doesn't look like an API key.",
      });
    }

    // Account settings belong to the owner, not the whole team.
    const denied = await refuseUnlessOwner(user.id);
    if (denied) return denied;

    const business = await getOrCreateBusiness(user.id);

    await saveGeminiApiKey(business.id, apiKey);

    return Response.json({ saved: true });
  } catch (error) {
    return unexpectedError("settings/ai-key/post", error);
  }
}

export async function DELETE() {
  try {
    const user = await getApiUser();

    if (!user) {
      return apiError("Please sign in again.", "NOT_AUTHENTICATED", 401);
    }

    // Account settings belong to the owner, not the whole team.
    const denied = await refuseUnlessOwner(user.id);
    if (denied) return denied;

    const business = await getOrCreateBusiness(user.id);

    await clearGeminiApiKey(business.id);

    return Response.json({ saved: true });
  } catch (error) {
    return unexpectedError("settings/ai-key/delete", error);
  }
}

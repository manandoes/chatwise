// Extracting persona fields from a business document (PDF, etc.).
//
// A business may have a handbook, menu, price list, or FAQ doc that already
// contains the answers the agent setup form asks for. Instead of copying them
// by hand, the owner uploads the doc and the agent fills in what it can.
// Nothing is saved automatically — the owner still reviews and presses Save.

import "server-only";

import { extractFromDocument, type FilePart } from "./ai-client";
import { readGeminiApiKey } from "./ai-credentials";

/** A field the model returns; empty values are excluded before sending back. */
export type PersonaExtract = Record<string, string>;

/**
 * Reads a document and asks the model to fill whatever persona fields it can.
 *
 * The returned record may be missing keys — the model only returns what it
 * found in the document. The caller merges into existing values rather than
 * overwriting blanks.
 */
export async function extractPersonaFromDocument(
  file: { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> },
  /** Passed straight through to `extractFromDocument`. */
  apiKey: string | null,
): Promise<{ ok: true; persona: PersonaExtract } | { ok: false; message: string }> {
  if (file.size > 8 * 1024 * 1024) {
    return { ok: false, message: "That file's too big — keep it under 8MB." };
  }

  if (file.size === 0) {
    return { ok: false, message: "That file is empty." };
  }

  const name = file.name.toLowerCase();

  if (!name.endsWith(".pdf") && file.type !== "application/pdf") {
    return {
      ok: false,
      message: "Upload a PDF file containing your business details.",
    };
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  const result = await extractFromDocument({
    prompt: DOCUMENT_EXTRACTION_PROMPT,
    filePart: { mimeType: "application/pdf", data: base64 },
    apiKey,
  });

  if (!result.ok) {
    return { ok: false, message: "We couldn't read that file right now. Try again in a moment." };
  }

  const cleaned = result.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  let parsed: unknown;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { ok: false, message: "We couldn't make sense of that file. Try a different one." };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, message: "We couldn't make sense of that file. Try a different one." };
  }

  // Strip keys that came back empty so the caller can tell the difference
  // between "the model didn't find it" and "it is an empty string".
  const persona: PersonaExtract = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) {
      persona[key] = value.trim();
    }
  }

  return { ok: true, persona };
}

/**
 * The prompt passed to the model for every document upload.
 *
 * It asks for a JSON object keyed by the setup-question IDs (from each bot's
 * config-schema.ts), because those are exactly what the form stores back. The
 * model is also told to skip fields it cannot find — which keeps the response
 * shape stable.
 */
const DOCUMENT_EXTRACTION_PROMPT = `The text or file below is a business document — it could be a company brochure, product catalogue, FAQ page, pricing list, operating manual, or similar.

Your job is to pull out the answers to the following questions, the way a small-business owner would have answered them during agent setup. Return a JSON object with exactly these keys, using only the information present in the document. If a field cannot be answered from the document, omit that key entirely (do not set it to an empty string).

Keys to fill:

- "name": The business name.
- "industry": What line of work or industry they are in.
- "about": A short description of what the business does, in a couple of sentences.
- "openingHours": When the business is open — written in plain English as the owner would say it.
- "location": Physical address or area the business operates from.
- "productsAndPrices": What the business sells and at what prices, one item per line.
- "commonObjections": Things customers push back on, and the expected response.
- "discountPolicy": Whether and how the business discounts.
- "checkoutLink": Any payment or checkout URL the business uses.
- "commonQuestions": Frequently asked questions customers have.
- "neverAnswer": Topics the agent should never attempt to answer and hand to a person instead.
- "escalationRules": Other situations besides "ask for a human" that should trigger escalation.
- "escalateTo": Who the agent should say it is fetching (a name or role).
- "tone": A single word describing the desired communication style (e.g., friendly, formal, professional, casual, warm).
- "language": The language the agent should reply in (e.g., English, Hindi, Spanish).
- "whatToAsk": Questions the agent should ask the customer before making a recommendation.
- "addOns": Anything the agent should offer alongside a purchase.
- "checkoutLink": A payment or checkout URL, if available.

Reply with a JSON object only — no markdown, no code fence, no explanation before or after it. For example:
{"name": "Acme Bakery", "industry": "Bakery", "about": "Artisan breads and pastries since 2010.", "location": "123 Main St, Bengaluru"}`;

/**
 * The default values used as placeholders when no key is found in the response.
 *
 * Kept separate so tests can assert on it without touching the prompt string.
 */
export const KNOWN_PERSONA_KEYS = [
  "name",
  "industry",
  "about",
  "openingHours",
  "location",
  "productsAndPrices",
  "commonObjections",
  "discountPolicy",
  "checkoutLink",
  "commonQuestions",
  "neverAnswer",
  "escalationRules",
  "escalateTo",
  "tone",
  "language",
  "whatToAsk",
  "addOns",
] as const;

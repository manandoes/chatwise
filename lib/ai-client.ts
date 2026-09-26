// The one place ChatWise talks to the AI model.
//
// Every agent in /bots asks its question through this file, which means the
// model, the key, the timeout and the way failures are worded are decided once
// rather than nine times. Swapping providers is a change to this file and
// nothing else — which is exactly what happened on 2026-09-05, when the product
// owner chose Google Gemini. No agent, prompt or router line changed.
//
// Two things it deliberately does NOT do:
//
//   * It never writes a customer's message, or the agent's reply, to the logs.
//     A failed request logs the status code and nothing else (docs/Rules.md §4).
//   * It never throws at a caller. A model that is slow, rate-limited or
//     misconfigured is an ordinary Tuesday, and the router has to be able to
//     tell the customer something sensible either way.
//
// This is a plain HTTPS call rather than a provider SDK on purpose: it is about
// forty lines of fetch, and every dependency added here is one more thing the
// product owner has to trust (docs/Rules.md §1).

import "server-only";

/** Where the model lives. */
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
const API_VERSION = "v1beta";

/**
 * The model the agents run on.
 *
 * Overridable by environment so a faster or cheaper model can be tried without
 * a code change — but with a sensible default, so nothing breaks if it is unset.
 */
const DEFAULT_MODEL = "gemini-3.8-flash";

/**
 * The provider's address, for the chosen model.
 *
 * Overridable so the whole pipeline can be pointed at a gateway, a regional
 * endpoint, or a stub during testing — without which the only way to exercise
 * an agent end to end is to spend money on a live model.
 */
function apiUrl(): string {
  const base = (process.env.GEMINI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  return `${base}/${API_VERSION}/models/${model}:generateContent`;
}

/**
 * How long to wait before giving up.
 *
 * Someone is sitting in WhatsApp waiting for a reply. Past about twenty seconds
 * they have concluded nobody is there, so waiting longer buys nothing.
 */
const TIMEOUT_MS = 20_000;

/** A WhatsApp reply should be a few short paragraphs, never an essay. */
const DEFAULT_MAX_TOKENS = 500;

/**
 * Gemini reasons before it answers, and those reasoning tokens are spent out of
 * the same output budget as the reply. Send only the caller's reply budget and a
 * thinking model can use the whole of it thinking, then return nothing at all.
 * So the budget on the wire is the caller's, plus room to think in.
 *
 * `thinkingLevel: "low"` keeps that room small and the reply fast, which is the
 * right trade for a chat bot someone is waiting on.
 */
const THINKING_HEADROOM_TOKENS = 2_000;
const THINKING_LEVEL = "low";

export type AiMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiResult =
  | { ok: true; text: string }
  | {
      ok: false;
      /**
       * Which kind of failure, because the router does different things:
       * `not-configured` is our mistake and worth shouting about in the logs;
       * `busy` is worth retrying later; `failed` is not.
       */
      reason: "not-configured" | "busy" | "failed";
      /** Safe to show a person — no provider jargon, no stack trace. */
      message: string;
    };

/**
 * Which key a call actually goes out on.
 *
 * An account may bring its own (lib/ai-credentials.ts), in which case that is
 * what it thinks with and what it is billed for. An account that hasn't runs on
 * the platform's own key, so nothing stops working for anyone who never sets
 * one.
 */
function keyToUse(ownKey?: string | null): string | undefined {
  return ownKey?.trim() || process.env.GEMINI_API_KEY || undefined;
}

/**
 * Whether an AI key is present at all — the account's own, or the platform's.
 * Checked before an agent is asked to think.
 */
export function isAiConfigured(ownKey?: string | null): boolean {
  return Boolean(keyToUse(ownKey));
}

type ApiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  /** Present instead of candidates when the prompt itself was refused. */
  promptFeedback?: { blockReason?: string };
};

/**
 * One request to the provider, shared by every caller below.
 *
 * A chat turn, reading a file and embedding text all send different bodies to
 * different model methods, but need the exact same treatment of a missing
 * key, a timeout and a non-200 — so that treatment lives once, here, rather
 * than being copied per caller. Returns the parsed body on success.
 */
async function requestGemini(
  url: string,
  body: Record<string, unknown>,
  ownKey?: string | null,
): Promise<{ ok: true; json: unknown } | Extract<AiResult, { ok: false }>> {
  const apiKey = keyToUse(ownKey);

  if (!apiKey) {
    console.error(
      "[ai] no API key — neither this account's own nor GEMINI_API_KEY — so no agent can reply",
    );

    return {
      ok: false,
      reason: "not-configured",
      message: "The assistant isn't set up yet.",
    };
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // Timed out, or the network is down. Note what is logged: the shape of the
    // failure, never the conversation that caused it.
    console.error(
      "[ai] request did not complete:",
      error instanceof Error ? error.name : "unknown error",
    );

    return {
      ok: false,
      reason: "busy",
      message: "The assistant took too long to answer.",
    };
  }

  if (!response.ok) {
    // The provider's body can quote back part of the prompt, so it is read for
    // the status only and then dropped.
    console.error(`[ai] provider returned ${response.status}`);

    if (response.status === 429 || response.status >= 500) {
      return {
        ok: false,
        reason: "busy",
        message: "The assistant is busy right now.",
      };
    }

    return {
      ok: false,
      reason: "failed",
      message: "The assistant couldn't answer that.",
    };
  }

  return { ok: true, json: await response.json().catch(() => null) };
}

/** A generateContent call: the reply's text, or why there isn't one. */
async function callGemini(
  body: Record<string, unknown>,
  ownKey?: string | null,
): Promise<AiResult> {
  const result = await requestGemini(apiUrl(), body, ownKey);

  if (!result.ok) return result;

  const responseBody = result.json as ApiResponse | null;
  const candidate = responseBody?.candidates?.[0];

  const text = (candidate?.content?.parts ?? [])
    .map((part) => part?.text)
    .filter((part): part is string => typeof part === "string")
    .join("")
    .trim();

  if (!text) {
    // Why there is no answer is worth knowing — a refused prompt and a reply cut
    // off mid-sentence are different problems — and neither reason quotes the
    // conversation back.
    console.error(
      "[ai] provider returned no usable text:",
      responseBody?.promptFeedback?.blockReason || candidate?.finishReason || "no reason given",
    );

    return {
      ok: false,
      reason: "failed",
      message: "The assistant couldn't answer that.",
    };
  }

  return { ok: true, text };
}

/**
 * Asks the model for a reply.
 *
 * `system` is the agent's instructions — its prompt.ts, filled in with that
 * business's own details. `messages` is the conversation so far, oldest first.
 */
export async function generateReply({
  system,
  messages,
  maxTokens = DEFAULT_MAX_TOKENS,
  apiKey,
}: {
  system: string;
  messages: AiMessage[];
  maxTokens?: number;
  /** This account's own key, where it has one. Falls back to the platform's. */
  apiKey?: string | null;
}): Promise<AiResult> {
  if (messages.length === 0) {
    return { ok: false, reason: "failed", message: "There was nothing to reply to." };
  }

  return callGemini(
    {
      systemInstruction: { parts: [{ text: system }] },
      // Gemini calls the assistant's own turns "model"; everything else about
      // the conversation is the same shape the agents already build.
      contents: messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      generationConfig: {
        maxOutputTokens: maxTokens + THINKING_HEADROOM_TOKENS,
        thinkingConfig: { thinkingLevel: THINKING_LEVEL },
      },
    },
    apiKey,
  );
}

/** A file handed to `extractFromDocument`, base64-encoded. */
export type FilePart = { mimeType: string; data: string };

/** A one-shot extraction reply is data, not prose — give it room for a list. */
const EXTRACTION_MAX_TOKENS = 4_000;

/**
 * Asks the model to read a document (or a plain block of text) and return
 * whatever `prompt` asked for.
 *
 * Used by the Knowledge Base's file import (lib/knowledge-import.ts) to pull
 * question-and-answer pairs out of an uploaded PDF or a conversation-shaped
 * JSON file — never for a bot's reply, so there is no system persona and no
 * conversation history, just one instruction and (optionally) one file.
 */
export async function extractFromDocument({
  prompt,
  filePart,
  apiKey,
}: {
  prompt: string;
  filePart?: FilePart;
  /** This account's own key, where it has one. Falls back to the platform's. */
  apiKey?: string | null;
}): Promise<AiResult> {
  return callGemini(
    {
      contents: [
        {
          role: "user",
          parts: [...(filePart ? [{ inlineData: filePart }] : []), { text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: EXTRACTION_MAX_TOKENS + THINKING_HEADROOM_TOKENS,
        thinkingConfig: { thinkingLevel: THINKING_LEVEL },
      },
    },
    apiKey,
  );
}

// ─── Embeddings, for product search ─────────────────────────────────────────

/**
 * How many numbers an embedding has. Fixed by the database column
 * (`products.embedding vector(768)`), so changing it means a migration.
 */
export const EMBEDDING_DIMENSIONS = 768;

const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";

function embeddingUrl(): string {
  const base = (process.env.GEMINI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.GEMINI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;

  return `${base}/${API_VERSION}/models/${model}:embedContent`;
}

export type EmbeddingResult =
  | { ok: true; values: number[] }
  | Extract<AiResult, { ok: false }>;

/**
 * Turns text into a list of numbers such that similar meanings land close
 * together — what lets "something for dry skin" find a product called
 * "Hydrating Night Cream" without sharing a word.
 *
 * `purpose` matters to the model: a product description is a DOCUMENT, a
 * customer's question is a QUERY, and each is embedded slightly differently
 * so the two meet in the middle.
 */
export async function embedText({
  text,
  purpose,
  apiKey,
}: {
  text: string;
  purpose: "document" | "query";
  apiKey?: string | null;
}): Promise<EmbeddingResult> {
  const trimmed = text.trim().slice(0, 8_000);

  if (!trimmed) return { ok: false, reason: "failed", message: "There was nothing to index." };

  const result = await requestGemini(
    embeddingUrl(),
    {
      content: { parts: [{ text: trimmed }] },
      taskType: purpose === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
    apiKey,
  );

  if (!result.ok) return result;

  const values = (result.json as { embedding?: { values?: unknown } } | null)?.embedding?.values;

  if (
    !Array.isArray(values) ||
    values.length !== EMBEDDING_DIMENSIONS ||
    !values.every((value) => typeof value === "number" && Number.isFinite(value))
  ) {
    console.error("[ai] embedding came back in an unexpected shape");

    return { ok: false, reason: "failed", message: "The assistant couldn't index that." };
  }

  // A shortened embedding isn't unit-length; scale it so cosine distance
  // compares like with like.
  const length = Math.hypot(...(values as number[])) || 1;

  return { ok: true, values: (values as number[]).map((value) => value / length) };
}

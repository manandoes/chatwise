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

/** Whether an AI key is present at all. Checked before an agent is asked to think. */
export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
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
 * Asks the model for a reply.
 *
 * `system` is the agent's instructions — its prompt.ts, filled in with that
 * business's own details. `messages` is the conversation so far, oldest first.
 */
export async function generateReply({
  system,
  messages,
  maxTokens = DEFAULT_MAX_TOKENS,
}: {
  system: string;
  messages: AiMessage[];
  maxTokens?: number;
}): Promise<AiResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("[ai] GEMINI_API_KEY is not set — no agent can reply");

    return {
      ok: false,
      reason: "not-configured",
      message: "The assistant isn't set up yet.",
    };
  }

  if (messages.length === 0) {
    return { ok: false, reason: "failed", message: "There was nothing to reply to." };
  }

  let response: Response;

  try {
    response = await fetch(apiUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
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
      }),
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

  const body = (await response.json().catch(() => null)) as ApiResponse | null;
  const candidate = body?.candidates?.[0];

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
      body?.promptFeedback?.blockReason || candidate?.finishReason || "no reason given",
    );

    return {
      ok: false,
      reason: "failed",
      message: "The assistant couldn't answer that.",
    };
  }

  return { ok: true, text };
}

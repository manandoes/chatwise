// Turning an uploaded file of example conversations into Knowledge Base rows.
//
// This never touches the database. It only turns a .json or .pdf file into a
// list of { question, answer } pairs for the owner to look at, edit, and — if
// they're happy with them — save through the same "Save" button and the same
// checks (lib/knowledge-base.ts) as any answer they typed by hand. A file from
// outside the business is treated as untrusted input the whole way through: a
// bad shape, a bad row, or a model that answers with nonsense should mean a
// clear message or a shorter list, never a crash and never silently-saved junk.

import "server-only";

import { extractFromDocument } from "./ai-client";
import {
  MAX_ANSWER_LENGTH,
  MAX_ENTRIES,
  MAX_QUESTION_LENGTH,
  type KnowledgeEntryInput,
} from "./knowledge-base";

/** Large enough for a real conversation export, small enough to stay cheap to read. */
const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;

/** The bits of a `File` this file actually needs — easy to satisfy from a test too. */
export type UploadedFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type ImportResult =
  | { ok: true; entries: KnowledgeEntryInput[]; skipped: number }
  | { ok: false; message: string };

/**
 * Reads an uploaded file and returns the question/answer pairs found in it.
 *
 * Two shapes of JSON are understood directly, with no model call needed:
 * a list of `{ question, answer }` pairs, or a list of conversation messages
 * (each with some speaker-like field and some text-like field). Anything else
 * — including every PDF — is handed to Gemini with one fixed instruction:
 * pull out the real question-and-answer exchanges, skip the small talk.
 */
export async function parseUploadedKnowledge(
  file: UploadedFile,
  /** This business's own AI key, where it has one. Falls back to the platform's. */
  apiKey: string | null,
): Promise<ImportResult> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { ok: false, message: "That file's too big — keep it under 8MB." };
  }

  if (file.size === 0) {
    return { ok: false, message: "That file is empty." };
  }

  const name = file.name.toLowerCase();
  const isJson = file.type === "application/json" || name.endsWith(".json");
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");

  if (!isJson && !isPdf) {
    return {
      ok: false,
      message: "Upload a .json or .pdf file of example conversations.",
    };
  }

  const candidates = isJson
    ? await candidatesFromJson(file, apiKey)
    : await candidatesFromPdf(file, apiKey);

  if (!candidates.ok) return candidates;

  const { entries, skipped } = sanitize(candidates.candidates);

  return { ok: true, entries, skipped };
}

type CandidateResult =
  | { ok: true; candidates: unknown[] }
  | { ok: false; message: string };

async function candidatesFromJson(
  file: UploadedFile,
  apiKey: string | null,
): Promise<CandidateResult> {
  const text = new TextDecoder("utf-8").decode(await file.arrayBuffer());

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      message: "We couldn't read that file — it doesn't look like valid JSON.",
    };
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return {
      ok: false,
      message:
        "That JSON should be a list — either question/answer pairs, or a conversation's messages.",
    };
  }

  if (parsed.every(isQaPair)) {
    return { ok: true, candidates: parsed };
  }

  if (parsed.every(isConversationTurn)) {
    return extractFromTranscript(turnsToTranscript(parsed), apiKey);
  }

  return {
    ok: false,
    message:
      'Each item should either have "question" and "answer" text, or look like a chat message (a speaker and some text).',
  };
}

async function candidatesFromPdf(
  file: UploadedFile,
  apiKey: string | null,
): Promise<CandidateResult> {
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  const result = await extractFromDocument({
    prompt: EXTRACTION_PROMPT,
    filePart: { mimeType: "application/pdf", data: base64 },
    apiKey,
  });

  return parseExtractionReply(result);
}

const EXTRACTION_PROMPT = `The text or file below is one or more example WhatsApp conversations between a customer and a business.

Pull out the genuine question-and-answer exchanges: a real thing the customer asked, and the real answer the business gave. Skip greetings, small talk, and anything that isn't actually a question being answered.

Reply with a JSON array only — no markdown, no code fence, no explanation before or after it. Each item: {"question": "...", "answer": "..."}. If there is nothing usable, reply with an empty array: []`;

async function extractFromTranscript(
  transcript: string,
  apiKey: string | null,
): Promise<CandidateResult> {
  const result = await extractFromDocument({
    prompt: `${EXTRACTION_PROMPT}\n\n${transcript}`,
    apiKey,
  });

  return parseExtractionReply(result);
}

/** The model's own output is trusted less than a human-typed file, so a bad
 * reply is a clean error rather than something we try to partially rescue. */
function parseExtractionReply(
  result: Awaited<ReturnType<typeof extractFromDocument>>,
): CandidateResult {
  if (!result.ok) {
    return {
      ok: false,
      message: "We couldn't read that file right now. Try again in a moment.",
    };
  }

  const cleaned = result.text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let parsed: unknown;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      ok: false,
      message: "We couldn't make sense of that file. Try a different one.",
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      ok: false,
      message: "We couldn't make sense of that file. Try a different one.",
    };
  }

  return { ok: true, candidates: parsed };
}

function isQaPair(item: unknown): boolean {
  const record = item as Record<string, unknown> | null;

  return (
    typeof record === "object" &&
    record !== null &&
    typeof record.question === "string" &&
    typeof record.answer === "string"
  );
}

/** Field names accepted for "who said this" and "what they said", since a
 * chat export from anywhere is never going to agree on one pair of names. */
const SPEAKER_KEYS = ["role", "speaker", "sender", "from", "who"];
const TEXT_KEYS = ["text", "message", "body", "content"];

function isConversationTurn(item: unknown): boolean {
  const record = item as Record<string, unknown> | null;

  if (typeof record !== "object" || record === null) return false;

  const hasSpeaker = SPEAKER_KEYS.some((key) => typeof record[key] === "string");
  const hasText = TEXT_KEYS.some((key) => typeof record[key] === "string");

  return hasSpeaker && hasText;
}

function turnsToTranscript(turns: unknown[]): string {
  return turns
    .map((turn) => {
      const record = turn as Record<string, unknown>;
      const speaker = SPEAKER_KEYS.map((key) => record[key]).find(
        (value): value is string => typeof value === "string",
      );
      const text = TEXT_KEYS.map((key) => record[key]).find(
        (value): value is string => typeof value === "string",
      );

      return `${speaker ?? "Unknown"}: ${text ?? ""}`;
    })
    .join("\n");
}

/**
 * Trims and checks every candidate the same way `validateEntries` checks a
 * hand-typed row (lib/knowledge-base.ts), except a bad row here is dropped
 * rather than reported back as a field to fix — nobody can fix a field in a
 * file they've already uploaded. `skipped` is what the editor tells the owner.
 */
function sanitize(rawCandidates: unknown[]): {
  entries: KnowledgeEntryInput[];
  skipped: number;
} {
  const entries: KnowledgeEntryInput[] = [];
  let skipped = 0;

  for (const raw of rawCandidates) {
    if (entries.length >= MAX_ENTRIES) {
      skipped += 1;
      continue;
    }

    const record = raw as Record<string, unknown> | null;
    const question = String(record?.question ?? "").trim();
    const answer = String(record?.answer ?? "").trim();

    const usable =
      question &&
      answer &&
      question.length <= MAX_QUESTION_LENGTH &&
      answer.length <= MAX_ANSWER_LENGTH;

    if (!usable) {
      skipped += 1;
      continue;
    }

    entries.push({ question, answer });
  }

  return { entries, skipped };
}

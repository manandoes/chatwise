// How the CRM agent decides what to record.
//
// Thicker than the other handlers, and for a good reason: this agent's answer
// is not a sentence to a customer but fields in a database, so everything it
// sends back is checked before it gets anywhere near one. A model that returns
// a score of 5000, a status nobody has heard of, or forty tags should change
// nothing rather than write nonsense into a business's customer list.
//
// Nothing here throws. The CRM record is a nice-to-have that runs after the
// customer has already been answered; if it fails, the reply has still been
// sent and the thread is still correct (docs/Rules.md §4).

import type { BotRequest } from "../shared/handler-types.ts";
import { generateReply } from "../../lib/ai-client.ts";
import {
  crmSystemPrompt,
  LEAD_STATUSES,
  type LeadSnapshot,
  type LeadStatusValue,
  transcriptForCrm,
} from "./prompt.ts";

/**
 * What the agent wants changed.
 *
 * Every field is optional, and a field that is absent means "no opinion" — not
 * "clear it". The agent fills in what the conversation actually established and
 * stays quiet about the rest.
 */
export type CrmUpdate = {
  name?: string;
  email?: string;
  status?: LeadStatusValue;
  score?: number;
  tags?: string[];
  summary?: string;
  nextStep?: string;
};

export type CrmResult =
  | { ok: true; update: CrmUpdate }
  | { ok: false; reason: string };

/** JSON is short. Anything longer than this is the model ignoring the brief. */
const MAX_TOKENS = 400;

/** Sizes that keep a leads table readable, and a stray essay out of it. */
const MAX_NAME = 80;
const MAX_EMAIL = 200;
const MAX_TAGS = 4;
const MAX_TAG_LENGTH = 40;
const MAX_SUMMARY = 400;
const MAX_NEXT_STEP = 200;

export async function crmHandler(
  request: BotRequest,
  existing: LeadSnapshot | null,
): Promise<CrmResult> {
  const result = await generateReply({
    system: crmSystemPrompt(request, existing),
    messages: [
      {
        role: "user",
        content: transcriptForCrm(request.history, request.message),
      },
    ],
    maxTokens: MAX_TOKENS,
  });

  if (!result.ok) return { ok: false, reason: result.message };

  const parsed = parseJsonObject(result.text);

  if (!parsed) return { ok: false, reason: "The CRM agent did not answer with JSON." };

  return { ok: true, update: readUpdate(parsed) };
}

/**
 * Reads the object out of whatever came back.
 *
 * Models wrap JSON in a code fence often enough that refusing it would throw
 * away a perfectly good answer, so a fence is peeled off first.
 */
function parseJsonObject(raw: string): Record<string, unknown> | null {
  let text = raw.trim();

  if (text.startsWith("```")) {
    text = text.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end <= start) return null;

  try {
    const value: unknown = JSON.parse(text.slice(start, end + 1));

    if (!value || typeof value !== "object" || Array.isArray(value)) return null;

    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Keeps only what is both well-formed and worth writing down.
 *
 * Anything odd is dropped rather than corrected: the cost of ignoring one field
 * is that the record stays as it was, which is always a safe place to be.
 */
function readUpdate(parsed: Record<string, unknown>): CrmUpdate {
  const update: CrmUpdate = {};

  const name = readText(parsed.name, MAX_NAME);
  if (name) update.name = name;

  const email = readText(parsed.email, MAX_EMAIL);
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) update.email = email;

  if (isLeadStatus(parsed.status)) update.status = parsed.status;

  const score = readScore(parsed.score);
  if (score !== null) update.score = score;

  const tags = readTags(parsed.tags);
  if (tags.length > 0) update.tags = tags;

  const summary = readText(parsed.summary, MAX_SUMMARY);
  if (summary) update.summary = summary;

  const nextStep = readText(parsed.nextStep, MAX_NEXT_STEP);
  if (nextStep) update.nextStep = nextStep;

  return update;
}

/** A trimmed, capped string — or nothing, including for the literal "null". */
function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;

  const text = value.trim();

  if (!text || text.toLowerCase() === "null") return null;

  return text.slice(0, maxLength);
}

function isLeadStatus(value: unknown): value is LeadStatusValue {
  return (
    typeof value === "string" &&
    (LEAD_STATUSES as readonly string[]).includes(value)
  );
}

/** A whole number from 0 to 100. Anything else is not a score. */
function readScore(value: unknown): number | null {
  const score = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(score)) return null;

  return Math.min(100, Math.max(0, Math.round(score)));
}

function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const tags: string[] = [];

  for (const entry of value) {
    const tag = readText(entry, MAX_TAG_LENGTH);

    if (tag && !tags.includes(tag)) tags.push(tag);
    if (tags.length === MAX_TAGS) break;
  }

  return tags;
}

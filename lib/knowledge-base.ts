// The business's knowledge base: the answers its agent is allowed to give.
//
// Deliberately the simplest thing that works — a list of questions and the
// answers the owner wants given to them, in the order they arranged them. No
// uploads, no embeddings, no search index. A small business has a few dozen of
// these, and the whole list fits comfortably in one prompt, so anything cleverer
// would be machinery without a purpose (docs/Phases.md, Phase 7).
//
// This is also the boundary the no-fabrication rule rests on: an agent answers
// from here and from the setup answers, and if something isn't in either, it
// says so and fetches a person (docs/Rules.md §5).

import "server-only";

import { db } from "@/lib/db";

/** Room for a real answer, but not for a pasted document. */
export const MAX_QUESTION_LENGTH = 200;
export const MAX_ANSWER_LENGTH = 2000;

/**
 * How many entries one business may keep.
 *
 * A limit exists because every entry is sent to the model on every single
 * message: an unbounded list would quietly make each reply slower and dearer.
 * A hundred is far more than the FAQs any small business actually has.
 */
export const MAX_ENTRIES = 100;

export type KnowledgeEntryInput = {
  question: string;
  answer: string;
};

export type KnowledgeEntryRecord = KnowledgeEntryInput & {
  id: string;
  position: number;
};

/** The saved entries, in the order the owner put them in. */
export async function listEntries(
  businessId: string,
): Promise<KnowledgeEntryRecord[]> {
  const rows = await db.knowledgeEntry.findMany({
    where: { businessId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, question: true, answer: true, position: true },
  });

  return rows;
}

export type ValidationResult =
  | { ok: true; entries: KnowledgeEntryInput[] }
  | { ok: false; message: string; fields?: Record<string, string> };

/**
 * Checks a submitted list before any of it is saved.
 *
 * Rows left completely blank are dropped rather than rejected — someone who
 * added a row and changed their mind should not have to hunt for it.
 */
export function validateEntries(value: unknown): ValidationResult {
  if (!Array.isArray(value)) {
    return { ok: false, message: "We couldn't read those answers. Try again." };
  }

  const fields: Record<string, string> = {};
  const entries: KnowledgeEntryInput[] = [];

  value.forEach((raw, index) => {
    const question = String(
      (raw as Record<string, unknown> | null)?.question ?? "",
    ).trim();
    const answer = String(
      (raw as Record<string, unknown> | null)?.answer ?? "",
    ).trim();

    if (!question && !answer) return;

    if (!question) {
      fields[`question-${index}`] = "Add the question customers ask.";
    } else if (question.length > MAX_QUESTION_LENGTH) {
      fields[`question-${index}`] =
        `Keep the question under ${MAX_QUESTION_LENGTH} characters.`;
    }

    if (!answer) {
      fields[`answer-${index}`] = "Add the answer you want given.";
    } else if (answer.length > MAX_ANSWER_LENGTH) {
      fields[`answer-${index}`] =
        `Keep the answer under ${MAX_ANSWER_LENGTH} characters.`;
    }

    entries.push({ question, answer });
  });

  if (Object.keys(fields).length > 0) {
    return { ok: false, message: "Please check the highlighted answers.", fields };
  }

  if (entries.length > MAX_ENTRIES) {
    return {
      ok: false,
      message: `That's more than ${MAX_ENTRIES} answers. Trim the list a little — your agent reads all of them on every message.`,
    };
  }

  return { ok: true, entries };
}

/**
 * Replaces the whole list with what was submitted.
 *
 * Replace-all rather than a diff, because the editor hands back the complete
 * list every time and the rows have no meaning independent of their order. It
 * runs in one transaction, so a failure halfway leaves the old list intact
 * rather than half a knowledge base.
 */
export async function replaceEntries(
  businessId: string,
  entries: KnowledgeEntryInput[],
): Promise<void> {
  await db.$transaction([
    db.knowledgeEntry.deleteMany({ where: { businessId } }),
    db.knowledgeEntry.createMany({
      data: entries.map((entry, position) => ({
        businessId,
        question: entry.question,
        answer: entry.answer,
        position,
      })),
    }),
  ]);
}

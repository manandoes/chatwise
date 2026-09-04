// Checks on the setup wizard's answers.
//
// Runs in the browser for quick feedback and again on the server, which never
// trusts the browser's verdict (docs/Rules.md §3).

import {
  MAX_ANSWER_LENGTH,
  MAX_SHORT_ANSWER_LENGTH,
  type BotQuestion,
} from "@/bots/shared/config-types";

import { isValid, type ValidationErrors } from "@/lib/validation/auth";

// Re-exported so a setup screen only ever imports from this one module.
export { isValid };
export type { ValidationErrors };

export const CONNECTION_TYPES = ["QR", "API"] as const;
export type ConnectionTypeValue = (typeof CONNECTION_TYPES)[number];

export function isConnectionType(value: unknown): value is ConnectionTypeValue {
  return (
    typeof value === "string" &&
    (CONNECTION_TYPES as readonly string[]).includes(value)
  );
}

// ─── Step C: about the business ─────────────────────────────────────────────

export const MAX_BUSINESS_NAME_LENGTH = 120;

export type BusinessDetailsInput = {
  name: string;
  industry: string;
  about: string;
  answers: Record<string, string>;
};

/**
 * Validates the universal business questions plus whichever questions the
 * chosen agent asks. The questions come from that agent's own
 * `config-schema.ts`, so this doesn't need to know which agent it is.
 */
export function validateBusinessDetails(
  input: BusinessDetailsInput,
  questions: BotQuestion[],
): ValidationErrors {
  const errors: ValidationErrors = {};

  const name = input.name.trim();
  if (!name) {
    errors.name = "Enter your business name.";
  } else if (name.length > MAX_BUSINESS_NAME_LENGTH) {
    errors.name = "That name is too long.";
  }

  if (input.industry.trim().length > MAX_SHORT_ANSWER_LENGTH) {
    errors.industry = "Keep this shorter.";
  }

  if (input.about.trim().length > MAX_ANSWER_LENGTH) {
    errors.about = "Keep this under 2,000 characters.";
  }

  for (const question of questions) {
    const answer = (input.answers[question.id] ?? "").trim();

    if (question.required && !answer) {
      errors[question.id] = "This one's needed.";
      continue;
    }

    if (!answer) continue;

    if (question.type === "select") {
      const allowed = question.options?.some((o) => o.value === answer);
      if (!allowed) errors[question.id] = "Choose one of the options.";
      continue;
    }

    const limit =
      question.maxLength ??
      (question.type === "textarea" ? MAX_ANSWER_LENGTH : MAX_SHORT_ANSWER_LENGTH);

    if (answer.length > limit) {
      errors[question.id] = `Keep this under ${limit.toLocaleString()} characters.`;
    }
  }

  return errors;
}

/** Drops anything that isn't a question this agent actually asks. */
export function pickKnownAnswers(
  answers: Record<string, unknown>,
  questions: BotQuestion[],
): Record<string, string> {
  const known: Record<string, string> = {};

  for (const question of questions) {
    const value = answers[question.id];
    if (typeof value === "string" && value.trim()) {
      known[question.id] = value.trim();
    }
  }

  return known;
}

// ─── Step D: how it should behave ───────────────────────────────────────────

export const TONE_OPTIONS = [
  {
    value: "friendly",
    label: "Friendly",
    description: "Warm and casual. Uses the odd emoji.",
  },
  {
    value: "professional",
    label: "Professional",
    description: "Polite and businesslike. No slang.",
  },
  {
    value: "concise",
    label: "Straight to the point",
    description: "Short answers, no small talk.",
  },
  {
    value: "enthusiastic",
    label: "Enthusiastic",
    description: "Upbeat and energetic. Good for retail.",
  },
] as const;

export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "hi-en", label: "Hinglish (a mix)" },
  { value: "match", label: "Whatever the customer writes in" },
] as const;

export const MAX_ESCALATION_LENGTH = 1000;
export const MAX_ESCALATE_TO_LENGTH = 120;

export type BotBehaviorInput = {
  tone: string;
  language: string;
  escalationRules: string;
  escalateTo: string;
};

export function validateBotBehavior(input: BotBehaviorInput): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!TONE_OPTIONS.some((o) => o.value === input.tone)) {
    errors.tone = "Pick how it should come across.";
  }

  if (!LANGUAGE_OPTIONS.some((o) => o.value === input.language)) {
    errors.language = "Pick a language.";
  }

  const escalation = input.escalationRules.trim();
  if (!escalation) {
    // Not optional. An agent with no way out leaves a customer stuck talking to
    // software with no route to a person (docs/Rules.md §5).
    errors.escalationRules = "Say when it should fetch a person.";
  } else if (escalation.length > MAX_ESCALATION_LENGTH) {
    errors.escalationRules = "Keep this under 1,000 characters.";
  }

  if (input.escalateTo.trim().length > MAX_ESCALATE_TO_LENGTH) {
    errors.escalateTo = "Keep this shorter.";
  }

  return errors;
}

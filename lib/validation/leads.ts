// The vocabulary of a lead, and the checks on anything a person types into one.
//
// Two readers, which is why it is here rather than in either of them:
//
//   * the dashboard, which needs the statuses in plain English and has to check
//     a form before sending it, and
//   * the CRM agent, which needs the same statuses to choose between.
//
// The agent's own file used to own this list. It cannot: the dashboard would
// then be importing an agent's prompt into the browser to find out what
// "QUALIFIED" is called, and bot instructions belong only in bot folders
// (docs/Rules.md §2). The statuses are a fact about the database, not about the
// agent, so they live where both can read them.
//
// Nothing server-only and no "@/" shortcuts on purpose: this file is bundled
// for the browser *and* loaded by the always-on worker host under plain Node.

/** Where a contact has got to. Kept in step with the LeadStatus enum. */
export const LEAD_STATUSES = [
  "NEW",
  "INTERESTED",
  "QUALIFIED",
  "NOT_A_FIT",
  "CUSTOMER",
] as const;

export type LeadStatusValue = (typeof LEAD_STATUSES)[number];

export function isLeadStatus(value: unknown): value is LeadStatusValue {
  return (
    typeof value === "string" &&
    (LEAD_STATUSES as readonly string[]).includes(value)
  );
}

/** What each status is called on screen, and what it means (docs/Rules.md §7). */
export const LEAD_STATUS_OPTIONS: {
  value: LeadStatusValue;
  label: string;
  hint: string;
}[] = [
  { value: "NEW", label: "New", hint: "Has messaged, nothing established yet." },
  {
    value: "INTERESTED",
    label: "Interested",
    hint: "Asked about something specific.",
  },
  {
    value: "QUALIFIED",
    label: "Qualified",
    hint: "Fits what a good enquiry looks like for you.",
  },
  {
    value: "NOT_A_FIT",
    label: "Not a fit",
    hint: "Doesn't fit, or said no.",
  },
  { value: "CUSTOMER", label: "Customer", hint: "Has bought." },
];

export function leadStatusLabel(status: string): string {
  return (
    LEAD_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    status
  );
}

// Limits. Generous enough that nobody meets them in normal use, small enough
// that a paste of somebody's entire inbox does not land in the database.
export const MAX_LEAD_NAME_LENGTH = 120;
export const MAX_LEAD_EMAIL_LENGTH = 200;
export const MAX_LEAD_TEXT_LENGTH = 1000;
export const MAX_LEAD_NOTES_LENGTH = 4000;
export const MAX_LEAD_TAGS = 10;
export const MAX_LEAD_TAG_LENGTH = 40;

/** What a person may change about a lead, as the form holds it. */
export type LeadEditInput = {
  name: string;
  email: string;
  status: string;
  /** Empty means "no score", which is different from a score of zero. */
  score: string;
  /** Typed as one comma-separated line — the way people write a list. */
  tags: string;
  summary: string;
  nextStep: string;
  notes: string;
  letTheAgentUpdateThis: boolean;
};

/** The same thing, checked and tidied, ready for the database. */
export type LeadEdit = {
  name: string | null;
  email: string | null;
  status: LeadStatusValue;
  score: number | null;
  tags: string[];
  summary: string | null;
  nextStep: string | null;
  notes: string | null;
  letTheAgentUpdateThis: boolean;
};

export type LeadEditErrors = Partial<Record<keyof LeadEditInput, string>>;

/** Splits the tag line the way somebody would expect it to split. */
export function readTags(value: string): string[] {
  const seen = new Set<string>();

  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => {
      if (!tag || seen.has(tag.toLowerCase())) return false;

      seen.add(tag.toLowerCase());

      return true;
    });
}

/**
 * Checks a lead edit.
 *
 * Runs in the browser for quick feedback and again on the server, which never
 * trusts the browser's verdict (docs/Rules.md §3).
 */
export function validateLeadEdit(
  input: LeadEditInput,
):
  | { ok: true; edit: LeadEdit }
  | { ok: false; errors: LeadEditErrors } {
  const errors: LeadEditErrors = {};

  const name = input.name.trim();
  const email = input.email.trim();
  const score = input.score.trim();
  const summary = input.summary.trim();
  const nextStep = input.nextStep.trim();
  const notes = input.notes.trim();
  const tags = readTags(input.tags);

  if (name.length > MAX_LEAD_NAME_LENGTH) {
    errors.name = `Keep the name under ${MAX_LEAD_NAME_LENGTH} characters.`;
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "That doesn't look like an email address.";
  } else if (email.length > MAX_LEAD_EMAIL_LENGTH) {
    errors.email = "That email address is too long.";
  }

  if (!isLeadStatus(input.status)) {
    errors.status = "Choose one of the statuses listed.";
  }

  let scoreValue: number | null = null;

  if (score) {
    const parsed = Number(score);

    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
      errors.score = "A score is a whole number between 0 and 100.";
    } else {
      scoreValue = parsed;
    }
  }

  if (tags.length > MAX_LEAD_TAGS) {
    errors.tags = `That's more than ${MAX_LEAD_TAGS} tags. Keep the ones that matter.`;
  } else if (tags.some((tag) => tag.length > MAX_LEAD_TAG_LENGTH)) {
    errors.tags = `Each tag needs to be under ${MAX_LEAD_TAG_LENGTH} characters.`;
  }

  if (summary.length > MAX_LEAD_TEXT_LENGTH) {
    errors.summary = `Keep this under ${MAX_LEAD_TEXT_LENGTH} characters.`;
  }

  if (nextStep.length > MAX_LEAD_TEXT_LENGTH) {
    errors.nextStep = `Keep this under ${MAX_LEAD_TEXT_LENGTH} characters.`;
  }

  if (notes.length > MAX_LEAD_NOTES_LENGTH) {
    errors.notes = `Keep your notes under ${MAX_LEAD_NOTES_LENGTH} characters.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    edit: {
      name: name || null,
      email: email || null,
      status: input.status as LeadStatusValue,
      score: scoreValue,
      tags,
      summary: summary || null,
      nextStep: nextStep || null,
      notes: notes || null,
      letTheAgentUpdateThis: input.letTheAgentUpdateThis === true,
    },
  };
}

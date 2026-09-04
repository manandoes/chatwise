// The shape every bot uses to describe itself and the questions it needs
// answered during setup.
//
// Each bot folder has a `config-schema.ts` built from these types. The
// onboarding wizard reads them to decide which questions to put on screen —
// which is why a Sales agent asks about pricing and an Appointment agent asks
// about your calendar, without the wizard knowing anything about either.

/** The bots a customer can actually choose. */
export type BotType =
  | "RECEPTIONIST"
  | "LEAD_QUALIFIER"
  | "APPOINTMENT"
  | "SALES"
  | "SUPPORT"
  | "FOLLOW_UP"
  | "PERSONAL_SHOPPER"
  | "FEEDBACK"
  | "INTERNAL";

/**
 * Note there is deliberately no "CRM" here. The CRM agent runs in the
 * background alongside whichever bot was chosen and is never a selectable
 * option (docs/PRD.md §3.1) — leaving it out of this list means the choice
 * cannot be made by mistake anywhere in the app.
 */

export type QuestionType = "text" | "textarea" | "select";

export type BotQuestion = {
  /** Stored as the key in the agent's saved answers. */
  id: string;
  /** Plain-English label shown above the box (docs/Rules.md §7). */
  label: string;
  /** Short helper text under the label, explaining why we're asking. */
  hint?: string;
  type: QuestionType;
  placeholder?: string;
  required?: boolean;
  /** Only for `select` questions. */
  options?: { value: string; label: string }[];
  /** Guards against someone pasting a novel into a text box. */
  maxLength?: number;
};

export type BotConfigSchema = {
  type: BotType;
  /** What this bot is called on screen. */
  name: string;
  /** One line, used on the picker card. */
  tagline: string;
  /** What sets it off, in the customer's words. */
  trigger: string;
  /** Lucide icon name, resolved by the picker. */
  icon: string;
  /** The questions this bot needs answered in setup Step C. */
  questions: BotQuestion[];
};

/** Longest answer we accept for a free-text setup question. */
export const MAX_ANSWER_LENGTH = 2000;

/** Longest answer we accept for a single-line setup question. */
export const MAX_SHORT_ANSWER_LENGTH = 200;

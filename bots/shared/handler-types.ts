// The shape of a conversation as an agent sees it, and the shape of its answer.
//
// Every agent in /bots takes a `BotRequest` and returns a `BotResponse`. The
// message router builds the request and acts on the response, and knows nothing
// else about any particular agent — which is what let Phase 8 add eight more
// agents without the router changing at all.
//
// Note the imports here are relative and carry .ts extensions. These files are
// loaded both by the Next.js app and by the always-on WhatsApp session manager,
// which runs under plain Node and doesn't read the "@/..." shortcuts.

import type { BotType } from "./config-types.ts";

/** What the business is, in the words its owner used during setup. */
export type BusinessProfile = {
  name: string | null;
  industry: string | null;
  about: string | null;
  timezone: string;
};

/** The account's single agent, and how its owner asked it to behave. */
export type AgentSettings = {
  botType: BotType;
  /** Answers to that agent's own setup questions, keyed by question id. */
  config: Record<string, string>;
  tone: string | null;
  language: string | null;
  escalationRules: string | null;
  /** Who the customer gets handed to, in words the customer will see. */
  escalateTo: string | null;
};

/** One question-and-answer pair from the business's knowledge base. */
export type KnowledgeItem = {
  question: string;
  answer: string;
};

/** One earlier message in this thread, oldest first. */
export type ConversationTurn = {
  who: "customer" | "agent";
  text: string;
};

export type BotRequest = {
  business: BusinessProfile;
  agent: AgentSettings;
  knowledge: KnowledgeItem[];
  /** The thread so far, not including the message being answered. */
  history: ConversationTurn[];
  /** What the customer just said. */
  message: string;
  /** Whatever name WhatsApp reports for them, if any. */
  contactName: string | null;
};

/**
 * What an agent decided to do.
 *
 * `escalate` is not a failure — it is the agent correctly refusing to guess.
 * Every agent must be able to reach it (docs/Rules.md §5), and the customer
 * still gets a sentence so they are never left staring at silence.
 *
 * `unavailable` is our problem, not the customer's: the model timed out, or no
 * key is configured. The router says something honest and does not pretend the
 * agent answered.
 */
export type BotResponse =
  | { kind: "reply"; text: string }
  | { kind: "escalate"; text: string; reason: string }
  | { kind: "unavailable"; text: string; reason: string };

/** Every agent's handler has this signature. */
export type BotHandler = (request: BotRequest) => Promise<BotResponse>;

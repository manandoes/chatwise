// What the Follow-up agent is told about itself.
//
// This is the only place this agent's instructions exist (docs/Rules.md §2).
//
// It chases quotes that went quiet (docs/PRD.md §5, row 6), which makes it the
// one agent that sometimes speaks first. So it has two sets of instructions:
//
//   * the nudge — what it writes when a quote has gone unanswered, and
//   * the conversation — how it behaves once the person writes back.
//
// The timer that decides *when* to nudge is a background job
// (jobs/follow-up-scheduler.ts, docs/Phases.md Phase 12). This file is the part
// that knows what to say; it does not know what time it is.

import type { BotRequest } from "../shared/handler-types.ts";
import {
  type AnswerLabels,
  describeBusiness,
  describeKnowledge,
  describeSetupAnswers,
  groundRules,
} from "../shared/prompt-shared.ts";

/** How this agent's setup answers are introduced to the model. */
const ANSWER_LABELS: AnswerLabels = {
  whatYouQuote: "What the business sends quotes for",
  waitBefore: "How long to leave it before chasing",
  maxFollowUps: "How many times to chase, at most",
  followUpTone: "What the owner wants the nudge to say",
};

/** The dropdown codes, spelled out so they never reach a customer. */
const WAIT_IN_WORDS: Record<string, string> = {
  "1d": "A day",
  "3d": "Three days",
  "7d": "A week",
  "14d": "Two weeks",
};

const ATTEMPTS_IN_WORDS: Record<string, string> = {
  "1": "Once",
  "2": "Twice",
  "3": "Three times",
};

/** The setup answers with the dropdown codes turned back into English. */
function readableConfig(config: Record<string, string>): Record<string, string> {
  const readable = { ...config };

  if (readable.waitBefore) {
    readable.waitBefore = WAIT_IN_WORDS[readable.waitBefore] ?? readable.waitBefore;
  }

  if (readable.maxFollowUps) {
    readable.maxFollowUps =
      ATTEMPTS_IN_WORDS[readable.maxFollowUps] ?? readable.maxFollowUps;
  }

  return readable;
}

/** The parts both sets of instructions share: who this business is. */
function context(request: BotRequest): string[] {
  const { business, agent, knowledge } = request;

  return [
    "ABOUT THE BUSINESS",
    "",
    describeBusiness(business),
    "",
    "WHAT THE OWNER TOLD US DURING SETUP",
    "",
    describeSetupAnswers(readableConfig(agent.config), ANSWER_LABELS),
    "",
    "THE KNOWLEDGE BASE",
    "",
    "Answers the owner has written out. Prefer them, and stay close to their wording.",
    "",
    describeKnowledge(knowledge),
  ];
}

/**
 * How it behaves once the person writes back — which is the ordinary case, and
 * the one the message router uses.
 */
export function followUpSystemPrompt(request: BotRequest): string {
  const { business, agent } = request;
  const businessName = business.name?.trim() || "this business";

  return [
    `You are following up on quotes for ${businessName} on WhatsApp.`,
    "",
    "Someone was sent a quote and has now written back. Your job is to pick that thread up: answer what they ask if you can, find out where they have got to, and get them to a person if they are ready to go ahead.",
    "",
    "You cannot change a quote, discount it, take a payment or book anything in. You only know what is written here.",
    "",
    ...context(request),
    "",
    groundRules(agent),
    "",
    "A FEW THINGS SPECIFIC TO YOU",
    "",
    "- You do not have the quote in front of you. Never restate a price, a scope or a date from it, and never guess at what was in it — if they ask about a number, hand over to someone who can see it.",
    "- If they are interested, say so is good news, tell them someone will pick it up, and hand over. Do not try to close it yourself.",
    "- If they say no, or not now, accept it in one line and do not push. Thank them, leave the door open, and stop. Nobody is talked into a kitchen by a chat.",
    "- If they ask for something to be changed or re-quoted, that is a person's job. Hand over.",
    "- Never chase within the same conversation. Someone who has written back is not being chased any more.",
  ].join("\n");
}

/**
 * What it writes when a quote has gone quiet — the nudge itself.
 *
 * `attempt` is which chase this is (1 for the first). It matters: a second
 * nudge that reads exactly like the first is how a business ends up blocked.
 */
export function followUpNudgePrompt(
  request: BotRequest,
  attempt: number,
): string {
  const { business, agent } = request;
  const businessName = business.name?.trim() || "this business";
  const attempts = Number(agent.config.maxFollowUps) || 1;
  const isLast = attempt >= attempts;

  return [
    `You write follow-up messages for ${businessName} on WhatsApp.`,
    "",
    `Someone was sent a quote and has not replied. Write the message that goes to them now. This is follow-up number ${attempt}${isLast ? ", and the last one they will get" : ""}.`,
    "",
    "Nobody has asked you anything — you are starting this. That is a privilege and it is easy to abuse, so the message is short, it is easy to ignore, and it never implies they owe you an answer.",
    "",
    ...context(request),
    "",
    groundRules(agent),
    "",
    "A FEW THINGS SPECIFIC TO THIS MESSAGE",
    "",
    "- Two sentences at most. One is often better.",
    "- Say what it is about, so they know which quote you mean, and give them an easy way to answer — a question they can reply to in three words.",
    "- Follow the gist the owner asked for, in their tone.",
    "- Never restate the price or the details of the quote. You cannot see it.",
    "- No pressure and no false urgency. Do not invent a deadline, a price rise or an offer that is about to end.",
    attempt > 1
      ? "- They have already had a nudge from you and did not answer. Say something different this time, and say less."
      : null,
    isLast
      ? "- This is the last time you will write. Say plainly that you will leave it there, and that they are welcome to get in touch whenever suits — then it is genuinely finished."
      : null,
    "",
    "Write only the message itself. No greeting line of its own, no sign-off, no explanation of what you are doing.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

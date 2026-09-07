// Where every inbound WhatsApp message goes.
//
// There are two very different ways a message reaches ChatWise — Meta posting
// to a webhook, and a QR-tier worker process noticing one on a phone — and
// exactly one thing that happens next. That thing is this file. Both connectors
// call `routeInboundMessage` and neither knows what an agent is; this file
// knows nothing about signatures, browsers or queues.
//
// It always routes to the account's one chosen agent (docs/PRD.md §3.1), so
// there is no routing decision to make yet. It is still worth having as a
// single entry point: it is where "record it, decide, reply, remember what
// happened" lives, and it is the one place a second agent would ever be chosen
// if the product grows one.
//
// The imports are relative and carry .ts extensions on purpose. This file is
// loaded by the Next.js app *and* by the always-on WhatsApp session manager,
// which runs under plain Node and does not read the "@/..." shortcuts.

import { crmHandler } from "../bots/crm-bot/handler.ts";
import { handlerFor } from "../bots/shared/handlers.ts";
import type {
  BotRequest,
  BotResponse,
  ConversationTurn,
} from "../bots/shared/handler-types.ts";
import { HISTORY_LIMIT } from "../bots/shared/prompt-shared.ts";
import type { BotType } from "../bots/shared/config-types.ts";
import { db } from "../lib/db.ts";
import { isAiConfigured } from "../lib/ai-client.ts";
import { applyAgentUpdate, readLeadSnapshot } from "../lib/leads.ts";
import { checkMessageQuota } from "../lib/usage.ts";
import {
  OPT_IN_CONFIRMATION,
  OPT_OUT_CONFIRMATION,
  readOptOutIntent,
  recordOptOut,
  removeOptOut,
} from "../campaigns/opt-out.ts";

/** A message that just arrived, as either connector describes it. */
export type InboundMessage = {
  /** Which ChatWise connection it came in on. Never taken from the payload. */
  connectionId: string;
  /** The customer's number, any format — it is reduced to digits here. */
  from: string;
  /**
   * What they said.
   *
   * For anything that is not text — a photo, a voice note, a location — the
   * connector puts a short description here instead, e.g. "Sent a photo", and
   * sets `answerable` to false. That way the thread shows the owner that
   * something arrived, without an agent being handed a sentence the customer
   * never wrote.
   */
  text: string;
  /**
   * False when the message is not something an agent can read. Defaults to
   * true.
   */
  answerable?: boolean;
  /** Whatever name WhatsApp reports for them, if any. */
  contactName?: string | null;
  /**
   * WhatsApp's own id for the message.
   *
   * Worth passing whenever it is known: it is what stops a re-delivered webhook
   * turning into a second reply to the same customer.
   */
  externalId?: string | null;
  /** When it was sent, if the connector knows. */
  at?: Date;
};

/** How the reply gets back to the customer. Supplied by whoever called us. */
export type DeliverReply = (message: {
  to: string;
  body: string;
}) => Promise<{ ok: boolean; message?: string }>;

/**
 * What the router did, for the caller's logs and for tests.
 *
 * `ignored` covers everything that never reached an agent: a duplicate, an
 * empty message, an account that has not finished setting up. None of those is
 * an error.
 */
export type RouteOutcome =
  | { status: "ignored"; reason: string }
  | { status: "recorded"; reason: string; conversationId: string }
  | {
      status: "answered";
      conversationId: string;
      escalated: boolean;
      delivered: boolean;
    };

/**
 * Handles one inbound message, start to finish.
 *
 * Never throws at the caller. A webhook that 500s makes Meta retry, and a
 * worker that crashes takes a customer's WhatsApp down with it — so anything
 * unexpected is logged here and reported as an outcome instead.
 */
export async function routeInboundMessage(
  inbound: InboundMessage,
  deliver: DeliverReply,
): Promise<RouteOutcome> {
  try {
    return await route(inbound, deliver);
  } catch (error) {
    console.error("[router] failed to handle an inbound message", error);

    return { status: "ignored", reason: "unexpected error" };
  }
}

async function route(
  inbound: InboundMessage,
  deliver: DeliverReply,
): Promise<RouteOutcome> {
  const text = inbound.text?.trim() ?? "";
  const contactPhone = inbound.from.replace(/\D/g, "");

  if (!text) return { status: "ignored", reason: "no text to answer" };
  if (!contactPhone) return { status: "ignored", reason: "no sender number" };

  const connection = await db.whatsAppConnection.findUnique({
    where: { id: inbound.connectionId },
    select: {
      id: true,
      businessId: true,
      business: {
        select: {
          id: true,
          name: true,
          industry: true,
          about: true,
          timezone: true,
          onboardingCompletedAt: true,
          agent: true,
        },
      },
    },
  });

  if (!connection) {
    // The connection was deleted while a message was in flight.
    return { status: "ignored", reason: "no such connection" };
  }

  const business = connection.business;
  const receivedAt = inbound.at ?? new Date();

  // One thread per contact per business. Created on first contact, reused
  // forever after.
  const conversation = await db.conversation.upsert({
    where: {
      businessId_contactPhone: { businessId: business.id, contactPhone },
    },
    create: {
      businessId: business.id,
      contactPhone,
      contactName: inbound.contactName?.trim() || null,
      lastMessageAt: receivedAt,
    },
    update: { lastMessageAt: receivedAt },
  });

  // Fill in a name if we never had one. Never overwrite one we do have: the
  // name comes from whatever the customer set on their own phone, and a person
  // may since have corrected it in the dashboard.
  const contactName = inbound.contactName?.trim();

  if (contactName && !conversation.contactName) {
    conversation.contactName = contactName;
    await db.conversation.update({
      where: { id: conversation.id },
      data: { contactName },
    });
  }

  // Recorded before anything else happens, and before any thinking is paid
  // for. If this is a message we have already seen, its id is already in the
  // table, nothing is written, and the customer is not answered twice.
  const recorded = await db.message.createMany({
    data: [
      {
        conversationId: conversation.id,
        direction: "INBOUND",
        author: "CONTACT",
        body: text,
        externalId: inbound.externalId ?? null,
      },
    ],
    // A message we already have is skipped rather than raised: a re-delivery is
    // an ordinary event, not a failure, and it should not fill the logs with
    // database errors on a busy day.
    skipDuplicates: true,
  });

  if (recorded.count === 0) {
    return { status: "ignored", reason: "already handled this message" };
  }

  await countInbound(connection.id, receivedAt);

  // One more thing the owner hasn't seen yet. Counted here rather than at the
  // upsert above so that a webhook Meta re-sends doesn't make the inbox claim
  // two messages arrived (docs/Phases.md, Phase 9).
  await db.conversation
    .update({
      where: { id: conversation.id },
      data: { unreadCount: { increment: 1 } },
    })
    .catch(() => {});

  // Somebody writing back is the strongest thing a campaign ever hears, so it
  // is recorded before anything else is decided about this message.
  await noteCampaignReply(conversation.id, receivedAt);

  // ── STOP means stop, whatever else is going on ─────────────────────────
  // Checked before the agent, before the "a person is handling this" rule, and
  // before setup is even complete: an unsubscribe request is a promise the
  // product makes, not a feature of the agent (docs/Rules.md §8). Only real
  // text is examined — "Sent a photo" is our own description, not something
  // the customer typed.

  if (inbound.answerable !== false) {
    const intent = readOptOutIntent(text);

    if (intent) {
      await (intent === "OPT_OUT"
        ? recordOptOut(business.id, contactPhone, text.trim())
        : removeOptOut(business.id, contactPhone));

      // Confirmed even when a person has taken the thread over. It is an
      // acknowledgement rather than a conversation, and somebody who asked to
      // be left alone should not be left wondering whether it worked.
      await answerDirectly(
        intent === "OPT_OUT" ? OPT_OUT_CONFIRMATION : OPT_IN_CONFIRMATION,
        { conversation, contactPhone, deliver },
      );

      return {
        status: "recorded",
        reason:
          intent === "OPT_OUT"
            ? "this contact unsubscribed"
            : "this contact subscribed again",
        conversationId: conversation.id,
      };
    }
  }

  // ── Reasons the agent stays quiet ──────────────────────────────────────
  // In each of these the message is still recorded above, so the owner sees it
  // in Conversations and can answer it themselves. Saying nothing is the right
  // answer; saying something wrong is not.

  if (!business.onboardingCompletedAt || !business.agent) {
    return {
      status: "recorded",
      reason: "this account has no agent set up yet",
      conversationId: conversation.id,
    };
  }

  const agent = business.agent;

  // The thread as an agent sees it. Built on demand, because it costs two more
  // queries and there are messages that never reach an agent at all.
  const buildRequest = async (): Promise<BotRequest> => ({
    business: {
      name: business.name,
      industry: business.industry,
      about: business.about,
      timezone: business.timezone,
    },
    agent: {
      botType: agent.botType as BotType,
      config: readConfig(agent.config),
      tone: agent.tone,
      language: agent.language,
      escalationRules: agent.escalationRules,
      escalateTo: agent.escalateTo,
    },
    knowledge: await readKnowledge(business.id),
    history: await readHistory(conversation.id),
    message: text,
    contactName: conversation.contactName,
  });

  if (conversation.escalatedAt) {
    // A person is already dealing with this thread. Chiming in over them is
    // exactly the bot loop docs/Rules.md §5 forbids.
    //
    // The CRM agent is the exception, and deliberately so: it says nothing to
    // anybody, and a record that stops keeping up the moment a human takes over
    // would be wrong exactly when the conversation matters most.
    if (inbound.answerable !== false) {
      await keepTheCrmUpToDate(await buildRequest(), {
        businessId: business.id,
        conversationId: conversation.id,
        contactPhone,
      });
    }

    return {
      status: "recorded",
      reason: "waiting for a person",
      conversationId: conversation.id,
    };
  }

  // Out of messages for the month.
  //
  // The agent stops here rather than sending, and a person is asked to take
  // over. The customer still gets one sentence and a route to a human, because
  // going silent on somebody mid-conversation is exactly what docs/Rules.md §5
  // forbids — and because the thread is now waiting for a person, their next
  // message doesn't produce the same sentence again.
  //
  // Replying by hand in the inbox is deliberately **not** limited. A plan caps
  // what the automation does; it does not stop an owner answering their own
  // customer.
  const quota = await checkMessageQuota(business.id);

  if (!quota.ok) {
    return await respond(
      {
        // `unavailable` rather than `escalate`, and the difference matters in
        // the numbers: this sentence is ChatWise speaking, not the agent. Filed
        // as the agent's reply it would flatter both the reply counts and the
        // answer times in Analytics with work the agent never did.
        kind: "unavailable",
        text: "Thanks for your message — someone from the team will get back to you shortly.",
        // Only the business ever sees this; the customer is never told anything
        // about somebody else's billing.
        reason: quota.message,
      },
      { conversation, connection, contactPhone, botType: null, deliver },
    );
  }

  if (inbound.answerable === false) {
    // A photo, a voice note, a location. Reading those is not something any
    // agent can do today, and guessing at what was in it would be worse than
    // admitting it. One sentence, then a person takes over — and because the
    // thread is now waiting, further photos don't produce the same sentence
    // again.
    return await respond(
      {
        kind: "escalate",
        text: "Thanks — I can only read text messages, so I've asked someone from the team to take a look.",
        reason: "The customer sent something that isn't text.",
      },
      { conversation, connection, contactPhone, botType: null, deliver },
    );
  }

  const handler = handlerFor(agent.botType as BotType);

  if (!handler) {
    // A bot type with no folder behind it. Every agent in the catalogue is
    // built (docs/Phases.md, Phase 8), so this is the guard against a tenth
    // being added to the enum before its folder exists: flag the thread and
    // tell the customer a person is coming, rather than guessing at what that
    // agent would have said.
    return await respond(
      {
        kind: "escalate",
        text: "Thanks for your message — someone from the team will get back to you shortly.",
        reason: `The ${agent.botType} agent isn't available yet.`,
      },
      { conversation, connection, contactPhone, botType: null, deliver },
    );
  }

  const request = await buildRequest();

  const answer = await handler(request);

  const outcome = await respond(answer, {
    conversation,
    connection,
    contactPhone,
    botType: agent.botType as BotType,
    deliver,
  });

  // The CRM agent runs alongside whichever agent replied (docs/PRD.md §5) —
  // after the customer has been answered, never before. It is a record-keeping
  // job, and nobody should wait longer for a reply because of it.
  await keepTheCrmUpToDate(request, {
    businessId: business.id,
    conversationId: conversation.id,
    contactPhone,
  });

  return outcome;
}

/**
 * Keeps the contact's CRM record in step with the conversation.
 *
 * The always-on agent from docs/PRD.md §5, row 10. It runs on every account,
 * alongside whichever agent was chosen, and it is never allowed to matter: a
 * failure here is logged and swallowed, because the customer has already been
 * answered and a missing lead update is not worth an exception travelling back
 * to a webhook.
 *
 * What it may actually change is decided in lib/leads.ts, not here and not by
 * the agent — a field a person edited by hand stays theirs (docs/Rules.md §5).
 */
async function keepTheCrmUpToDate(
  request: BotRequest,
  where: { businessId: string; conversationId: string; contactPhone: string },
) {
  // No key, no CRM agent — and no second complaint in the logs about it, since
  // whichever agent just replied has already said so.
  if (!isAiConfigured()) return;

  // The Internal agent answers the business's own staff, not its customers
  // (docs/PRD.md §5, row 9). A CRM record is a customer record, and filling the
  // leads list with colleagues — scored out of a hundred — would be worse than
  // useless. It also saves a model call on every staff message.
  if (request.agent.botType === "INTERNAL") return;

  try {
    const existing = await readLeadSnapshot(where.conversationId);
    const result = await crmHandler(request, existing);

    if (!result.ok) {
      // The reason is about the model, never about what was said.
      console.warn("[router] the CRM agent had nothing usable:", result.reason);

      return;
    }

    await applyAgentUpdate({ ...where, update: result.update });
  } catch (error) {
    console.error("[router] could not update the CRM record", error);
  }
}

/**
 * Sends whatever the agent decided, and writes down what happened.
 *
 * Every path through here sends the customer something. A message that arrives
 * and gets nothing back is the one outcome worth avoiding, whether the agent
 * answered, handed over, or could not think at all.
 */
async function respond(
  answer: BotResponse,
  context: {
    conversation: { id: string };
    connection: { id: string };
    contactPhone: string;
    botType: BotType | null;
    deliver: DeliverReply;
  },
): Promise<RouteOutcome> {
  const { conversation, contactPhone, botType, deliver } = context;
  const escalated = answer.kind !== "reply";

  const sent = await deliver({ to: contactPhone, body: answer.text }).catch(
    (error: unknown) => {
      console.error("[router] could not deliver a reply", error);

      return { ok: false, message: "The reply could not be sent." };
    },
  );

  await db.message.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      // An "I can't answer this" from ChatWise itself is not the agent
      // speaking, and the inbox should not pretend otherwise.
      author: answer.kind === "unavailable" ? "SYSTEM" : "AGENT",
      body: answer.text,
      botType: answer.kind === "unavailable" ? null : botType,
      failureReason: sent.ok ? null : (sent.message ?? "Not sent."),
    },
  });

  await db.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      // Handing over marks the thread as waiting for a person. It stays that
      // way, and the agent stays quiet, until somebody clears it in
      // Conversations.
      //
      // `escalatedBy` records that this was the agent asking for help rather
      // than somebody in the inbox stepping in. The two look identical to the
      // router — both mean stay quiet — and completely different to whoever is
      // reading the inbox.
      ...(answer.kind === "reply"
        ? {}
        : {
            escalatedAt: new Date(),
            escalatedBy: "AGENT" as const,
            escalationReason: answer.reason,
          }),
    },
  });

  return {
    status: "answered",
    conversationId: conversation.id,
    escalated,
    delivered: sent.ok,
  };
}

/** The thread so far, oldest first, as the agent should see it. */
async function readHistory(conversationId: string): Promise<ConversationTurn[]> {
  const rows = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    // One more than the agent is shown, because the newest row is the message
    // being answered and is passed separately.
    take: HISTORY_LIMIT + 1,
    select: { direction: true, body: true },
  });

  return rows
    .slice(1)
    .reverse()
    .map((row) => ({
      who: row.direction === "INBOUND" ? ("customer" as const) : ("agent" as const),
      text: row.body,
    }));
}

/** The business's knowledge base, in the order its owner arranged it. */
async function readKnowledge(businessId: string) {
  const rows = await db.knowledgeEntry.findMany({
    where: { businessId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { question: true, answer: true },
  });

  return rows;
}

/**
 * The agent's saved setup answers.
 *
 * Stored as JSON, so it is whatever was written last — worth checking rather
 * than trusting, since an old row could hold anything.
 */
function readConfig(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const config: Record<string, string> = {};

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") config[key] = entry;
  }

  return config;
}

/**
 * Marks a bulk message as having been replied to.
 *
 * A campaign's only real measure of success. Only the most recent one is
 * credited, and only once — somebody chatting for a week should not turn one
 * broadcast into seven replies.
 */
async function noteCampaignReply(conversationId: string, at: Date) {
  const waiting = await db.campaignRecipient.findFirst({
    where: {
      conversationId,
      status: { in: ["SENT", "DELIVERED", "READ"] },
      repliedAt: null,
    },
    orderBy: { sentAt: "desc" },
    select: { id: true },
  });

  if (!waiting) return;

  await db.campaignRecipient
    .update({
      where: { id: waiting.id },
      data: { status: "REPLIED", repliedAt: at },
    })
    .catch(() => {});
}

/**
 * Says one thing back, from ChatWise itself rather than from an agent.
 *
 * Used only for the unsubscribe acknowledgements. It deliberately does not go
 * through `respond`: nothing here hands the thread to a person or changes who
 * is answering it.
 */
async function answerDirectly(
  body: string,
  context: {
    conversation: { id: string };
    contactPhone: string;
    deliver: DeliverReply;
  },
) {
  const sent = await context
    .deliver({ to: context.contactPhone, body })
    .catch((error: unknown) => {
      console.error("[router] could not confirm an unsubscribe", error);

      return { ok: false, message: "The reply could not be sent." };
    });

  await db.message.create({
    data: {
      conversationId: context.conversation.id,
      direction: "OUTBOUND",
      author: "SYSTEM",
      body,
      failureReason: sent.ok ? null : (sent.message ?? "Not sent."),
    },
  });

  await db.conversation.update({
    where: { id: context.conversation.id },
    data: { lastMessageAt: new Date() },
  });
}

/**
 * Keeps the connection's health honest.
 *
 * Counting happens here rather than in each connector so that both tiers count
 * the same things the same way (docs/Rules.md §4).
 */
async function countInbound(connectionId: string, at: Date) {
  await db.whatsAppConnection
    .update({
      where: { id: connectionId },
      data: {
        messagesReceived: { increment: 1 },
        lastMessageAt: at,
        // Traffic arriving is proof the connection works.
        status: "CONNECTED",
        lastError: null,
      },
    })
    .catch(() => {});
}

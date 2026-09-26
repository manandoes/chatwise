// Building a bulk send, and letting it out one message at a time.
//
// This is the file docs/Rules.md §8 is about. Everything it refuses to do is
// deliberate, and none of it is a convenience that can be traded away:
//
//   * **The 25-recipient cap on the QR tier is enforced here**, from
//     `capabilitiesFor(tier).maxBulkRecipients`, not from a number typed into
//     this file. The screen disables the button too; that is the second lock,
//     not the first.
//   * **The mandatory ban-risk warning must have been accepted** before a
//     QR-tier campaign can be scheduled (docs/PRD.md §7.2).
//   * **Opt-outs are checked twice** — when the list is built, and again as
//     each message comes due, because those can be days apart.
//   * **Every message carries an opt-out line.**
//   * **Nobody is messaged twice.** A recipient row is claimed atomically
//     before it is sent, and a send interrupted half-way is failed rather than
//     retried, because "possibly sent twice" is worse than "definitely not
//     sent" when the cost is somebody's phone number being banned.
//   * **One campaign at a time per account.** Two overlapping sends would
//     double the rate the throttle was chosen to hold.
//
// Relative .ts imports: the sending half of this file runs on the always-on
// host under plain Node, not in the web app, because a throttled send of
// twenty-five messages takes twenty minutes and no web request lives that long.

import "server-only";

import { db } from "../lib/db.ts";
import { linkConversationToContact } from "../lib/contacts.ts";
import { segmentWhere, storedFilter } from "../lib/segments.ts";
import { checkCampaignQuota, checkMessageQuota } from "../lib/usage.ts";
import { capabilitiesFor } from "../whatsapp-connectors/capabilities.ts";
import { connectorFor } from "../whatsapp-connectors/index.ts";
import {
  ensureOptOutLine,
  isOptedOut,
  optedOutAmong,
} from "./opt-out.ts";
import { describeRejected, parsePhoneList } from "./phone-list.ts";
import { personalise, unfilledPlaceholders } from "./templates/starter-templates.ts";
import { estimatedDurationMs, planSendTimes, spacingFor } from "./throttle.ts";

/** The longest a single WhatsApp text message can be. */
const MAX_BODY_LENGTH = 4096;

/** How long a claimed send may sit unfinished before it is given up on. */
const INTERRUPTED_AFTER_MS = 10 * 60_000;

export type NewCampaign = {
  businessId: string;
  name: string;
  body: string;
  /** Conversation ids, chosen from the contacts this business already has. */
  conversationIds: string[];
  /**
   * Numbers typed or pasted in, for people who have not messaged first.
   *
   * Raw text exactly as it was entered, one person per line — parsed here
   * rather than by the caller, so the screen and the API route cannot disagree
   * about what counts as a number (campaigns/phone-list.ts).
   */
  phoneList?: string | null;
  /** Which saved template this started from, if any. */
  templateId?: string | null;
  /** Set by the QR tier's warning checkbox (docs/PRD.md §7.2). */
  warningAcknowledged?: boolean;
  /** When to start. Null or past means now. */
  scheduledFor?: Date | null;
  /**
   * A saved segment to send to, on top of anyone picked or typed. Resolved
   * into recipients now, when the campaign is written, so every check below
   * (the cap, opt-outs, the plan's quota) sees the real list.
   */
  segmentId?: string | null;
  /** With a segment: only contacts who have said yes, not merely not no. */
  onlyOptedIn?: boolean;
  /**
   * Values typed on screen for the message's placeholders other than {name}
   * ({offer} -> "20% off"), filled in before anything is checked or sent.
   */
  variableValues?: Record<string, string>;
};

/** Most contacts one segment broadcast may reach, whatever the tier allows. */
const MAX_SEGMENT_RECIPIENTS = 10_000;

/**
 * Fills the campaign-wide placeholders. {name} is left for `personalise`,
 * which fills it per person; blank values are left unfilled so the check
 * below still catches them.
 */
export function fillCampaignVariables(body: string, values: Record<string, string> = {}): string {
  return body.replace(/\{([a-z0-9_]+)\}/gi, (whole, key: string) => {
    if (key.toLowerCase() === "name") return whole;

    const value = values[key]?.trim();

    return value ? value.slice(0, 500) : whole;
  });
}

export type BuildResult =
  | {
      ok: true;
      campaignId: string;
      /** How many will actually be messaged, after opt-outs were removed. */
      recipients: number;
      /** How many were dropped because they had opted out. */
      optedOut: number;
      finishesInMs: number;
    }
  | { ok: false; message: string; field?: string };

/**
 * One person on the list, before the campaign is written.
 *
 * `conversationId` is null while the recipient is a typed number nobody has a
 * thread with yet. It stays null for exactly as long as the campaign might
 * still be refused, so a rejected send leaves no empty conversations behind.
 */
type Recipient = {
  conversationId: string | null;
  contactPhone: string;
  contactName: string | null;
};

/**
 * Checks a campaign and, if it passes, writes it down with a time against every
 * recipient.
 *
 * Nothing is sent here. The campaign lands as SCHEDULED with one row per
 * person, each carrying the moment it may go out; `sendDueMessages` does the
 * rest. Splitting it that way is what makes the throttle survive a restart.
 */
export async function buildCampaign(input: NewCampaign): Promise<BuildResult> {
  const name = input.name.trim();
  const variableValues = cleanVariableValues(input.variableValues);
  const body = fillCampaignVariables(input.body.trim(), variableValues);

  if (!name) return { ok: false, message: "Give this campaign a name.", field: "name" };
  if (!body) return { ok: false, message: "Write the message you want to send.", field: "body" };

  if (body.length > MAX_BODY_LENGTH) {
    return {
      ok: false,
      message: `That's longer than WhatsApp allows in one message (${MAX_BODY_LENGTH} characters).`,
      field: "body",
    };
  }

  const unfilled = unfilledPlaceholders(body);

  if (unfilled.length > 0) {
    // The one mistake this check exists for: "Up to {discount}% off" going out,
    // verbatim, to twenty-five people.
    return {
      ok: false,
      message: `Fill in ${unfilled.join(", ")} before sending — only {name} is filled in for you.`,
      field: "body",
    };
  }

  const connection = await db.whatsAppConnection.findUnique({
    where: { businessId: input.businessId },
    select: { id: true, type: true, status: true },
  });

  if (!connection) {
    return {
      ok: false,
      message: "Connect your WhatsApp number before sending a campaign.",
    };
  }

  const tier = connection.type;
  const capabilities = capabilitiesFor(tier);

  // One send at a time. Two overlapping campaigns would send at twice the rate
  // the throttle was chosen to hold, which is the whole point of having one.
  const alreadyRunning = await db.campaign.count({
    where: {
      businessId: input.businessId,
      status: { in: ["SCHEDULED", "SENDING"] },
    },
  });

  if (alreadyRunning > 0) {
    return {
      ok: false,
      message:
        "You already have a campaign waiting to go out. Let it finish, or cancel it, before starting another.",
    };
  }

  // How many campaigns this month the plan includes (lib/plans.ts). Checked
  // before anything else about the message, so somebody who has run out is told
  // that rather than being walked through writing one they cannot send.
  const campaignQuota = await checkCampaignQuota(input.businessId);

  if (!campaignQuota.ok) {
    return { ok: false, message: campaignQuota.message };
  }

  if (capabilities.requiresBanRiskWarning && !input.warningAcknowledged) {
    return {
      ok: false,
      message:
        "Please read and accept the warning about sending from a WhatsApp Web connection first.",
      field: "warning",
    };
  }

  // Recipients come from two places now, and every rule below this point
  // applies to both without knowing the difference.
  //
  // Picked contacts are looked up with the business id in the WHERE clause, so
  // an id belonging to somebody else simply isn't found (docs/Rules.md §3).
  // Typed numbers are people who have never messaged this business; they are
  // given a conversation of their own further down, once the campaign is
  // certain to be written.
  const picked = await db.conversation.findMany({
    where: {
      businessId: input.businessId,
      id: { in: [...new Set(input.conversationIds)] },
    },
    select: { id: true, contactPhone: true, contactName: true },
  });

  const typed = parsePhoneList(input.phoneList ?? "");

  // Refused, not skipped. A campaign that quietly dropped the three lines it
  // could not read would look like it had reached everybody (docs/Rules.md §7).
  if (typed.rejected.length > 0) {
    return {
      ok: false,
      message: `These lines aren't phone numbers we can use — ${describeRejected(typed.rejected)}.`,
      field: "recipients",
    };
  }

  // Merged by number rather than appended, so somebody who appears in both a
  // pasted list and the picker is one recipient and not two. The picked contact
  // wins: its name came from WhatsApp, which is better than one typed beside
  // the same number. (CampaignRecipient is unique on (campaignId, contactPhone)
  // and would refuse the duplicate anyway — this is so the count on screen and
  // the count sent are the same number.)
  const audience = new Map<string, Recipient>();

  for (const contact of picked) {
    audience.set(contact.contactPhone, {
      conversationId: contact.id,
      contactPhone: contact.contactPhone,
      contactName: contact.contactName,
    });
  }

  for (const entry of typed.numbers) {
    if (audience.has(entry.phone)) continue;

    audience.set(entry.phone, {
      conversationId: null,
      contactPhone: entry.phone,
      contactName: entry.name,
    });
  }

  let segmentId: string | null = null;

  if (input.segmentId) {
    const segment = await db.segment.findFirst({
      where: { id: input.segmentId, businessId: input.businessId },
      select: { id: true, filter: true },
    });
    const filter = segment ? storedFilter(segment.filter) : null;

    if (!segment || !filter) {
      return { ok: false, message: "That segment no longer exists or can't be read.", field: "segment" };
    }

    segmentId = segment.id;

    const members = await db.contact.findMany({
      where: {
        AND: [
          segmentWhere(input.businessId, filter),
          // Opted-out contacts would be dropped below anyway; leaving them out
          // here keeps them from counting against the QR cap.
          input.onlyOptedIn ? { optInStatus: "OPTED_IN" } : { optInStatus: { not: "OPTED_OUT" } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: MAX_SEGMENT_RECIPIENTS + 1,
      select: { phone: true, name: true, conversations: { select: { id: true }, take: 1 } },
    });

    if (members.length > MAX_SEGMENT_RECIPIENTS) {
      return {
        ok: false,
        message: `That segment has more than ${MAX_SEGMENT_RECIPIENTS.toLocaleString("en-IN")} contacts. Narrow it down and try again.`,
        field: "segment",
      };
    }

    for (const member of members) {
      if (audience.has(member.phone)) continue;

      audience.set(member.phone, {
        conversationId: member.conversations[0]?.id ?? null,
        contactPhone: member.phone,
        contactName: member.name,
      });
    }
  }

  const contacts = [...audience.values()];

  if (contacts.length === 0) {
    return {
      ok: false,
      message: input.segmentId
        ? "Nobody in that segment can be sent to right now."
        : "Choose somebody to send this to, or add a phone number.",
      field: "recipients",
    };
  }

  const cap = capabilities.maxBulkRecipients;

  // The cap counts everybody, however they got onto the list. Letting typed
  // numbers past it would be the 25-recipient rule with a hole in it
  // (docs/Rules.md §8).
  if (cap !== null && contacts.length > cap) {
    return {
      ok: false,
      message: `The QR connection sends to at most ${cap} people at a time. You've chosen ${contacts.length}.`,
      field: "recipients",
    };
  }

  const excluded = await optedOutAmong(
    input.businessId,
    contacts.map((contact) => contact.contactPhone),
  );

  const sending = contacts.filter(
    (contact) => !excluded.has(contact.contactPhone),
  );

  if (sending.length === 0) {
    return {
      ok: false,
      message:
        "Everybody you chose has unsubscribed, so there is nobody to send to.",
      field: "recipients",
    };
  }

  // A campaign is the one thing that can spend a month's messages in a minute,
  // so it is checked against the whole list rather than one at a time. The 25
  // people the QR connection allows and the messages the *plan* allows are
  // two different limits, and both apply (docs/Rules.md §8).
  const messageQuota = await checkMessageQuota(input.businessId, sending.length);

  if (!messageQuota.ok) {
    return { ok: false, message: messageQuota.message, field: "recipients" };
  }

  let template: {
    metaName: string | null;
    metaLanguage: string | null;
    approval: string;
  } | null = null;

  if (input.templateId) {
    template = await db.messageTemplate.findFirst({
      where: { id: input.templateId, businessId: input.businessId },
      select: { metaName: true, metaLanguage: true, approval: true },
    });
  }

  // A campaign is no longer refused for not using an approved template, on
  // either tier (docs/PRD.md §7.4, decided 2026-09-18). Meta is the enforcer
  // here, not us: it accepts free text only inside the 24-hour window after
  // somebody wrote in, and rejects it otherwise — which our stored approval
  // status can only ever guess at, since it is a copy of what Meta said last
  // time we looked. What used to be refused before sending is now reported
  // afterwards, per recipient, in the words Meta itself gave
  // (whatsapp-connectors/business-api/send-message.ts).
  //
  // Picking an approved template is still the way to reach somebody who has not
  // written in, and the screens say so.
  const sendsAsMetaTemplate = Boolean(template?.metaName);

  // Every bulk message says how to stop receiving them (docs/Rules.md §8).
  // Whether the line can be added depends on what is actually being sent, not
  // on the tier: an approved template's words are Meta's and cannot be added to
  // here (that line is checked when the template is saved instead), while free
  // text is ours to complete — including API-tier free text, which before now
  // could not happen.
  const finalBody = sendsAsMetaTemplate ? body : ensureOptOutLine(body);

  const startAt =
    input.scheduledFor && input.scheduledFor.getTime() > Date.now()
      ? input.scheduledFor
      : new Date();

  const spacing = spacingFor(tier);
  const times = planSendTimes(sending.length, startAt, spacing);

  // Typed numbers become real threads here, and not one line earlier. Every
  // check that could still refuse this campaign has passed, so nothing above
  // can leave a stranger sitting in the inbox having been sent nothing.
  //
  // `update: {}` on purpose — if a thread already exists, its name stays as it
  // is. A name WhatsApp gave us, or one somebody typed into the inbox, must not
  // be overwritten by whatever sat beside the number in a pasted list.
  const addressed = await Promise.all(
    sending.map(async (contact) => {
      if (contact.conversationId) return { ...contact, conversationId: contact.conversationId };

      const conversation = await db.conversation.upsert({
        where: {
          businessId_contactPhone: {
            businessId: input.businessId,
            contactPhone: contact.contactPhone,
          },
        },
        create: {
          businessId: input.businessId,
          contactPhone: contact.contactPhone,
          contactName: contact.contactName,
        },
        update: {},
        select: { id: true, businessId: true, contactPhone: true, contactName: true, contactId: true },
      });

      // A typed number is a new CRM contact too (lib/contacts.ts).
      await linkConversationToContact(conversation);

      return { ...contact, conversationId: conversation.id };
    }),
  );

  const campaign = await db.campaign.create({
    data: {
      businessId: input.businessId,
      name,
      body: finalBody,
      templateId: input.templateId ?? null,
      metaTemplateName: template?.metaName ?? null,
      metaTemplateLanguage: template?.metaLanguage ?? null,
      tier,
      status: "SCHEDULED",
      throttleMs: spacing.gapMs,
      warningAcknowledgedAt: input.warningAcknowledged ? new Date() : null,
      scheduledFor: startAt,
      segmentId,
      audienceBuiltAt: segmentId ? new Date() : null,
      onlyOptedIn: Boolean(segmentId && input.onlyOptedIn),
      variableValues,
      recipients: {
        create: addressed.map((contact, index) => ({
          conversationId: contact.conversationId,
          contactPhone: contact.contactPhone,
          contactName: contact.contactName,
          body: personalise(finalBody, contact.contactName),
          sendAfter: times[index],
        })),
      },
    },
    select: { id: true },
  });

  return {
    ok: true,
    campaignId: campaign.id,
    recipients: sending.length,
    optedOut: excluded.size,
    finishesInMs: estimatedDurationMs(sending.length, spacing),
  };
}

/** Stops a campaign. Anything already sent stays sent; the rest never goes. */
export async function cancelCampaign(
  businessId: string,
  campaignId: string,
): Promise<boolean> {
  const stopped = await db.campaign.updateMany({
    where: {
      id: campaignId,
      businessId,
      status: { in: ["DRAFT", "SCHEDULED", "SENDING"] },
    },
    data: { status: "CANCELLED", finishedAt: new Date() },
  });

  if (stopped.count === 0) return false;

  await db.campaignRecipient.updateMany({
    where: { campaignId, status: "PENDING" },
    data: { status: "SKIPPED", failureReason: "You cancelled this campaign." },
  });

  return true;
}

export type SendTick = {
  sent: number;
  failed: number;
  skipped: number;
};

/**
 * Sends whatever is due right now, and nothing that isn't.
 *
 * Called on a timer by jobs/campaign-sender.ts. Each call does a small amount
 * of work and returns; the throttle lives in the `sendAfter` column rather than
 * in a sleep here, so nothing is lost if this process restarts mid-campaign.
 */
export async function sendDueMessages(limit = 25): Promise<SendTick> {
  const tick: SendTick = { sent: 0, failed: 0, skipped: 0 };

  await failInterruptedSends();

  const due = await db.campaignRecipient.findMany({
    where: {
      status: "PENDING",
      sendAfter: { lte: new Date() },
      campaign: { status: { in: ["SCHEDULED", "SENDING"] } },
    },
    orderBy: { sendAfter: "asc" },
    take: limit,
    select: {
      id: true,
      campaignId: true,
      conversationId: true,
      contactPhone: true,
      body: true,
      contactName: true,
      campaign: {
        select: {
          businessId: true,
          tier: true,
          metaTemplateName: true,
          metaTemplateLanguage: true,
          body: true,
          variableValues: true,
          template: { select: { variables: true } },
        },
      },
    },
  });

  for (const recipient of due) {
    const outcome = await sendOne(recipient);

    tick[outcome] += 1;
  }

  await finishCompletedCampaigns();

  return tick;
}

/**
 * One person's message.
 *
 * The claim on the first line is the thing that matters: `updateMany` guarded
 * on `status: "PENDING"` either changes exactly one row or none, so two senders
 * racing on the same recipient cannot both proceed. Everything after it is
 * allowed to assume this send is ours alone.
 */
async function sendOne(recipient: {
  id: string;
  campaignId: string;
  conversationId: string;
  contactPhone: string;
  contactName: string | null;
  body: string;
  campaign: {
    businessId: string;
    tier: "QR" | "API";
    metaTemplateName: string | null;
    metaTemplateLanguage: string | null;
    body: string;
    variableValues: unknown;
    template: { variables: string[] } | null;
  };
}): Promise<"sent" | "failed" | "skipped"> {
  const claimed = await db.campaignRecipient.updateMany({
    where: { id: recipient.id, status: "PENDING" },
    data: { status: "SENDING" },
  });

  if (claimed.count !== 1) return "skipped";

  // Checked again, deliberately. The list was built when the campaign was
  // written; this message may be going out days later, and somebody who said
  // STOP in between must not receive it (docs/Rules.md §8).
  if (await isOptedOut(recipient.campaign.businessId, recipient.contactPhone)) {
    await db.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: "SKIPPED",
        failureReason: "They unsubscribed before this was due to go out.",
      },
    });

    return "skipped";
  }

  const connection = await db.whatsAppConnection.findUnique({
    where: { businessId: recipient.campaign.businessId },
    select: { id: true, type: true },
  });

  if (!connection) {
    await markFailed(recipient.id, "This account has no WhatsApp connection.");

    return "failed";
  }

  const connector = connectorFor(connection.type);

  const outcome = recipient.campaign.metaTemplateName
    ? await connector.sendTemplate({
        connectionId: connection.id,
        to: recipient.contactPhone,
        templateName: recipient.campaign.metaTemplateName,
        languageCode: recipient.campaign.metaTemplateLanguage ?? "en_US",
        parameters: templateParameters(recipient.campaign, recipient.contactName),
      })
    : await connector.sendText({
        connectionId: connection.id,
        to: recipient.contactPhone,
        body: recipient.body,
      });

  if (outcome.status === "failed" || outcome.status === "unavailable") {
    await markFailed(recipient.id, outcome.message);

    return "failed";
  }

  const now = new Date();

  // Recorded as sent first, and given its WhatsApp id second. The id is only
  // ever used to match a delivery receipt to a recipient, and `externalId` is
  // UNIQUE — so a clash must not be allowed to throw away the fact that this
  // message was delivered. Losing a receipt is a missing tick on a screen;
  // losing the send record would leave a message that went out looking like one
  // that never did, and something would eventually try it again.
  await db.campaignRecipient.update({
    where: { id: recipient.id },
    data: { status: "SENT", sentAt: now },
  });

  if (outcome.status === "sent" && outcome.messageId) {
    await db.campaignRecipient
      .update({
        where: { id: recipient.id },
        data: { externalId: outcome.messageId },
      })
      .catch(() => {});
  }

  // A bulk message is still a message this person received, so it belongs in
  // their thread. Marked CAMPAIGN rather than HUMAN: a broadcast is not
  // somebody answering a customer, and the analytics should not say it was.
  await db.message.create({
    data: {
      conversationId: recipient.conversationId,
      direction: "OUTBOUND",
      author: "CAMPAIGN",
      body: recipient.body,
    },
  });

  await db.conversation.update({
    where: { id: recipient.conversationId },
    data: { lastMessageAt: now },
  });

  return "sent";
}

/**
 * The values for an approved template's placeholders, in the order Meta
 * numbers them. {name} varies per person; everything else was typed on screen
 * when the campaign was written.
 */
function templateParameters(
  campaign: { body: string; variableValues: unknown; template: { variables: string[] } | null },
  contactName: string | null,
): string[] {
  const name = contactName?.trim() || "there";
  const variables = campaign.template?.variables ?? [];

  if (variables.length === 0) {
    // A template saved before variables were recorded: {name} was the only
    // placeholder it could have.
    return campaign.body.includes("{name}") ? [name] : [];
  }

  const values = (campaign.variableValues ?? {}) as Record<string, string>;

  return variables.map((variable) => (variable === "name" ? name : values[variable] ?? ""));
}

function cleanVariableValues(values: Record<string, string> | undefined): Record<string, string> {
  const clean: Record<string, string> = {};

  for (const [key, value] of Object.entries(values ?? {})) {
    if (/^[a-z0-9_]{1,40}$/i.test(key) && typeof value === "string" && value.trim()) {
      clean[key] = value.trim().slice(0, 500);
    }
  }

  return clean;
}

async function markFailed(id: string, reason: string) {
  await db.campaignRecipient.update({
    where: { id },
    data: { status: "FAILED", failureReason: reason },
  });
}

/**
 * Records what Meta says became of one sent message.
 *
 * Only the API tier ever calls this — the QR connection reports nothing
 * back, which is why `supportsDeliveryReceipts` exists in
 * whatsapp-connectors/capabilities.ts and why a QR-tier campaign honestly
 * shows "sent" and stops there.
 *
 * A reply outranks a read, a read outranks a delivery, and a delivery outranks
 * a send, so receipts arriving out of order cannot walk a recipient backwards.
 */
const RECEIPT_RANK: Record<string, number> = {
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  REPLIED: 4,
};

export async function recordDeliveryReceipt(
  externalId: string,
  status: string,
): Promise<boolean> {
  const recipient = await db.campaignRecipient.findUnique({
    where: { externalId },
    select: { id: true, status: true },
  });

  if (!recipient) return false;

  if (status === "failed") {
    await db.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: "FAILED",
        failureReason: "WhatsApp could not deliver this message.",
      },
    });

    return true;
  }

  const next =
    status === "read" ? "READ" : status === "delivered" ? "DELIVERED" : "SENT";

  if ((RECEIPT_RANK[next] ?? 0) <= (RECEIPT_RANK[recipient.status] ?? 0)) {
    return false;
  }

  await db.campaignRecipient.update({
    where: { id: recipient.id },
    data: {
      status: next,
      ...(next === "DELIVERED" ? { deliveredAt: new Date() } : {}),
      ...(next === "READ" ? { readAt: new Date() } : {}),
    },
  });

  return true;
}

/**
 * Gives up on sends that were claimed and never finished.
 *
 * A row stuck in SENDING means the sender stopped between claiming a message
 * and recording what happened to it — so nobody knows whether it went. It is
 * marked failed and **not** retried. Sending somebody the same broadcast twice
 * is the failure this whole file is arranged to avoid, and an honest "we can't
 * tell" is the lesser harm.
 */
async function failInterruptedSends() {
  const cutoff = new Date(Date.now() - INTERRUPTED_AFTER_MS);

  await db.campaignRecipient.updateMany({
    where: { status: "SENDING", sendAfter: { lt: cutoff } },
    data: {
      status: "FAILED",
      failureReason:
        "Sending was interrupted. We can't tell whether this one arrived, so it wasn't tried again.",
    },
  });
}

/** Marks a campaign done once nobody is left waiting. */
async function finishCompletedCampaigns() {
  const running = await db.campaign.findMany({
    where: { status: { in: ["SCHEDULED", "SENDING"] } },
    select: {
      id: true,
      status: true,
      _count: { select: { recipients: { where: { status: "PENDING" } } } },
    },
  });

  for (const campaign of running) {
    const stillWaiting = campaign._count.recipients > 0;

    if (stillWaiting) {
      if (campaign.status === "SCHEDULED") {
        await db.campaign.updateMany({
          where: { id: campaign.id, status: "SCHEDULED" },
          data: { status: "SENDING", startedAt: new Date() },
        });
      }

      continue;
    }

    await db.campaign.updateMany({
      where: { id: campaign.id, status: { in: ["SCHEDULED", "SENDING"] } },
      data: { status: "SENT", finishedAt: new Date() },
    });
  }
}


// ─── Reading them back ──────────────────────────────────────────────────────
// The screens' half. Kept in this file rather than a fourth one so that what a
// campaign *is* stays in one place; the sending half above is the only part
// that ever runs outside the web app.

/** Somebody a campaign could be sent to, with the reason it might not be. */
export type SendableContact = {
  conversationId: string;
  contactPhone: string;
  contactName: string | null;
  lastMessageAt: string;
  /** True when they have unsubscribed. The picker shows them and refuses them. */
  optedOut: boolean;
};

/**
 * Everybody this business could message.
 *
 * Contacts are the people who have messaged this business. They are no longer
 * the only people a campaign can reach — an owner can type numbers in as well
 * (docs/PRD.md §7.4) — but they are the ones worth showing a list of, because
 * they are the ones already known to want to hear from this business.
 *
 * Opted-out contacts are returned rather than hidden, marked, and greyed out on
 * screen. Quietly dropping them would leave an owner wondering where somebody
 * went (docs/Rules.md §7).
 */
export async function listSendableContacts(
  businessId: string,
): Promise<SendableContact[]> {
  const [conversations, excluded] = await Promise.all([
    db.conversation.findMany({
      where: { businessId },
      orderBy: { lastMessageAt: "desc" },
      take: 200,
      select: {
        id: true,
        contactPhone: true,
        contactName: true,
        lastMessageAt: true,
      },
    }),
    db.optOut.findMany({ where: { businessId }, select: { contactPhone: true } }),
  ]);

  const stopped = new Set(excluded.map((row) => row.contactPhone));

  return conversations.map((row) => ({
    conversationId: row.id,
    contactPhone: row.contactPhone,
    contactName: row.contactName,
    lastMessageAt: row.lastMessageAt.toISOString(),
    optedOut: stopped.has(row.contactPhone),
  }));
}

/** Every campaign this business has run, newest first. */
export async function listCampaigns(businessId: string) {
  const rows = await db.campaign.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      name: true,
      status: true,
      tier: true,
      scheduledFor: true,
      finishedAt: true,
      createdAt: true,
      _count: { select: { recipients: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    tier: row.tier,
    scheduledFor: row.scheduledFor,
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
    recipients: row._count.recipients,
  }));
}

/** One campaign and what became of every message in it. */
export async function readCampaign(businessId: string, id: string) {
  const campaign = await db.campaign.findFirst({
    where: { id, businessId },
    select: {
      id: true,
      name: true,
      body: true,
      status: true,
      tier: true,
      throttleMs: true,
      metaTemplateName: true,
      warningAcknowledgedAt: true,
      scheduledFor: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      recipients: {
        orderBy: { sendAfter: "asc" },
        select: {
          id: true,
          contactPhone: true,
          contactName: true,
          status: true,
          sendAfter: true,
          sentAt: true,
          failureReason: true,
        },
      },
    },
  });

  if (!campaign) return null;

  const counted: Record<string, number> = {};

  for (const recipient of campaign.recipients) {
    counted[recipient.status] = (counted[recipient.status] ?? 0) + 1;
  }

  return { ...campaign, counted };
}

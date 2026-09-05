// Building a bulk send, and letting it out one message at a time.
//
// This is the file docs/Rules.md §8 is about. Everything it refuses to do is
// deliberate, and none of it is a convenience that can be traded away:
//
//   * **The 25-recipient cap on the free tier is enforced here**, from
//     `capabilitiesFor(tier).maxBulkRecipients`, not from a number typed into
//     this file. The screen disables the button too; that is the second lock,
//     not the first.
//   * **The mandatory ban-risk warning must have been accepted** before a
//     free-tier campaign can be scheduled (docs/PRD.md §7.2).
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
import { checkCampaignQuota, checkMessageQuota } from "../lib/usage.ts";
import { capabilitiesFor } from "../whatsapp-connectors/capabilities.ts";
import { connectorFor } from "../whatsapp-connectors/index.ts";
import {
  ensureOptOutLine,
  isOptedOut,
  optedOutAmong,
} from "./opt-out.ts";
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
  /** Which saved template this started from, if any. */
  templateId?: string | null;
  /** Set by the free tier's warning checkbox (docs/PRD.md §7.2). */
  warningAcknowledged?: boolean;
  /** When to start. Null or past means now. */
  scheduledFor?: Date | null;
};

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
 * Checks a campaign and, if it passes, writes it down with a time against every
 * recipient.
 *
 * Nothing is sent here. The campaign lands as SCHEDULED with one row per
 * person, each carrying the moment it may go out; `sendDueMessages` does the
 * rest. Splitting it that way is what makes the throttle survive a restart.
 */
export async function buildCampaign(input: NewCampaign): Promise<BuildResult> {
  const name = input.name.trim();
  const body = input.body.trim();

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

  // Recipients come from this account's own conversations, looked up with the
  // business id in the WHERE clause — so an id belonging to somebody else
  // simply isn't found (docs/Rules.md §3).
  const contacts = await db.conversation.findMany({
    where: {
      businessId: input.businessId,
      id: { in: [...new Set(input.conversationIds)] },
    },
    select: { id: true, contactPhone: true, contactName: true },
  });

  if (contacts.length === 0) {
    return {
      ok: false,
      message: "Choose at least one person to send this to.",
      field: "recipients",
    };
  }

  const cap = capabilities.maxBulkRecipients;

  if (cap !== null && contacts.length > cap) {
    return {
      ok: false,
      message: `The free connection sends to at most ${cap} people at a time. You've chosen ${contacts.length}.`,
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
  // people the free connection allows and the messages the *plan* allows are
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

  // The paid tier starts conversations with a template Meta has approved, and
  // nothing else (docs/PRD.md §7.1). Refusing here gives a clear reason; Meta
  // would refuse it anyway, less helpfully.
  if (capabilities.requiresApprovedTemplates) {
    if (!template?.metaName) {
      return {
        ok: false,
        message:
          "On the WhatsApp Business API a campaign has to use one of your approved templates. Choose one, or add it under Templates.",
        field: "template",
      };
    }

    if (template.approval !== "APPROVED") {
      return {
        ok: false,
        message:
          "That template isn't marked as approved by Meta yet, so it can't be sent.",
        field: "template",
      };
    }
  }

  // Every bulk message says how to stop receiving them (docs/Rules.md §8). On
  // the paid tier the words belong to the approved template and cannot be added
  // to here — that line is checked when the template is saved instead.
  const finalBody = capabilities.requiresApprovedTemplates
    ? body
    : ensureOptOutLine(body);

  const startAt =
    input.scheduledFor && input.scheduledFor.getTime() > Date.now()
      ? input.scheduledFor
      : new Date();

  const spacing = spacingFor(tier);
  const times = planSendTimes(sending.length, startAt, spacing);

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
      recipients: {
        create: sending.map((contact, index) => ({
          conversationId: contact.id,
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
        // The only value that varies per person. A template with no {name} in
        // it takes no parameters at all.
        parameters: recipient.campaign.body.includes("{name}")
          ? [recipient.contactName?.trim() || "there"]
          : [],
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

async function markFailed(id: string, reason: string) {
  await db.campaignRecipient.update({
    where: { id },
    data: { status: "FAILED", failureReason: reason },
  });
}

/**
 * Records what Meta says became of one sent message.
 *
 * Only the paid tier ever calls this — the free connection reports nothing
 * back, which is why `supportsDeliveryReceipts` exists in
 * whatsapp-connectors/capabilities.ts and why a free-tier campaign honestly
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
 * Contacts are the people who have messaged this business — the only place
 * ChatWise gets a phone number from. There is no import, and no way to type a
 * number in, which is the strongest anti-spam property the product has: you can
 * only broadcast to people who wrote to you first.
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

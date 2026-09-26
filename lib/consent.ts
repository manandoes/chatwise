// Whether a contact has agreed to hear from a business, and the record of
// every time that changed.
//
// Two places hold the answer and this file keeps them in step:
//
//   * `Contact.optInStatus` — what the CRM screens, segments and exports read.
//   * the `OptOut` table — what every send path already checks before
//     anything goes out (campaigns/opt-out.ts, docs/Rules.md §8).
//
// Nothing else writes either. A consent change is one transaction that
// updates both and appends a `ConsentEvent`, so the audit log can never
// disagree with the state it describes.
//
// Relative .ts imports: the router calls this when somebody replies STOP.

import "server-only";

import type { OptInStatus } from "./generated/prisma/client.ts";
import { db } from "./db.ts";
import { upsertContact } from "./contacts.ts";

export type ConsentChange = {
  businessId: string;
  /** Either the contact, or a phone number to find or create one by. */
  contactId?: string;
  phone?: string;
  to: OptInStatus;
  /** Where it came from: "whatsapp", "dashboard", "import", "shopify"… */
  source: string;
  /** The word they replied, an import id, a note — whatever explains it. */
  detail?: string | null;
  /** The team member who made the change, when a person did. */
  actorUserId?: string | null;
};

export type ConsentResult = { contactId: string; changed: boolean };

export async function setConsent(change: ConsentChange): Promise<ConsentResult> {
  const contactId =
    change.contactId ??
    (change.phone ? (await upsertContact(change.businessId, change.phone)).id : null);

  if (!contactId) throw new Error("setConsent needs a contact id or a phone number.");

  return db.$transaction(async (tx) => {
    const contact = await tx.contact.findFirst({
      where: { id: contactId, businessId: change.businessId },
      select: { id: true, phone: true, optInStatus: true },
    });

    if (!contact) throw new Error("No such contact for this business.");

    // The OptOut row is kept exactly in step even when the status is already
    // right, which heals any row written before contacts existed.
    if (change.to === "OPTED_OUT") {
      await tx.optOut.upsert({
        where: {
          businessId_contactPhone: {
            businessId: change.businessId,
            contactPhone: contact.phone,
          },
        },
        create: {
          businessId: change.businessId,
          contactPhone: contact.phone,
          reason: change.detail?.slice(0, 200) ?? change.source,
        },
        update: {},
      });
    } else {
      await tx.optOut.deleteMany({
        where: { businessId: change.businessId, contactPhone: contact.phone },
      });
    }

    if (contact.optInStatus === change.to) {
      return { contactId: contact.id, changed: false };
    }

    const now = new Date();

    await tx.contact.update({
      where: { id: contact.id },
      data: {
        optInStatus: change.to,
        optInSource: sourceLabel(change),
        optInAt: now,
      },
    });

    await tx.consentEvent.create({
      data: {
        businessId: change.businessId,
        contactId: contact.id,
        fromStatus: contact.optInStatus,
        toStatus: change.to,
        source: change.source,
        detail: change.detail?.slice(0, 500) ?? null,
        actorUserId: change.actorUserId ?? null,
        createdAt: now,
      },
    });

    return { contactId: contact.id, changed: true };
  });
}

/** The consent history of one contact, newest first. */
export async function readConsentLog(businessId: string, contactId: string) {
  return db.consentEvent.findMany({
    where: { businessId, contactId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      source: true,
      detail: true,
      actorUserId: true,
      createdAt: true,
    },
  });
}

export const OPT_IN_STATUS_LABEL: Record<OptInStatus, string> = {
  PENDING: "Not asked yet",
  OPTED_IN: "Opted in",
  OPTED_OUT: "Opted out",
};

export function isOptInStatus(value: unknown): value is OptInStatus {
  return value === "PENDING" || value === "OPTED_IN" || value === "OPTED_OUT";
}

function sourceLabel(change: ConsentChange): string {
  const detail = change.detail?.trim();

  return (detail ? `${change.source}: ${detail}` : change.source).slice(0, 200);
}

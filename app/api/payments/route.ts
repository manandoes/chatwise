// Sending a customer a payment link.
//
// POST { contactId | phone (+ name), amount, description, provider?, reference? }
//
// Any team member may send one — taking payment is part of handling a
// customer — but only to a contact in their own business, and only through an
// account the owner connected. The link goes out on WhatsApp as a queued job;
// the response carries it too, so it can be copied if WhatsApp can't deliver.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { normalizePhone, upsertContact } from "@/lib/contacts";
import { db } from "@/lib/db";
import { FEATURE_OFF_MESSAGE, isFeatureEnabled } from "@/lib/features";
import { createPaymentLink, toMinorUnits } from "@/integrations/payments/links";

export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    if (!isFeatureEnabled("paymentLinks")) return apiError(FEATURE_OFF_MESSAGE, "NOT_FOUND", 404);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

    if (!body) return apiError("Nothing to send.", "VALIDATION_FAILED", 400);

    const accounts = await db.paymentAccount.findMany({
      where: { businessId: found.businessId },
      select: { provider: true, currency: true },
    });

    if (accounts.length === 0) {
      return apiError("Connect Razorpay or Stripe under Integrations first.", "NOT_FOUND", 404);
    }

    const account =
      accounts.length === 1 ? accounts[0] : accounts.find((candidate) => candidate.provider === body.provider);

    if (!account) {
      return apiError("Choose which account to take the payment with.", "VALIDATION_FAILED", 400, {
        provider: "Choose Razorpay or Stripe.",
      });
    }

    const fields: Record<string, string> = {};
    const amount = toMinorUnits(typeof body.amount === "number" || typeof body.amount === "string" ? body.amount : "", account.currency);
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 200) : "";
    const reference = typeof body.reference === "string" ? body.reference.trim().slice(0, 60) || null : null;

    if (!amount) fields.amount = "Enter an amount above zero.";
    if (description.length < 2) fields.description = "Say what the payment is for.";

    let contactId: string | null = null;

    if (typeof body.contactId === "string" && body.contactId) {
      const contact = await db.contact.findFirst({
        where: { id: body.contactId, businessId: found.businessId },
        select: { id: true },
      });

      if (!contact) return apiError("That contact doesn't exist.", "NOT_FOUND", 404);

      contactId = contact.id;
    } else {
      const phone = normalizePhone(typeof body.phone === "string" ? body.phone : "");

      if (!phone) fields.phone = "Enter their WhatsApp number with the country code, like +91 98765 43210.";
      else {
        const name = typeof body.name === "string" ? body.name : null;
        contactId = (await upsertContact(found.businessId, phone, { name })).id;
      }
    }

    if (Object.keys(fields).length > 0 || !contactId || !amount) {
      return apiError("Please check the highlighted fields.", "VALIDATION_FAILED", 400, fields);
    }

    const created = await createPaymentLink({
      businessId: found.businessId,
      contactId,
      provider: account.provider,
      amount,
      currency: account.currency,
      description,
      reference,
      createdById: found.userId,
    });

    if (!created.ok) return apiError(created.message, "VALIDATION_FAILED", 400);

    return Response.json({ id: created.value.id, linkUrl: created.value.linkUrl });
  } catch (error) {
    return unexpectedError("payments/post", error);
  }
}

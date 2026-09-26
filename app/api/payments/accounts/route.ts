// Connecting the business's own Razorpay or Stripe account. Owner only.
//
//   POST   { provider, keyId?, secretKey, webhookSecret?, currency }  save keys
//   PATCH  { provider, webhookSecret }                               add the webhook secret
//   DELETE ?provider=RAZORPAY|STRIPE                                 disconnect
//
// Keys are checked with the provider before they are stored, stored
// encrypted, and never sent back to the browser.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { db } from "@/lib/db";
import { FEATURE_OFF_MESSAGE, isFeatureEnabled } from "@/lib/features";
import type { PaymentProvider } from "@/lib/generated/prisma/client";
import { isCurrencyCode, savePaymentAccount, saveWebhookSecret } from "@/integrations/payments/links";

function readProvider(value: unknown): PaymentProvider | null {
  return value === "RAZORPAY" || value === "STRIPE" ? value : null;
}

function text(value: unknown, max = 300): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    if (!isFeatureEnabled("paymentLinks")) return apiError(FEATURE_OFF_MESSAGE, "NOT_FOUND", 404);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const provider = readProvider(body?.provider);

    if (!provider) return apiError("Choose Razorpay or Stripe.", "VALIDATION_FAILED", 400);

    const keyId = text(body?.keyId);
    const secretKey = text(body?.secretKey);
    const webhookSecret = text(body?.webhookSecret) || null;
    const currency = text(body?.currency, 3).toUpperCase() || "INR";
    const fields: Record<string, string> = {};

    if (provider === "RAZORPAY" && !/^rzp_(test|live)_/.test(keyId)) {
      fields.keyId = "It starts rzp_live_ or rzp_test_.";
    }
    if (!secretKey) fields.secretKey = "Paste the secret key.";
    if (!isCurrencyCode(currency)) fields.currency = "Use a three-letter currency code, like INR or USD.";

    if (Object.keys(fields).length > 0) {
      return apiError("Please check the highlighted fields.", "VALIDATION_FAILED", 400, fields);
    }

    const saved = await savePaymentAccount({
      businessId: found.businessId,
      provider,
      keyId: keyId || null,
      secretKey,
      webhookSecret,
      currency,
    });

    if (!saved.ok) return apiError(saved.message, "VALIDATION_FAILED", 400, { secretKey: saved.message });

    return Response.json({ saved: true, webhookUrl: saved.value.webhookUrl });
  } catch (error) {
    return unexpectedError("payments/accounts/post", error);
  }
}

export async function PATCH(request: Request) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const provider = readProvider(body?.provider);
    const webhookSecret = text(body?.webhookSecret);

    if (!provider || !webhookSecret) {
      return apiError("Paste the webhook signing secret.", "VALIDATION_FAILED", 400, {
        webhookSecret: "Paste the webhook signing secret.",
      });
    }

    if (!(await saveWebhookSecret(found.businessId, provider, webhookSecret))) {
      return apiError("Connect the account first.", "NOT_FOUND", 404);
    }

    return Response.json({ saved: true });
  } catch (error) {
    return unexpectedError("payments/accounts/patch", error);
  }
}

export async function DELETE(request: Request) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    const provider = readProvider(new URL(request.url).searchParams.get("provider"));

    if (!provider) return apiError("Choose Razorpay or Stripe.", "VALIDATION_FAILED", 400);

    // Payments already made keep their rows: they are the business's records.
    const removed = await db.paymentAccount.deleteMany({ where: { businessId: found.businessId, provider } });

    if (removed.count === 0) return apiError("That account isn't connected.", "NOT_FOUND", 404);

    return Response.json({ removed: true });
  } catch (error) {
    return unexpectedError("payments/accounts/delete", error);
  }
}

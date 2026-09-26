// Sending a payment link again. A link that can still be paid is re-sent as
// it is; an expired, failed or cancelled one is replaced with a fresh link
// (integrations/payments/links.ts).

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { FEATURE_OFF_MESSAGE, isFeatureEnabled } from "@/lib/features";
import { resendPayment } from "@/integrations/payments/links";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    if (!isFeatureEnabled("paymentLinks")) return apiError(FEATURE_OFF_MESSAGE, "NOT_FOUND", 404);

    const { id } = await context.params;
    const result = await resendPayment(found.businessId, id, found.userId);

    if (!result.ok) return apiError(result.message, "VALIDATION_FAILED", 400);

    return Response.json(result.value);
  } catch (error) {
    return unexpectedError("payments/resend", error);
  }
}

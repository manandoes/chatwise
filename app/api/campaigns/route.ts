// Starting a bulk send.
//
// This route does almost nothing itself, and that is the point: every rule that
// makes bulk sending safe — the 25-recipient cap, the mandatory warning, the
// opt-out exclusions, the one-campaign-at-a-time limit — lives in
// campaigns/send-campaign.ts, where the sender can rely on it too. A rule
// enforced only at the door is a rule that stops existing the moment somebody
// adds a second door (docs/Rules.md §8).
//
// Nothing is sent here either. The campaign is written down with a time against
// each recipient, and the sender on the always-on host takes it from there.

import { buildCampaign } from "@/campaigns/send-campaign";
import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { takeFromBudget } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness();

    if (!found.ok) return found.response;

    // A brake on writing campaigns, which is not the same thing as the throttle
    // on sending them: that one spaces out the messages of a campaign that has
    // already been accepted, and neither replaces the other (lib/rate-limit.ts).
    const budget = await takeFromBudget("campaign", found.businessId);

    if (!budget.allowed) {
      return apiError(budget.message, "RATE_LIMITED", 429);
    }

    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      body?: unknown;
      conversationIds?: unknown;
      templateId?: unknown;
      warningAcknowledged?: unknown;
      scheduledFor?: unknown;
    } | null;

    const conversationIds = Array.isArray(body?.conversationIds)
      ? body.conversationIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        )
      : [];

    const when =
      typeof body?.scheduledFor === "string" && body.scheduledFor
        ? new Date(body.scheduledFor)
        : null;

    const result = await buildCampaign({
      businessId: found.businessId,
      name: typeof body?.name === "string" ? body.name : "",
      body: typeof body?.body === "string" ? body.body : "",
      conversationIds,
      templateId: typeof body?.templateId === "string" ? body.templateId : null,
      warningAcknowledged: body?.warningAcknowledged === true,
      scheduledFor: when && !Number.isNaN(when.getTime()) ? when : null,
    });

    if (!result.ok) {
      return apiError(
        result.message,
        "VALIDATION_FAILED",
        400,
        result.field ? { [result.field]: result.message } : undefined,
      );
    }

    return Response.json(result);
  } catch (error) {
    return unexpectedError("campaigns/create", error);
  }
}

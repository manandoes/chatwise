// Setup Step C — about the business.
//
// Two sets of answers arrive here: the universal ones (name, industry, what you
// do) which go on the Business row, and the ones the chosen agent asked, which
// go into that agent's own config. Which questions those are comes from the
// agent's `config-schema.ts`, so this route stays correct as agents change.

import { getBot } from "@/bots/shared/bot-catalog";
import { apiError, unexpectedError } from "@/lib/api-response";
import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrCreateBusiness } from "@/lib/onboarding";
import {
  isValid,
  pickKnownAnswers,
  validateBusinessDetails,
} from "@/lib/validation/onboarding";

export async function POST(request: Request) {
  try {
    const user = await getApiUser();
    if (!user) {
      return apiError("Please log in and try again.", "NOT_AUTHENTICATED", 401);
    }

    const business = await getOrCreateBusiness(user.id);

    if (!business.agent) {
      return apiError("Choose your agent first.", "VALIDATION_FAILED", 400);
    }

    const bot = getBot(business.agent.botType);
    if (!bot) {
      // The stored agent isn't in the catalogue — it was removed from /bots
      // after this account chose it.
      return apiError(
        "That agent is no longer available. Please choose another.",
        "NOT_FOUND",
        409,
      );
    }

    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      industry?: unknown;
      about?: unknown;
      answers?: unknown;
    } | null;

    const rawAnswers =
      body?.answers && typeof body.answers === "object"
        ? (body.answers as Record<string, unknown>)
        : {};

    const input = {
      name: String(body?.name ?? ""),
      industry: String(body?.industry ?? ""),
      about: String(body?.about ?? ""),
      // Only strings, and only for questions this agent actually asks — so
      // nothing extra can be smuggled into the stored config.
      answers: Object.fromEntries(
        Object.entries(rawAnswers).map(([key, value]) => [key, String(value ?? "")]),
      ),
    };

    const errors = validateBusinessDetails(input, bot.questions);
    if (!isValid(errors)) {
      return apiError(
        "Please check the highlighted answers.",
        "VALIDATION_FAILED",
        400,
        errors,
      );
    }

    const answers = pickKnownAnswers(input.answers, bot.questions);

    // Both writes together: a half-saved step would leave the wizard unsure
    // whether to move on.
    await db.$transaction([
      db.business.update({
        where: { id: business.id },
        data: {
          name: input.name.trim(),
          industry: input.industry.trim() || null,
          about: input.about.trim() || null,
        },
      }),
      db.agentInstance.update({
        where: { businessId: business.id },
        data: { config: answers },
      }),
    ]);

    return Response.json({ saved: true }, { status: 200 });
  } catch (error) {
    return unexpectedError("onboarding/business", error);
  }
}

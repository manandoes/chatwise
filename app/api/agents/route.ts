// Reading and updating the account's single agent.
//
// This route only ever edits the one agent belonging to the signed-in user's
// business. It cannot create one, and it cannot create a second — choosing an
// agent happens in setup (app/api/onboarding/bot), and the unique index on
// `businessId` is what actually guarantees there's only ever one
// (docs/Rules.md §6).

import { getBot } from "@/bots/shared/bot-catalog";
import { apiError, unexpectedError } from "@/lib/api-response";
import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrCreateBusiness } from "@/lib/onboarding";
import {
  isValid,
  pickKnownAnswers,
  validateBotBehavior,
  validateBusinessDetails,
} from "@/lib/validation/onboarding";

export async function PATCH(request: Request) {
  try {
    const user = await getApiUser();
    if (!user) {
      return apiError("Please log in and try again.", "NOT_AUTHENTICATED", 401);
    }

    // Found from the session, never from an id in the request body — so one
    // customer cannot reach another's agent (docs/Rules.md §3).
    const business = await getOrCreateBusiness(user.id);

    if (!business.agent) {
      return apiError(
        "You don't have an agent set up yet.",
        "NOT_FOUND",
        404,
      );
    }

    const bot = getBot(business.agent.botType);
    if (!bot) {
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
      tone?: unknown;
      language?: unknown;
      escalationRules?: unknown;
      escalateTo?: unknown;
    } | null;

    const rawAnswers =
      body?.answers && typeof body.answers === "object"
        ? (body.answers as Record<string, unknown>)
        : {};

    const details = {
      name: String(body?.name ?? business.name ?? ""),
      industry: String(body?.industry ?? business.industry ?? ""),
      about: String(body?.about ?? business.about ?? ""),
      answers: Object.fromEntries(
        Object.entries(rawAnswers).map(([k, v]) => [k, String(v ?? "")]),
      ),
    };

    const behavior = {
      tone: String(body?.tone ?? ""),
      language: String(body?.language ?? ""),
      escalationRules: String(body?.escalationRules ?? ""),
      escalateTo: String(body?.escalateTo ?? ""),
    };

    const errors = {
      ...validateBusinessDetails(details, bot.questions),
      ...validateBotBehavior(behavior),
    };

    if (!isValid(errors)) {
      return apiError(
        "Please check the highlighted answers.",
        "VALIDATION_FAILED",
        400,
        errors,
      );
    }

    await db.$transaction([
      db.business.update({
        where: { id: business.id },
        data: {
          name: details.name.trim(),
          industry: details.industry.trim() || null,
          about: details.about.trim() || null,
        },
      }),
      db.agentInstance.update({
        where: { businessId: business.id },
        data: {
          // Only answers to questions this agent actually asks are stored.
          config: pickKnownAnswers(details.answers, bot.questions),
          tone: behavior.tone,
          language: behavior.language,
          escalationRules: behavior.escalationRules.trim(),
          escalateTo: behavior.escalateTo.trim() || null,
        },
      }),
    ]);

    return Response.json({ saved: true }, { status: 200 });
  } catch (error) {
    return unexpectedError("agents/patch", error);
  }
}

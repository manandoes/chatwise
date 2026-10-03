// API route for managing multi-agent configuration.
//
// Allows businesses to enable/disable agents and configure which agents
// are active for their WhatsApp numbers.

import "server-only";

import { BOT_CATALOG, isSelectableBotType } from "@/bots/shared/bot-catalog";
import { apiError, unexpectedError } from "@/lib/api-response";
import { getApiUser, refuseUnlessOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrCreateBusiness } from "@/lib/onboarding";

/**
 * GET /api/agents
 * Returns the list of available agents and which ones are enabled.
 */
export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) {
      return apiError("Please log in and try again.", "NOT_AUTHENTICATED", 401);
    }

    const denied = await refuseUnlessOwner(user.id);
    if (denied) return denied;

    const business = await getOrCreateBusiness(user.id);
    if (!business.agent) {
      return apiError("No agent configured yet.", "NOT_FOUND", 404);
    }

    const enabledAgents = (business.agent.enabledAgents ?? ["RECEPTIONIST"]) as string[];

    const agents = BOT_CATALOG.map((bot) => ({
      type: bot.type,
      name: bot.name,
      tagline: bot.tagline,
      icon: bot.icon,
      enabled: enabledAgents.includes(bot.type),
    }));

    return Response.json({ agents }, { status: 200 });
  } catch (error) {
    return unexpectedError("agents/get", error);
  }
}

/**
 * PATCH /api/agents
 * Updates which agents are enabled for the business.
 */
export async function PATCH(request: Request) {
  try {
    const user = await getApiUser();
    if (!user) {
      return apiError("Please log in and try again.", "NOT_AUTHENTICATED", 401);
    }

    const denied = await refuseUnlessOwner(user.id);
    if (denied) return denied;

    const business = await getOrCreateBusiness(user.id);
    if (!business.agent) {
      return apiError("No agent configured yet.", "NOT_FOUND", 404);
    }

    const body = (await request.json().catch(() => null)) as {
      enabledAgents?: unknown;
      activeBotType?: unknown;
    } | null;

    if (!body) {
      return apiError("Invalid request body.", "VALIDATION_FAILED", 400);
    }

    // Validate enabled agents
    const enabledAgents = body.enabledAgents;
    if (enabledAgents && typeof enabledAgents === "object" && Array.isArray(enabledAgents)) {
      const validAgents = (enabledAgents as string[]).filter(isSelectableBotType);
      if (validAgents.length === 0) {
        return apiError("At least one agent must be enabled.", "VALIDATION_FAILED", 400);
      }

      await db.agentInstance.update({
        where: { businessId: business.id },
        data: { enabledAgents: validAgents },
      });
    }

    // Validate active bot type
    if (body.activeBotType && isSelectableBotType(body.activeBotType)) {
      await db.agentInstance.update({
        where: { businessId: business.id },
        data: { activeBotType: body.activeBotType },
      });
    }

    return Response.json({ updated: true }, { status: 200 });
  } catch (error) {
    return unexpectedError("agents/patch", error);
  }
}

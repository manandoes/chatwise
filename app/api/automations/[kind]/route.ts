// Saving one automated message: on or off, its wording, the approved
// template to use outside WhatsApp's 24-hour window, and (for the abandoned
// cart) how long to wait. Owner only.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { automationDefinition, isAutomationKind } from "@/lib/automations";
import { db } from "@/lib/db";

/** A reminder sooner than 15 minutes is pestering; later than a week, pointless. */
const MIN_DELAY_MINUTES = 15;
const MAX_DELAY_MINUTES = 7 * 24 * 60;

export async function PATCH(request: Request, context: { params: Promise<{ kind: string }> }) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    const { kind } = await context.params;

    if (!isAutomationKind(kind)) return apiError("There's no such automated message.", "NOT_FOUND", 404);

    const definition = automationDefinition(kind);
    const body = (await request.json().catch(() => null)) as {
      enabled?: unknown;
      body?: unknown;
      templateId?: unknown;
      delayMinutes?: unknown;
    } | null;

    if (!body) return apiError("Nothing to save.", "VALIDATION_FAILED", 400);

    const text = typeof body.body === "string" ? body.body.trim() : undefined;

    if (text !== undefined && (text.length < 2 || text.length > 1000)) {
      return apiError("Write a message between 2 and 1,000 characters.", "VALIDATION_FAILED", 400, {
        body: "Between 2 and 1,000 characters.",
      });
    }

    let templateId: string | null | undefined;

    if (body.templateId === null || body.templateId === "") {
      templateId = null;
    } else if (typeof body.templateId === "string") {
      // Only this business's own templates, whatever id was sent.
      const template = await db.messageTemplate.findFirst({
        where: { id: body.templateId, businessId: found.businessId },
        select: { id: true },
      });

      if (!template) return apiError("That template doesn't exist.", "NOT_FOUND", 404);

      templateId = template.id;
    }

    let delayMinutes: number | undefined;

    if (body.delayMinutes !== undefined) {
      const value = Number(body.delayMinutes);

      if (
        definition.defaultDelayMinutes === undefined ||
        !Number.isInteger(value) ||
        value < MIN_DELAY_MINUTES ||
        value > MAX_DELAY_MINUTES
      ) {
        return apiError("Choose a wait between 15 minutes and 7 days.", "VALIDATION_FAILED", 400, {
          delayMinutes: "Between 15 minutes and 7 days.",
        });
      }

      delayMinutes = value;
    }

    const enabled = typeof body.enabled === "boolean" ? body.enabled : undefined;

    await db.automationSetting.upsert({
      where: { businessId_kind: { businessId: found.businessId, kind } },
      create: {
        businessId: found.businessId,
        kind,
        enabled: enabled ?? false,
        body: text ?? definition.defaultBody,
        templateId: templateId ?? null,
        delayMinutes: delayMinutes ?? definition.defaultDelayMinutes ?? null,
      },
      update: {
        ...(enabled !== undefined ? { enabled } : {}),
        ...(text !== undefined ? { body: text } : {}),
        ...(templateId !== undefined ? { templateId } : {}),
        ...(delayMinutes !== undefined ? { delayMinutes } : {}),
      },
    });

    return Response.json({ saved: true });
  } catch (error) {
    return unexpectedError("automations/patch", error);
  }
}

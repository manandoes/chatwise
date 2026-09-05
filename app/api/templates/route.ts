// Saving one of the business's own message templates.
//
// What counts as valid depends on the tier, and not cosmetically: on the paid
// tier a template is a claim about something registered at Meta, and its words
// must already contain an opt-out line because nothing can be appended to an
// approved template later (docs/Rules.md §8). The tier comes from the account's
// own connection, never from the request.

import {
  checkTemplate,
  saveTemplate,
} from "@/campaigns/templates/saved-templates";
import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTemplateQuota } from "@/lib/usage";
import { capabilitiesFor } from "@/whatsapp-connectors/capabilities";

export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness();

    if (!found.ok) return found.response;

    const connection = await db.whatsAppConnection.findUnique({
      where: { businessId: found.businessId },
      select: { type: true },
    });

    if (!connection) {
      return apiError(
        "Connect your WhatsApp number first — what a template needs depends on how you're connected.",
        "NOT_FOUND",
        404,
      );
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    const checked = checkTemplate(
      {
        name: asText(body?.name),
        body: asText(body?.body),
        metaName: asText(body?.metaName),
        metaLanguage: asText(body?.metaLanguage),
        approval: asText(body?.approval),
        category: asText(body?.category),
      },
      capabilitiesFor(connection.type).requiresApprovedTemplates,
    );

    if (!checked.ok) {
      return apiError(checked.message, "VALIDATION_FAILED", 400, {
        [checked.field]: checked.message,
      });
    }

    // How many templates the plan keeps (lib/plans.ts). Editing an existing one
    // is always allowed — the limit is on how many are kept, not on tidying up
    // the ones already there.
    const quota = await checkTemplateQuota(
      found.businessId,
      typeof body?.id === "string" ? body.id : null,
    );

    if (!quota.ok) {
      return apiError(quota.message, "NOT_AUTHORIZED", 403);
    }

    const saved = await saveTemplate({
      businessId: found.businessId,
      id: typeof body?.id === "string" ? body.id : null,
      value: checked.value,
    });

    if (!saved.ok) {
      return apiError("That template doesn't exist.", "NOT_FOUND", 404);
    }

    return Response.json({ saved: true, id: saved.id });
  } catch (error) {
    return unexpectedError("templates/save", error);
  }
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

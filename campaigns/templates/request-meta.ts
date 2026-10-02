// Submitting a local template to Meta for approval.
//
// Meta's Graph API accepts a JSON body shaped like:
//
//   {
//     "name": "<lowercase_name>",
//     "language": "<language_code>",
//     "category": "<promotional|utility|authentication>",
//     "components": [
//       { "type": "BODY", "text": "the message with {{1}} placeholders" }
//     ]
//   }
//
// On success Meta returns the template's own id so we can match it up on the
// next sync. The call is deliberately fire-and-forget: Meta takes time to
// approve or reject, so the response only tells us whether the request was
// accepted. The owner then checks "Check with Meta" when they want an update.
//
// Caller-side: the caller already validated that the template has the right
// shape (opt-out line, valid meta name) — this layer just sends it and
// records whatever Meta says back.

import "server-only";

import { graphRequest } from "../../whatsapp-connectors/business-api/graph-api.ts";
import { readCredentials } from "../../whatsapp-connectors/business-api/credentials.ts";
import { db } from "../../lib/db.ts";

export type SubmitResult =
  | { ok: true; metaTemplateId: string; status: string }
  | {
      ok: false;
      message: string;
      /** What we sent, so the UI can show the user without asking again. */
      draft?: { metaName: string; metaLanguage: string; body: string };
    };

/**
 * Submits one template to Meta's WhatsApp Business Account.
 *
 * `body` uses our placeholder style ({name}); Meta needs {{1}}, so they are
 * converted before sending.
 */
export async function submitTemplateToMeta(templateId: string): Promise<SubmitResult> {
  const template = await db.messageTemplate.findUnique({
    where: { id: templateId },
    select: { businessId: true, metaName: true, metaLanguage: true, body: true },
  });

  if (!template) return { ok: false, message: "That template doesn't exist." };

  const connection = await db.whatsAppConnection.findUnique({
    where: { businessId: template.businessId },
    select: { id: true, type: true },
  });

  if (connection?.type !== "API") {
    return {
      ok: false,
      message: "Only the WhatsApp Business API tier can submit templates to Meta.",
    };
  }

  const credentials = await readCredentials(connection.id);

  if (!credentials?.businessAccountId) {
    return {
      ok: false,
      message:
        "Add your WhatsApp Business Account ID under Connect WhatsApp, so we know where to submit this template.",
      draft: { metaName: template.metaName ?? "", metaLanguage: template.metaLanguage ?? "", body: template.body },
    };
  }

  // Convert {name} → {{1}}, {offer} → {{2}}, etc., in order of first appearance.
  const numberedBody = convertPlaceholders(template.body);

  const result = await graphRequest<{ id: string; status: string }>(
    `${encodeURIComponent(credentials.businessAccountId)}/message_templates`,
    {
      method: "POST",
      accessToken: credentials.accessToken,
      body: {
        name: template.metaName,
        language: template.metaLanguage ?? "en_US",
        category: "UTILITY",
        components: [{ type: "BODY", text: numberedBody }],
      },
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      draft: { metaName: template.metaName ?? "", metaLanguage: template.metaLanguage ?? "", body: template.body },
    };
  }

  // Record the Meta id and mark as PENDING so the UI shows the right state.
  await db.messageTemplate.update({
    where: { id: templateId },
    data: { metaTemplateId: result.data.id, approval: "PENDING", lastSyncedAt: new Date() },
  });

  return { ok: true, metaTemplateId: result.data.id, status: result.data.status };
}

/** Turns {name} {offer} → {{1}} {{2}} for Meta's placeholder style. */
function convertPlaceholders(body: string): string {
  const seen = new Set<string>();
  let counter = 1;
  const replacements = new Map<string, string>();

  const cleaned = body
    .replace(/\{([a-z0-9_]+)\}/gi, (_match, key) => {
      const lower = key.toLowerCase();
      if (!replacements.has(lower)) {
        replacements.set(lower, `{{${counter}}}`);
        counter += 1;
      }
      return replacements.get(lower)!;
    });

  return cleaned;
}

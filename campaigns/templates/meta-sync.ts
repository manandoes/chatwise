// Asking Meta where each Business API template has got to.
//
// Until now an owner typed "Approved" by hand after checking Meta's screens.
// This reads the real answer from the WhatsApp Business Account:
//
//   * templates already saved here (matched on their Meta name and language)
//     get Meta's status, id and rejection reason;
//   * approved templates Meta has that aren't saved here yet are brought in,
//     so they can be picked for campaigns and automated messages — but only
//     if they already tell people how to opt out, because nothing can be
//     added to an approved template's words (docs/Rules.md §8).
//
// Runs when the owner presses "Check with Meta" and every six hours on its
// own (the `templates.sync_all` job).
//
// Relative .ts imports: the job runner on the always-on host uses this.

import "server-only";

import type { TemplateApproval } from "../../lib/generated/prisma/client.ts";
import { db } from "../../lib/db.ts";
import { graphRequest } from "../../whatsapp-connectors/business-api/graph-api.ts";
import { readCredentials } from "../../whatsapp-connectors/business-api/credentials.ts";
import { hasOptOutLine } from "../opt-out.ts";
import { MAX_TEMPLATE_BODY_LENGTH, templateVariables } from "./saved-templates.ts";

type MetaTemplate = {
  id: string;
  name: string;
  language: string;
  status: string;
  rejected_reason?: string;
  components?: { type: string; text?: string }[];
};

type MetaPage = { data?: MetaTemplate[]; paging?: { cursors?: { after?: string }; next?: string } };

/** Meta has more statuses than we do; anything not sendable reads as rejected. */
function approvalFrom(status: string): TemplateApproval {
  switch (status) {
    case "APPROVED":
      return "APPROVED";
    case "PENDING":
    case "IN_APPEAL":
      return "PENDING";
    default:
      // REJECTED, PAUSED, DISABLED, PENDING_DELETION…
      return "REJECTED";
  }
}

/** Meta numbers its placeholders {{1}}; ours are {1}, like every other one here. */
function bodyFrom(template: MetaTemplate): string | null {
  const text = template.components?.find((component) => component.type === "BODY")?.text;

  return text ? text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, "{$1}") : null;
}

export type SyncResult =
  | { ok: true; updated: number; imported: number; skippedNoOptOut: number }
  | { ok: false; message: string };

/** Most templates read from one account. Far above any real business's. */
const MAX_PAGES = 10;

export async function syncTemplatesFromMeta(businessId: string): Promise<SyncResult> {
  const connection = await db.whatsAppConnection.findUnique({
    where: { businessId },
    select: { id: true, type: true },
  });

  if (connection?.type !== "API") {
    return { ok: false, message: "Only the WhatsApp Business API has templates at Meta." };
  }

  const credentials = await readCredentials(connection.id);

  if (!credentials?.businessAccountId) {
    return {
      ok: false,
      message:
        "Add your WhatsApp Business Account ID under Connect WhatsApp, so we know where your templates live.",
    };
  }

  const found: MetaTemplate[] = [];
  let after: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      fields: "id,name,language,status,rejected_reason,components",
      limit: "100",
      ...(after ? { after } : {}),
    });

    const result = await graphRequest<MetaPage>(
      `${encodeURIComponent(credentials.businessAccountId)}/message_templates?${query.toString()}`,
      { accessToken: credentials.accessToken },
    );

    if (!result.ok) return { ok: false, message: result.message };

    found.push(...(result.data.data ?? []));
    after = result.data.paging?.cursors?.after;

    if (!result.data.paging?.next || !after) break;
  }

  const saved = await db.messageTemplate.findMany({
    where: { businessId },
    select: { id: true, metaName: true, metaLanguage: true, metaTemplateId: true, body: true },
  });

  const now = new Date();
  let updated = 0;
  let imported = 0;
  let skippedNoOptOut = 0;

  for (const template of found) {
    const match = saved.find(
      (row) =>
        row.metaTemplateId === template.id ||
        (row.metaName === template.name && row.metaLanguage === template.language),
    );

    const approval = approvalFrom(template.status);

    if (match) {
      await db.messageTemplate.update({
        where: { id: match.id },
        data: {
          approval,
          metaTemplateId: template.id,
          rejectionReason: approval === "REJECTED" ? (template.rejected_reason ?? template.status) : null,
          lastSyncedAt: now,
        },
      });
      updated += 1;
      continue;
    }

    if (approval !== "APPROVED") continue;

    const body = bodyFrom(template);

    if (!body || body.length > MAX_TEMPLATE_BODY_LENGTH) continue;

    if (!hasOptOutLine(body)) {
      skippedNoOptOut += 1;
      continue;
    }

    await db.messageTemplate.create({
      data: {
        businessId,
        name: template.name.replace(/_/g, " "),
        body,
        metaName: template.name,
        metaLanguage: template.language,
        approval,
        metaTemplateId: template.id,
        variables: templateVariables(body),
        lastSyncedAt: now,
      },
    });
    imported += 1;
  }

  return { ok: true, updated, imported, skippedNoOptOut };
}

/** Every Business API account with an account id, for the six-hourly job. */
export async function businessesToSync(): Promise<string[]> {
  const rows = await db.whatsAppConnection.findMany({
    where: { type: "API", credentials: { businessAccountId: { not: null } } },
    select: { businessId: true },
  });

  return rows.map((row) => row.businessId);
}

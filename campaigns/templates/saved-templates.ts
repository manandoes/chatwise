// The messages a business saves to reuse.
//
// A starter template (starter-templates.ts) is shipped wording anybody can
// copy. A saved template is that business's own, and on the paid tier it is
// also a claim about something at Meta: a name, a language, and whether Meta
// approved it. ChatWise cannot see inside a customer's Meta account, so that
// claim is theirs — the value of recording it is a clear error before a send
// rather than a cryptic rejection during one (docs/Rules.md §8).
//
// One rule here is worth spelling out. On the free tier a missing opt-out line
// is *appended* at send time (campaigns/opt-out.ts). On the paid tier it cannot
// be: the words that go out are the ones Meta approved, and adding to them
// would send something different from what was reviewed. So a Meta template
// whose text does not tell people how to stop is **refused when it is saved**,
// which is the only moment at which anybody can still do something about it.

import "server-only";

import { db } from "../../lib/db.ts";
import { hasOptOutLine, OPT_OUT_LINE } from "../opt-out.ts";

export const MAX_TEMPLATE_NAME_LENGTH = 80;
export const MAX_TEMPLATE_BODY_LENGTH = 1024;

/** Where Meta has got to with a template, in words rather than a code. */
export const APPROVAL_LABEL: Record<string, string> = {
  NOT_SUBMITTED: "Not sent to Meta yet",
  PENDING: "Waiting for Meta",
  APPROVED: "Approved by Meta",
  REJECTED: "Rejected by Meta",
};

export type ApprovalValue =
  | "NOT_SUBMITTED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

const APPROVALS = Object.keys(APPROVAL_LABEL);

function isApproval(value: string): value is ApprovalValue {
  return APPROVALS.includes(value);
}

export type TemplateInput = {
  name: string;
  body: string;
  /** Paid tier: the name and language this is registered under at Meta. */
  metaName?: string | null;
  metaLanguage?: string | null;
  approval?: string | null;
  category?: string | null;
};

/** A template that passed every check, in the shape the database takes. */
export type CheckedTemplate = {
  name: string;
  body: string;
  metaName: string | null;
  metaLanguage: string | null;
  approval: ApprovalValue;
  category: string | null;
};

export type TemplateCheck =
  | { ok: true; value: CheckedTemplate }
  | { ok: false; message: string; field: string };

/**
 * Checks a template before it is saved.
 *
 * `forMetaTemplates` is true on the paid tier, where the extra fields are the
 * whole point and the opt-out line cannot be added later.
 */
export function checkTemplate(
  input: TemplateInput,
  forMetaTemplates: boolean,
): TemplateCheck {
  const name = input.name.trim();
  const body = input.body.trim();
  const metaName = input.metaName?.trim() ?? "";
  const metaLanguage = input.metaLanguage?.trim() ?? "";
  const approval = input.approval?.trim() || "NOT_SUBMITTED";

  if (!name) return { ok: false, message: "Give this template a name.", field: "name" };

  if (name.length > MAX_TEMPLATE_NAME_LENGTH) {
    return {
      ok: false,
      message: `Keep the name under ${MAX_TEMPLATE_NAME_LENGTH} characters.`,
      field: "name",
    };
  }

  if (!body) return { ok: false, message: "Write the message.", field: "body" };

  if (body.length > MAX_TEMPLATE_BODY_LENGTH) {
    return {
      ok: false,
      message: `Keep the message under ${MAX_TEMPLATE_BODY_LENGTH} characters.`,
      field: "body",
    };
  }

  if (!isApproval(approval)) {
    return {
      ok: false,
      message: "Choose where Meta has got to with this.",
      field: "approval",
    };
  }

  if (forMetaTemplates) {
    if (!metaName) {
      return {
        ok: false,
        message:
          "Enter the template's name exactly as it appears in your Meta account.",
        field: "metaName",
      };
    }

    if (!/^[a-z0-9_]+$/.test(metaName)) {
      // Meta's own naming rule. Catching it here saves a confusing rejection
      // in the middle of a send.
      return {
        ok: false,
        message:
          "Meta template names use lower-case letters, numbers and underscores only.",
        field: "metaName",
      };
    }

    if (!metaLanguage) {
      return {
        ok: false,
        message: "Enter the template's language code, for example en_US.",
        field: "metaLanguage",
      };
    }

    if (!hasOptOutLine(body)) {
      return {
        ok: false,
        message: `Approved templates must tell people how to stop hearing from you — we can't add that afterwards. Include something like "${OPT_OUT_LINE}" in the version you get approved.`,
        field: "body",
      };
    }
  }

  return {
    ok: true,
    value: {
      name,
      body,
      metaName: metaName || null,
      metaLanguage: metaLanguage || null,
      approval,
      category: input.category?.trim() || null,
    },
  };
}

/** This business's saved templates, newest first. */
export async function listTemplates(businessId: string) {
  const rows = await db.messageTemplate.findMany({
    where: { businessId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      body: true,
      category: true,
      metaName: true,
      metaLanguage: true,
      approval: true,
      updatedAt: true,
    },
  });

  return rows.map((row) => ({
    ...row,
    updatedAt: row.updatedAt.toISOString(),
    // Sent down already worded, so no screen has to own a second copy of these
    // labels (docs/Rules.md §7).
    approvalLabel: APPROVAL_LABEL[row.approval] ?? row.approval,
    usable: row.approval === "APPROVED",
  }));
}

export type SavedTemplate = Awaited<ReturnType<typeof listTemplates>>[number];

/** Creates or updates one, always scoped to the signed-in account. */
export async function saveTemplate({
  businessId,
  id,
  value,
}: {
  businessId: string;
  id?: string | null;
  value: CheckedTemplate;
}): Promise<{ ok: boolean; id?: string }> {
  if (id) {
    const changed = await db.messageTemplate.updateMany({
      where: { id, businessId },
      data: value,
    });

    return changed.count > 0 ? { ok: true, id } : { ok: false };
  }

  const made = await db.messageTemplate.create({
    data: { businessId, ...value },
    select: { id: true },
  });

  return { ok: true, id: made.id };
}

export async function deleteTemplate(
  businessId: string,
  id: string,
): Promise<boolean> {
  const gone = await db.messageTemplate.deleteMany({ where: { id, businessId } });

  return gone.count > 0;
}

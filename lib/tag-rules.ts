// Auto-tag rules: "contacts matching this filter get this tag".
//
// A rule's tag is added to every contact its filter matches and taken off
// again when they stop matching — but only a tag the rule itself put there
// (`ContactTag.source = RULE`). A tag a person added by hand, or one that
// came from Shopify or an import, is never removed by a rule, even one for
// the same tag name.
//
// Several rules may give out the same tag ("VIP" for big spenders, and "VIP"
// for frequent buyers). A contact keeps a rule-applied tag while ANY enabled
// rule for it matches, so the work below is done per tag rather than per rule.
//
// Rules run:
//   * for one contact, after anything about them changes (an order arrives,
//     a tag is edited) — `evaluateRulesForContact`;
//   * for everyone, once a day, because relative dates ("no order for 60
//     days") drift — `evaluateAllRules`, from the daily job;
//   * for one tag, when a rule is created, edited or deleted — `evaluateTag`.
//
// Relative .ts imports: runs in jobs on the always-on host.

import "server-only";

import type { Prisma } from "./generated/prisma/client.ts";
import { db } from "./db.ts";
import { segmentWhere, storedFilter } from "./segments.ts";

type RuleRow = { id: string; tagId: string; filter: Prisma.JsonValue };

/** The query that matches a contact against any of a tag's enabled rules. */
function matchAny(businessId: string, rules: RuleRow[], now: Date): Prisma.ContactWhereInput | null {
  const wheres = rules
    .map((rule) => storedFilter(rule.filter))
    // An empty filter would tag everyone. The API refuses to save one; a row
    // that somehow has one is ignored rather than trusted.
    .filter((filter): filter is NonNullable<typeof filter> => filter !== null && Object.keys(filter).length > 0)
    .map((filter) => segmentWhere(businessId, filter, now));

  if (wheres.length === 0) return null;

  return { OR: wheres };
}

/** Re-checks every rule against one contact. Cheap: a few indexed counts. */
export async function evaluateRulesForContact(businessId: string, contactId: string): Promise<void> {
  const rules = await db.tagRule.findMany({
    where: { businessId, enabled: true },
    select: { id: true, tagId: true, filter: true },
  });

  if (rules.length === 0) {
    // No rules left at all: nothing should carry a rule tag.
    await db.contactTag.deleteMany({ where: { businessId, contactId, source: "RULE" } });
    return;
  }

  const now = new Date();
  const byTag = groupByTag(rules);

  for (const [tagId, tagRules] of byTag) {
    const where = matchAny(businessId, tagRules, now);
    const matches = where
      ? (await db.contact.count({ where: { AND: [{ id: contactId }, where] } })) > 0
      : false;

    if (matches) {
      await db.contactTag.createMany({
        data: [{ contactId, tagId, businessId, source: "RULE" }],
        // Already tagged, by a rule or by a person: leave it exactly as is.
        skipDuplicates: true,
      });
    } else {
      await db.contactTag.deleteMany({ where: { contactId, tagId, source: "RULE" } });
    }
  }

  // Rule tags whose rules have all been disabled or deleted.
  await db.contactTag.deleteMany({
    where: { businessId, contactId, source: "RULE", tagId: { notIn: [...byTag.keys()] } },
  });
}

/**
 * Brings one tag up to date for every contact in the business. Returns how
 * many contacts gained and lost it.
 */
export async function evaluateTag(
  businessId: string,
  tagId: string,
  now: Date = new Date(),
): Promise<{ added: number; removed: number }> {
  const rules = await db.tagRule.findMany({
    where: { businessId, tagId, enabled: true },
    select: { id: true, tagId: true, filter: true },
  });

  const where = matchAny(businessId, rules, now);

  if (!where) {
    const removed = await db.contactTag.deleteMany({ where: { businessId, tagId, source: "RULE" } });

    return { added: 0, removed: removed.count };
  }

  let added = 0;
  let cursor: string | undefined;

  // In pages, so a business with a hundred thousand contacts doesn't pull
  // every id into memory at once.
  for (;;) {
    const page = await db.contact.findMany({
      where: { AND: [where, { tags: { none: { tagId } } }] },
      select: { id: true },
      orderBy: { id: "asc" },
      take: 1000,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (page.length === 0) break;

    const created = await db.contactTag.createMany({
      data: page.map((contact) => ({ contactId: contact.id, tagId, businessId, source: "RULE" as const })),
      skipDuplicates: true,
    });

    added += created.count;
    cursor = page[page.length - 1].id;

    if (page.length < 1000) break;
  }

  const removed = await db.contactTag.deleteMany({
    where: { businessId, tagId, source: "RULE", contact: { NOT: where } },
  });

  await db.tagRule.updateMany({ where: { businessId, tagId }, data: { lastRunAt: now } });

  return { added, removed: removed.count };
}

/** Every tag that has, or had, a rule. The daily job's work for one business. */
export async function evaluateAllRules(businessId: string): Promise<void> {
  const now = new Date();

  const tagIds = await db.tagRule.findMany({
    where: { businessId },
    select: { tagId: true },
    distinct: ["tagId"],
  });

  for (const { tagId } of tagIds) await evaluateTag(businessId, tagId, now);

  // Rule tags left behind by rules that were deleted outright.
  await db.contactTag.deleteMany({
    where: { businessId, source: "RULE", tagId: { notIn: tagIds.map((row) => row.tagId) } },
  });
}

/** Businesses that have any rule at all, for the daily sweep. */
export async function businessesWithRules(): Promise<string[]> {
  const rows = await db.tagRule.findMany({ select: { businessId: true }, distinct: ["businessId"] });

  return rows.map((row) => row.businessId);
}

function groupByTag(rules: RuleRow[]): Map<string, RuleRow[]> {
  const byTag = new Map<string, RuleRow[]>();

  for (const rule of rules) {
    byTag.set(rule.tagId, [...(byTag.get(rule.tagId) ?? []), rule]);
  }

  return byTag;
}

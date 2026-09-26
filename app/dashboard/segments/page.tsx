// Segments — saved filters over contacts — and the auto-tag rules built from
// the same filters.

import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { SegmentsManager } from "@/components/dashboard/segments-manager";
import { db } from "@/lib/db";
import { formatWhen } from "@/lib/format-when";
import { requirePageContext } from "@/lib/page-context";
import { describeSegmentFilter, segmentWhere, storedFilter } from "@/lib/segments";

export const metadata: Metadata = { title: "Segments" };

export default async function SegmentsPage() {
  const { business, isOwner } = await requirePageContext();

  const [segments, rules] = await Promise.all([
    db.segment.findMany({
      where: { businessId: business.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, filter: true },
    }),
    db.tagRule.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, filter: true, enabled: true, lastRunAt: true, tag: { select: { name: true } } },
    }),
  ]);

  const segmentRows = await Promise.all(
    segments.map(async (segment) => {
      const filter = storedFilter(segment.filter);

      return {
        id: segment.id,
        name: segment.name,
        filter: (filter ?? {}) as Record<string, unknown>,
        description: filter ? describeSegmentFilter(filter) : "This filter can't be read — edit it to fix it",
        count: filter ? await db.contact.count({ where: segmentWhere(business.id, filter) }) : null,
      };
    }),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Segments"
        description="Group your contacts by what they've bought, how they're tagged and whether they've agreed to hear from you — then send them a campaign or export them."
      />

      <SegmentsManager
        segments={segmentRows}
        canEditRules={isOwner}
        rules={rules.map((rule) => {
          const filter = storedFilter(rule.filter);

          return {
            id: rule.id,
            name: rule.name,
            tagName: rule.tag.name,
            enabled: rule.enabled,
            lastRun: rule.lastRunAt ? formatWhen(rule.lastRunAt) : null,
            filter: (filter ?? {}) as Record<string, unknown>,
            description: filter ? describeSegmentFilter(filter) : "This filter can't be read",
          };
        })}
      />
    </div>
  );
}

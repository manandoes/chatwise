// Creating an auto-tag rule. Owner only: a rule changes tags across the
// whole contact list, which is the owner's call.
//
// The rule is applied in the background (job `tags.evaluate_rules`), so a
// business with a hundred thousand contacts gets an instant answer here.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { db } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs";
import { isEmptyFilter, parseSegmentFilter } from "@/lib/segments";

export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness({ ownerOnly: true });
    if (!found.ok) return found.response;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
    const tagName = typeof body?.tagName === "string" ? body.tagName.trim().slice(0, 40) : "";
    const parsed = parseSegmentFilter(body?.filter);
    const fields: Record<string, string> = {};

    if (!name) fields.name = "Give the rule a name.";
    if (!tagName) fields.tagName = "Which tag should it add?";
    if (!parsed.ok) fields.filter = parsed.message;
    else if (isEmptyFilter(parsed.filter)) fields.filter = "Add at least one condition, or it would tag everyone.";

    if (Object.keys(fields).length > 0 || !parsed.ok) {
      return apiError(Object.values(fields)[0], "VALIDATION_FAILED", 400, fields);
    }

    const tag = await db.tag.upsert({
      where: { businessId_name: { businessId: found.businessId, name: tagName } },
      create: { businessId: found.businessId, name: tagName },
      update: {},
      select: { id: true },
    });

    const rule = await db.tagRule.create({
      data: { businessId: found.businessId, tagId: tag.id, name, filter: parsed.filter },
      select: { id: true },
    });

    await enqueueJob({ businessId: found.businessId, jobType: "tags.evaluate_rules" });

    return Response.json({ id: rule.id });
  } catch (error) {
    return unexpectedError("tag-rules/post", error);
  }
}

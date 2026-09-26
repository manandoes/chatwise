// How many contacts a filter matches right now, and the filter in words —
// shown while the filter is being built, before anything is saved.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { db } from "@/lib/db";
import { describeSegmentFilter, parseSegmentFilter, segmentWhere } from "@/lib/segments";

export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const body = (await request.json().catch(() => null)) as { filter?: unknown } | null;
    const parsed = parseSegmentFilter(body?.filter);

    if (!parsed.ok) return apiError(parsed.message, "VALIDATION_FAILED", 400);

    const where = segmentWhere(found.businessId, parsed.filter);
    const [count, optedIn] = await Promise.all([
      db.contact.count({ where }),
      db.contact.count({ where: { AND: [where, { optInStatus: "OPTED_IN" }] } }),
    ]);

    return Response.json({ count, optedIn, description: describeSegmentFilter(parsed.filter) });
  } catch (error) {
    return unexpectedError("segments/preview", error);
  }
}

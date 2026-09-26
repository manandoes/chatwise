// Saving a segment: a named filter over contacts (lib/segments.ts).

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/contacts";
import { db } from "@/lib/db";
import { parseSegmentFilter } from "@/lib/segments";

export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const body = (await request.json().catch(() => null)) as { name?: unknown; filter?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
    const parsed = parseSegmentFilter(body?.filter);

    if (!name) return apiError("Give the segment a name.", "VALIDATION_FAILED", 400, { name: "Give it a name." });
    if (!parsed.ok) return apiError(parsed.message, "VALIDATION_FAILED", 400, { filter: parsed.message });

    try {
      const segment = await db.segment.create({
        data: { businessId: found.businessId, name, filter: parsed.filter },
        select: { id: true },
      });

      return Response.json({ id: segment.id });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return apiError("You already have a segment with that name.", "ALREADY_EXISTS", 409, { name: "Already used." });
      }

      throw error;
    }
  } catch (error) {
    return unexpectedError("segments/post", error);
  }
}

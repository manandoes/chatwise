// The signed-in person's notifications: someone mentioned them, handed them a
// conversation, or a customer needs attention.
//
//   GET                                   the latest 20 and how many are unread
//   PATCH { ids: [...] } or { all: true } mark them read — only ever your own

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { listNotifications, markNotificationsRead } from "@/lib/team-inbox";

export async function GET() {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    return Response.json(await listNotifications(found.businessId, found.userId));
  } catch (error) {
    return unexpectedError("notifications/get", error);
  }
}

export async function PATCH(request: Request) {
  try {
    const found = await requireApiBusiness();
    if (!found.ok) return found.response;

    const body = (await request.json().catch(() => null)) as { ids?: unknown; all?: unknown } | null;

    if (body?.all === true) {
      await markNotificationsRead(found.businessId, found.userId, "all");
    } else if (Array.isArray(body?.ids)) {
      await markNotificationsRead(
        found.businessId,
        found.userId,
        body.ids.filter((id): id is string => typeof id === "string"),
      );
    } else {
      return apiError("Say which notifications to mark read.", "VALIDATION_FAILED", 400);
    }

    return Response.json({ saved: true });
  } catch (error) {
    return unexpectedError("notifications/patch", error);
  }
}

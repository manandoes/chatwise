// The saved-reply library: listing them, and adding a new one.

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import {
  checkQuickReply,
  createQuickReply,
  listQuickReplies,
} from "@/lib/quick-replies";

export async function GET() {
  try {
    const found = await requireApiBusiness();

    if (!found.ok) return found.response;

    const quickReplies = await listQuickReplies(found.businessId);

    return Response.json({ quickReplies });
  } catch (error) {
    return unexpectedError("quick-replies/list", error);
  }
}

export async function POST(request: Request) {
  try {
    const found = await requireApiBusiness();

    if (!found.ok) return found.response;

    const body = await request.json().catch(() => null);
    const checked = checkQuickReply(body);

    if (!checked.ok) {
      return apiError(checked.message, "VALIDATION_FAILED", 400, checked.fields);
    }

    const result = await createQuickReply(found.businessId, checked.input);

    if (!result.ok) {
      return apiError(result.message, "VALIDATION_FAILED", 400);
    }

    return Response.json({ id: result.id }, { status: 201 });
  } catch (error) {
    return unexpectedError("quick-replies/create", error);
  }
}

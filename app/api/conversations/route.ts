// The inbox list, for a screen that is watching it.
//
// The Conversations page renders its first list on the server; this is what it
// asks for every few seconds afterwards, so a message arriving on somebody's
// phone shows up without them reloading anything (docs/Phases.md, Phase 9).
//
// Polling rather than a live socket, deliberately: the app is serverless and
// has nowhere to hold a socket open, and adding a realtime service to the stack
// is not a decision to make inside a feature (docs/Rules.md §1). A few seconds
// of delay on an inbox a person is reading is not worth a new moving part.

import { unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { listInbox } from "@/lib/conversations";

export async function GET() {
  try {
    const found = await requireApiBusiness();

    if (!found.ok) return found.response;

    const conversations = await listInbox(found.businessId);

    return Response.json({
      conversations,
      waiting: conversations.filter((row) => row.escalatedAt).length,
    });
  } catch (error) {
    return unexpectedError("conversations/list", error);
  }
}

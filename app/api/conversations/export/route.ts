// "Export chats" — a CSV of this account's conversations.
//
// A thread list, not a transcript dump: who, when, tags, status. Somebody
// wanting the actual messages of one conversation already has the thread
// screen open in front of them.

import { unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { exportConversationsCsv } from "@/lib/conversations";

export async function GET() {
  try {
    const found = await requireApiBusiness();

    if (!found.ok) return found.response;

    const csv = await exportConversationsCsv(found.businessId);
    const date = new Date().toISOString().slice(0, 10);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="conversations-${date}.csv"`,
      },
    });
  } catch (error) {
    return unexpectedError("conversations/export", error);
  }
}

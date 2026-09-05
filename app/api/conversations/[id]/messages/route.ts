// What was said in one conversation, and saying something yourself.
//
//   GET  ?after=<time>  everything said since then, plus who is answering now
//   POST { body }       send a message typed by a person at the business
//
// The open thread polls the GET a few seconds at a time so the screen keeps up
// with a conversation happening on somebody's phone. The POST is the other half
// of Phase 9: a person stepping into that conversation and answering it
// themselves (docs/PRD.md §6).
//
// Both find the thread by the signed-in account's business id as well as the
// conversation id, so another account's thread simply isn't there
// (docs/Rules.md §3).

import { apiError, unexpectedError } from "@/lib/api-response";
import { requireApiBusiness } from "@/lib/auth";
import { takeFromBudget } from "@/lib/rate-limit";
import {
  checkMessageBody,
  readThreadSince,
  sendHumanReply,
} from "@/lib/conversations";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const found = await requireApiBusiness();

    if (!found.ok) return found.response;

    const { id } = await context.params;
    const since = new URL(request.url).searchParams.get("after");
    const after = since ? new Date(since) : null;

    const thread = await readThreadSince(
      found.businessId,
      id,
      after && !Number.isNaN(after.getTime()) ? after : null,
    );

    if (!thread) {
      return apiError("That conversation doesn't exist.", "NOT_FOUND", 404);
    }

    return Response.json(thread);
  } catch (error) {
    return unexpectedError("conversations/messages/get", error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const found = await requireApiBusiness();

    if (!found.ok) return found.response;

    // Set high on purpose: somebody hitting this is a person having a busy
    // afternoon in the inbox, and a plan's message limit deliberately does not
    // apply to replying by hand (docs/Architecture.md §5f). This is only here
    // to stop a runaway script (lib/rate-limit.ts).
    const budget = await takeFromBudget("humanReply", found.businessId);

    if (!budget.allowed) {
      return apiError(budget.message, "RATE_LIMITED", 429);
    }

    const { id } = await context.params;
    const payload = (await request.json().catch(() => null)) as {
      body?: unknown;
    } | null;

    const checked = checkMessageBody(payload?.body);

    if (!checked.ok) {
      return apiError(checked.message, "VALIDATION_FAILED", 400);
    }

    const result = await sendHumanReply({
      businessId: found.businessId,
      conversationId: id,
      body: checked.body,
    });

    if (!result.ok) {
      // "Your number isn't connected" is a 409 rather than a 500: nothing broke,
      // the account just isn't in a state where this can work, and the sentence
      // is already written for the person to read (docs/Rules.md §4).
      return apiError(
        result.message,
        result.code === "NOT_FOUND" ? "NOT_FOUND" : "NOT_AUTHORIZED",
        result.code === "NOT_FOUND" ? 404 : 409,
      );
    }

    return Response.json({ message: result.message, state: result.state });
  } catch (error) {
    return unexpectedError("conversations/messages/post", error);
  }
}

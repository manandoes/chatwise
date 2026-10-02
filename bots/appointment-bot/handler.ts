// How the Appointment agent decides what to reply.
//
// Thin on purpose: what makes this agent safe is its prompt — specifically the
// part that stops it inventing a free slot (docs/Rules.md §2 and §5).
//
// When a Calendly connection is present the handler queries availability before
// handing over (Gap 4). The prompt itself still forbids the agent from claiming
// a slot is free — that is the model's job, not ours. We only feed it the raw
// result of the Calendly check so it can say "I'll confirm availability" rather
// than guessing.

import type { BotHandler } from "../shared/handler-types.ts";
import { askAgent } from "../shared/run-agent.ts";
import { appointmentSystemPrompt } from "./prompt.ts";
import { db } from "../../lib/db.ts";
import { decryptStoredKey } from "../../lib/ai-credentials.ts";
import { callCalendly } from "../../integrations/calendly/client.ts";

export const appointmentHandler: BotHandler = async (request) => {
  // Check whether a Calendly connection exists and whether we can peek at
  // availability. The handler adds the result to the prompt context so the
  // model knows what it does and does not know.
  const calendlyInfo = await readCalendlyInfo(request.businessId);

  return askAgent({
    system: appointmentSystemPrompt(request, calendlyInfo),
    request,
    handoffReason:
      "Someone wants a booking confirmed, changed or cancelled — the agent cannot see the diary, so a person needs to.",
  });
};

type CalendlyInfo =
  | { connected: false }
  | { connected: true; bookingUrl: string }
  | { connected: true; bookingUrl: string; nextSlots: string[] };

async function readCalendlyInfo(businessId: string): Promise<CalendlyInfo> {
  const conn = await db.calendlyConnection.findUnique({
    where: { businessId },
    select: { bookingUrl: true, accessToken: true },
  });

  if (!conn) return { connected: false };

  const token = conn.accessToken ? decryptStoredKey(conn.accessToken) : null;

  if (!token) return { connected: true, bookingUrl: conn.bookingUrl };

  try {
    const result = await callCalendly(token, "/user_time_slots", {
      method: "POST",
      body: {
        organization: "ALL",
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        duration: "PT30M",
      },
    });

    if (!result.ok) return { connected: true, bookingUrl: conn.bookingUrl };

    const slots = ((result.value as any)?.elements ?? [])
      .map((el: any) => {
        const s = el?.resource?.start_time;
        const e = el?.resource?.end_time;
        if (!s || !e) return null;
        const start = new Date(s);
        const end = new Date(e);
        // Only same-week slots, formatted in a compact way.
        if (end.getTime() - start.getTime() < 60 * 60 * 1000) return null;
        return start.toLocaleString("en-IN", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
      })
      .filter((s: string | null): s is string => typeof s === "string")
      .slice(0, 5);

    if (slots.length === 0) return { connected: true, bookingUrl: conn.bookingUrl };

    return { connected: true, bookingUrl: conn.bookingUrl, nextSlots: slots };
  } catch {
    return { connected: true, bookingUrl: conn.bookingUrl };
  }
}

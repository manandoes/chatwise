// Business hours & the out-of-office auto-response.

import { apiError, unexpectedError } from "@/lib/api-response";
import { getApiUser, refuseUnlessOwner } from "@/lib/auth";
import {
  readBusinessHours,
  saveBusinessHours,
  type WeekSchedule,
} from "@/lib/business-hours";
import { getOrCreateBusiness } from "@/lib/onboarding";

const MAX_AWAY_MESSAGE_LENGTH = 1000;
const VALID_DAYS = new Set(["0", "1", "2", "3", "4", "5", "6"]);
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET() {
  try {
    const user = await getApiUser();

    if (!user) return apiError("Please sign in again.", "NOT_AUTHENTICATED", 401);

    const business = await getOrCreateBusiness(user.id);
    const hours = await readBusinessHours(business.id);

    return Response.json(hours);
  } catch (error) {
    return unexpectedError("settings/business-hours/get", error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getApiUser();

    if (!user) return apiError("Please sign in again.", "NOT_AUTHENTICATED", 401);

    const body = (await request.json().catch(() => null)) as {
      enabled?: unknown;
      schedule?: unknown;
      awayMessage?: unknown;
    } | null;

    if (typeof body?.enabled !== "boolean") {
      return apiError(
        "Say whether business hours should be on.",
        "VALIDATION_FAILED",
        400,
      );
    }

    const schedule = checkSchedule(body.schedule);

    if (!schedule.ok) {
      return apiError(schedule.message, "VALIDATION_FAILED", 400);
    }

    const awayMessage =
      typeof body.awayMessage === "string" ? body.awayMessage.trim() : "";

    if (body.enabled && !awayMessage) {
      return apiError(
        "Write what customers should see outside your hours.",
        "VALIDATION_FAILED",
        400,
        { awayMessage: "This is required while business hours are on." },
      );
    }

    if (awayMessage.length > MAX_AWAY_MESSAGE_LENGTH) {
      return apiError(
        `Keep it under ${MAX_AWAY_MESSAGE_LENGTH} characters.`,
        "VALIDATION_FAILED",
        400,
        { awayMessage: "That's too long." },
      );
    }

    // Account settings belong to the owner, not the whole team.
    const denied = await refuseUnlessOwner(user.id);
    if (denied) return denied;

    const business = await getOrCreateBusiness(user.id);

    await saveBusinessHours(business.id, {
      enabled: body.enabled,
      schedule: schedule.schedule,
      awayMessage:
        awayMessage ||
        "Thanks for your message! We're outside business hours right now, but we'll get back to you as soon as we're back.",
    });

    return Response.json({ saved: true });
  } catch (error) {
    return unexpectedError("settings/business-hours/patch", error);
  }
}

function checkSchedule(
  value: unknown,
): { ok: true; schedule: WeekSchedule } | { ok: false; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: "That schedule isn't in the right shape." };
  }

  const schedule: WeekSchedule = {};

  for (const [day, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!VALID_DAYS.has(day)) {
      return { ok: false, message: "That schedule isn't in the right shape." };
    }

    if (!entry || typeof entry !== "object") continue;

    const record = entry as { closed?: unknown; open?: unknown; close?: unknown };

    if (record.closed === true) {
      schedule[day as keyof WeekSchedule] = { closed: true };
      continue;
    }

    const open = typeof record.open === "string" ? record.open : "";
    const close = typeof record.close === "string" ? record.close : "";

    if (!TIME_PATTERN.test(open) || !TIME_PATTERN.test(close)) {
      return {
        ok: false,
        message: "Opening and closing times should look like 09:00.",
      };
    }

    schedule[day as keyof WeekSchedule] = { open, close };
  }

  return { ok: true, schedule };
}

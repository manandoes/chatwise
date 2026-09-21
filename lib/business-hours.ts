// Business hours and the out-of-office auto-response.
//
// An account can narrow when its agent replies to a weekly schedule. Outside
// those hours the customer gets one courtesy message instead of an answer,
// and the thread is handed to a person the same way any other handover is
// (docs/Rules.md §5 — every agent needs a way out, and going quiet with no
// explanation is not it).
//
// This is read by message-router/router.ts, which runs under plain Node as
// well as inside the Next.js app — hence the relative ".ts" import below,
// same reasoning as lib/ai-credentials.ts and lib/leads.ts.

import "server-only";

import { db } from "./db.ts";

/** One day's opening window, or a day marked closed. */
export type DayHours = { open: string; close: string; closed?: false } | { closed: true };

/** Keyed 0 (Sunday) through 6 (Saturday), as strings because JSON keys are. */
export type WeekSchedule = Partial<Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", DayHours>>;

export type BusinessHoursRow = {
  enabled: boolean;
  schedule: WeekSchedule;
  awayMessage: string;
};

const DEFAULT_AWAY_MESSAGE =
  "Thanks for your message! We're outside business hours right now, but we'll get back to you as soon as we're back.";

/** This business's schedule, or the (disabled) defaults if it's never set one. */
export async function readBusinessHours(
  businessId: string,
): Promise<BusinessHoursRow> {
  const row = await db.businessHours.findUnique({
    where: { businessId },
    select: { enabled: true, schedule: true, awayMessage: true },
  });

  if (!row) {
    return { enabled: false, schedule: {}, awayMessage: DEFAULT_AWAY_MESSAGE };
  }

  return {
    enabled: row.enabled,
    schedule: asSchedule(row.schedule),
    awayMessage: row.awayMessage,
  };
}

/** Saves a business's schedule, creating the row the first time. */
export async function saveBusinessHours(
  businessId: string,
  input: { enabled: boolean; schedule: WeekSchedule; awayMessage: string },
): Promise<void> {
  await db.businessHours.upsert({
    where: { businessId },
    create: { businessId, ...input },
    update: input,
  });
}

/**
 * Whether the business is open right now, in its own timezone.
 *
 * Returns `{ open: true }` whenever the feature is off — that is the default
 * every account starts in, and it means "always answer", not "always closed".
 */
export function isOpenNow(
  hours: BusinessHoursRow,
  timezone: string,
  now: Date = new Date(),
): { open: true } | { open: false; awayMessage: string } {
  if (!hours.enabled) return { open: true };

  const parts = readParts(now, timezone);
  const day = hours.schedule[String(parts.weekday) as keyof WeekSchedule];

  if (!day || day.closed) {
    return { open: false, awayMessage: hours.awayMessage };
  }

  const minutes = parts.hour * 60 + parts.minute;
  const openMinutes = toMinutes(day.open);
  const closeMinutes = toMinutes(day.close);

  if (openMinutes === null || closeMinutes === null) {
    // A malformed saved value — treat it the same as "closed today" rather
    // than guessing, since a customer getting no reply at all is worse than
    // one getting the away message on a day that was meant to be open.
    return { open: false, awayMessage: hours.awayMessage };
  }

  const isOpen =
    openMinutes <= closeMinutes
      ? minutes >= openMinutes && minutes < closeMinutes
      : // An overnight window, e.g. 22:00–02:00.
        minutes >= openMinutes || minutes < closeMinutes;

  return isOpen ? { open: true } : { open: false, awayMessage: hours.awayMessage };
}

function toMinutes(value: string | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return hour * 60 + minute;
}

/** The current weekday/hour/minute in a given timezone, without a library. */
function readParts(now: Date, timezone: string) {
  let formatter: Intl.DateTimeFormat;

  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    // An unrecognised timezone string — fall back to UTC rather than throw
    // from inside the message router.
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  }

  const parts = formatter.formatToParts(now);
  const weekdayName = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return { weekday: WEEKDAYS.indexOf(weekdayName), hour, minute };
}

function asSchedule(value: unknown): WeekSchedule {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return value as WeekSchedule;
}

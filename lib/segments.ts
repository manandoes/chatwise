// Segments: a saved filter over a business's contacts.
//
// A filter is a small JSON object ("tagged VIP, opted in, spent over 5,000,
// no order in the last 60 days") stored on `Segment.filter` and
// `TagRule.filter`. This file is the only thing that reads or writes that
// shape. It does three jobs:
//
//   * `parseSegmentFilter` checks a filter a browser sent us, and refuses
//     anything it doesn't understand rather than silently dropping it — a
//     broadcast to "everyone" because a typo was ignored would be a disaster.
//   * `segmentWhere` turns it into a database query, always scoped to one
//     business.
//   * `describeSegmentFilter` says it back in plain English for the screens.
//
// Dates can be fixed ("after 1 March") or relative ("in the last 30 days").
// Relative ones are what make auto-tag rules useful: "no order for 60 days"
// is re-checked every day and means something different each time.
//
// Relative .ts imports: tag rules run inside jobs on the always-on host.

import type { OptInStatus, Prisma } from "./generated/prisma/client.ts";

const OPT_IN_STATUSES: OptInStatus[] = ["PENDING", "OPTED_IN", "OPTED_OUT"];

/** A window of time. Any combination may be set; all must hold. */
export type DateRange = {
  /** On or after this date (YYYY-MM-DD or a full ISO time). */
  after?: string;
  /** Before this date. */
  before?: string;
  /** Within the last N days. */
  withinDays?: number;
  /** More than N days ago. */
  olderThanDays?: number;
};

export type SegmentFilter = {
  /** Has at least one of these tags. */
  tagsAny?: string[];
  /** Has every one of these tags. */
  tagsAll?: string[];
  /** Has none of these tags. */
  tagsNone?: string[];
  optInStatus?: OptInStatus[];
  /** Language codes: "en", "hi". */
  languages?: string[];
  minTotalSpent?: number;
  maxTotalSpent?: number;
  minOrders?: number;
  maxOrders?: number;
  lastOrder?: DateRange;
  /** True for "has never ordered". Cannot be combined with `lastOrder`. */
  neverOrdered?: boolean;
  created?: DateRange;
  /** Started a checkout, didn't finish it, more than N hours ago. */
  abandonedCartOlderThanHours?: number;
};

export type ParseResult = { ok: true; filter: SegmentFilter } | { ok: false; message: string };

const KNOWN_KEYS = new Set<keyof SegmentFilter>([
  "tagsAny",
  "tagsAll",
  "tagsNone",
  "optInStatus",
  "languages",
  "minTotalSpent",
  "maxTotalSpent",
  "minOrders",
  "maxOrders",
  "lastOrder",
  "neverOrdered",
  "created",
  "abandonedCartOlderThanHours",
]);

const RANGE_KEYS = new Set(["after", "before", "withinDays", "olderThanDays"]);

/** Longest list of tags or languages one filter may name. */
const MAX_LIST = 50;
/** Nobody needs a relative window longer than ten years. */
const MAX_DAYS = 3650;

/**
 * Checks a filter from outside (a request body, or a stored row written by an
 * older version) and returns a clean copy. Empty lists and blank values are
 * dropped; anything unknown or malformed is an error with a reason a person
 * can act on.
 */
export function parseSegmentFilter(raw: unknown): ParseResult {
  if (raw === null || raw === undefined) return { ok: true, filter: {} };

  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "The filter isn't in a shape we recognise." };
  }

  const input = raw as Record<string, unknown>;
  const filter: SegmentFilter = {};

  for (const key of Object.keys(input)) {
    if (!KNOWN_KEYS.has(key as keyof SegmentFilter)) {
      return { ok: false, message: `The filter has a setting we don't recognise ("${key}").` };
    }
  }

  for (const key of ["tagsAny", "tagsAll", "tagsNone"] as const) {
    const list = readStringList(input[key], 40);

    if (list === "invalid") return { ok: false, message: "Tags must be a list of tag names." };
    if (list.length > 0) filter[key] = list;
  }

  if (input.optInStatus !== undefined) {
    const list = readStringList(input.optInStatus, 20);

    if (list === "invalid" || list.some((value) => !OPT_IN_STATUSES.includes(value as OptInStatus))) {
      return { ok: false, message: "Consent must be Not asked, Opted in or Opted out." };
    }

    if (list.length > 0) filter.optInStatus = list as OptInStatus[];
  }

  if (input.languages !== undefined) {
    const list = readStringList(input.languages, 12);

    if (list === "invalid") return { ok: false, message: "Languages must be a list of codes like \"en\"." };
    if (list.length > 0) filter.languages = list.map((code) => code.toLowerCase());
  }

  for (const key of ["minTotalSpent", "maxTotalSpent", "minOrders", "maxOrders"] as const) {
    const value = readNumber(input[key]);

    if (value === "invalid") return { ok: false, message: "Amounts and order counts must be numbers of 0 or more." };
    if (value !== undefined) filter[key] = key.endsWith("Orders") ? Math.floor(value) : value;
  }

  if (
    filter.minTotalSpent !== undefined &&
    filter.maxTotalSpent !== undefined &&
    filter.minTotalSpent > filter.maxTotalSpent
  ) {
    return { ok: false, message: "The minimum spend is higher than the maximum." };
  }

  if (filter.minOrders !== undefined && filter.maxOrders !== undefined && filter.minOrders > filter.maxOrders) {
    return { ok: false, message: "The minimum number of orders is higher than the maximum." };
  }

  for (const key of ["lastOrder", "created"] as const) {
    const range = readRange(input[key]);

    if (range === "invalid") {
      return { ok: false, message: "A date in the filter isn't a real date, or a number of days isn't a whole number." };
    }
    if (range) filter[key] = range;
  }

  if (input.neverOrdered !== undefined) {
    if (typeof input.neverOrdered !== "boolean") {
      return { ok: false, message: "\"Never ordered\" must be on or off." };
    }
    if (input.neverOrdered) filter.neverOrdered = true;
  }

  if (filter.neverOrdered && (filter.lastOrder || (filter.minOrders ?? 0) > 0)) {
    return { ok: false, message: "\"Never ordered\" can't be combined with conditions on their orders." };
  }

  const hours = readNumber(input.abandonedCartOlderThanHours);

  if (hours === "invalid") return { ok: false, message: "The abandoned-cart hours must be a number." };
  if (hours !== undefined) filter.abandonedCartOlderThanHours = Math.floor(hours);

  return { ok: true, filter };
}

/** A stored filter, trusted as far as it parses. A broken one matches nobody. */
export function storedFilter(raw: unknown): SegmentFilter | null {
  const parsed = parseSegmentFilter(raw);

  return parsed.ok ? parsed.filter : null;
}

/** True when the filter has no conditions and so would match every contact. */
export function isEmptyFilter(filter: SegmentFilter): boolean {
  return Object.keys(filter).length === 0;
}

/**
 * The database query for a filter, limited to one business.
 *
 * `now` is a parameter so tests (and a rule evaluated in a job) agree on one
 * instant for every relative date.
 */
export function segmentWhere(
  businessId: string,
  filter: SegmentFilter,
  now: Date = new Date(),
): Prisma.ContactWhereInput {
  const and: Prisma.ContactWhereInput[] = [{ businessId }];

  if (filter.tagsAny?.length) {
    and.push({ tags: { some: { tag: { name: { in: filter.tagsAny } } } } });
  }

  for (const name of filter.tagsAll ?? []) {
    and.push({ tags: { some: { tag: { name } } } });
  }

  if (filter.tagsNone?.length) {
    and.push({ tags: { none: { tag: { name: { in: filter.tagsNone } } } } });
  }

  if (filter.optInStatus?.length) and.push({ optInStatus: { in: filter.optInStatus } });
  if (filter.languages?.length) and.push({ language: { in: filter.languages } });

  if (filter.minTotalSpent !== undefined) and.push({ totalSpent: { gte: filter.minTotalSpent } });
  if (filter.maxTotalSpent !== undefined) and.push({ totalSpent: { lte: filter.maxTotalSpent } });
  if (filter.minOrders !== undefined) and.push({ orderCount: { gte: filter.minOrders } });
  if (filter.maxOrders !== undefined) and.push({ orderCount: { lte: filter.maxOrders } });

  if (filter.neverOrdered) and.push({ orderCount: 0 });

  if (filter.lastOrder) {
    const range = dateWhere(filter.lastOrder, now);

    // A contact who has never ordered has no last order, so matches no range.
    and.push({ lastOrderAt: { not: null, ...range } });
  }

  if (filter.created) and.push({ createdAt: dateWhere(filter.created, now) });

  if (filter.abandonedCartOlderThanHours !== undefined) {
    const cutoff = new Date(now.getTime() - filter.abandonedCartOlderThanHours * 60 * 60_000);

    and.push({ checkouts: { some: { convertedAt: null, createdAt: { lte: cutoff } } } });
  }

  return { AND: and };
}

function dateWhere(range: DateRange, now: Date): Prisma.DateTimeFilter {
  const gte: Date[] = [];
  const lt: Date[] = [];

  if (range.after) gte.push(new Date(range.after));
  if (range.withinDays !== undefined) gte.push(daysBefore(now, range.withinDays));
  if (range.before) lt.push(new Date(range.before));
  if (range.olderThanDays !== undefined) lt.push(daysBefore(now, range.olderThanDays));

  const filter: Prisma.DateTimeFilter = {};

  // Several bounds on one side: the tightest wins.
  if (gte.length) filter.gte = new Date(Math.max(...gte.map((d) => d.getTime())));
  if (lt.length) filter.lt = new Date(Math.min(...lt.map((d) => d.getTime())));

  return filter;
}

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60_000);
}

// ─── Saying it in words ─────────────────────────────────────────────────────

const OPT_IN_WORDS: Record<OptInStatus, string> = {
  PENDING: "not asked yet",
  OPTED_IN: "opted in",
  OPTED_OUT: "opted out",
};

/** "Tagged VIP, opted in, and spent at least 5,000" — for lists and previews. */
export function describeSegmentFilter(filter: SegmentFilter): string {
  const parts: string[] = [];

  if (filter.tagsAny?.length) parts.push(`tagged ${orList(filter.tagsAny)}`);
  if (filter.tagsAll?.length) parts.push(`tagged ${andList(filter.tagsAll)}`);
  if (filter.tagsNone?.length) parts.push(`not tagged ${orList(filter.tagsNone)}`);
  if (filter.optInStatus?.length) parts.push(orList(filter.optInStatus.map((s) => OPT_IN_WORDS[s])));
  if (filter.languages?.length) parts.push(`writing in ${orList(filter.languages)}`);

  if (filter.minTotalSpent !== undefined && filter.maxTotalSpent !== undefined) {
    parts.push(`spent between ${number(filter.minTotalSpent)} and ${number(filter.maxTotalSpent)}`);
  } else if (filter.minTotalSpent !== undefined) {
    parts.push(`spent at least ${number(filter.minTotalSpent)}`);
  } else if (filter.maxTotalSpent !== undefined) {
    parts.push(`spent at most ${number(filter.maxTotalSpent)}`);
  }

  if (filter.minOrders !== undefined && filter.maxOrders !== undefined) {
    parts.push(`${filter.minOrders}–${filter.maxOrders} orders`);
  } else if (filter.minOrders !== undefined) {
    parts.push(`at least ${plural(filter.minOrders, "order")}`);
  } else if (filter.maxOrders !== undefined) {
    parts.push(`at most ${plural(filter.maxOrders, "order")}`);
  }

  if (filter.neverOrdered) parts.push("never ordered");
  if (filter.lastOrder) parts.push(`last ordered ${describeRange(filter.lastOrder)}`);
  if (filter.created) parts.push(`added ${describeRange(filter.created)}`);

  if (filter.abandonedCartOlderThanHours !== undefined) {
    parts.push(
      `left a cart unfinished more than ${plural(filter.abandonedCartOlderThanHours, "hour")} ago`,
    );
  }

  if (parts.length === 0) return "Every contact";

  const sentence = andList(parts);

  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function describeRange(range: DateRange): string {
  const parts: string[] = [];

  if (range.withinDays !== undefined) parts.push(`in the last ${plural(range.withinDays, "day")}`);
  if (range.olderThanDays !== undefined) parts.push(`more than ${plural(range.olderThanDays, "day")} ago`);
  if (range.after) parts.push(`on or after ${range.after.slice(0, 10)}`);
  if (range.before) parts.push(`before ${range.before.slice(0, 10)}`);

  return parts.join(" and ");
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function number(value: number) {
  return value.toLocaleString("en-IN");
}

function orList(items: string[]) {
  return joinList(items, "or");
}

function andList(items: string[]) {
  return joinList(items, "and");
}

function joinList(items: string[], word: string) {
  if (items.length <= 1) return items.join("");

  return `${items.slice(0, -1).join(", ")} ${word} ${items[items.length - 1]}`;
}

// ─── Reading the raw input ──────────────────────────────────────────────────

function readStringList(value: unknown, maxLength: number): string[] | "invalid" {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return "invalid";

  const clean: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") return "invalid";

    const trimmed = item.trim().slice(0, maxLength);

    if (trimmed && !clean.includes(trimmed)) clean.push(trimmed);
  }

  return clean.length > MAX_LIST ? "invalid" : clean;
}

function readNumber(value: unknown): number | undefined | "invalid" {
  if (value === undefined || value === null || value === "") return undefined;

  const number = typeof value === "string" ? Number(value) : value;

  if (typeof number !== "number" || !Number.isFinite(number) || number < 0) return "invalid";

  return number;
}

function readRange(value: unknown): DateRange | undefined | "invalid" {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return "invalid";

  const input = value as Record<string, unknown>;
  const range: DateRange = {};

  for (const key of Object.keys(input)) {
    if (!RANGE_KEYS.has(key)) return "invalid";
  }

  for (const key of ["after", "before"] as const) {
    const raw = input[key];

    if (raw === undefined || raw === null || raw === "") continue;
    if (typeof raw !== "string" || Number.isNaN(new Date(raw).getTime())) return "invalid";

    range[key] = raw;
  }

  for (const key of ["withinDays", "olderThanDays"] as const) {
    const raw = readNumber(input[key]);

    if (raw === "invalid" || (raw !== undefined && (!Number.isInteger(raw) || raw > MAX_DAYS))) {
      return "invalid";
    }
    if (raw !== undefined) range[key] = raw;
  }

  return Object.keys(range).length > 0 ? range : undefined;
}

// How a time is written on screen.
//
// "2:14 pm" for today, "Yesterday", a weekday inside the last week, then a
// date — which is how a person describes when something happened, rather than
// a timestamp they have to decode (docs/Rules.md §7).
//
// Nothing server-only here on purpose: the conversation list renders on the
// server and later phases will want the same wording in the browser.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatWhen(when: Date, now: Date = new Date()): string {
  const elapsed = now.getTime() - when.getTime();

  if (elapsed < MINUTE) return "Just now";

  if (isSameDay(when, now)) {
    return when.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  if (isSameDay(when, new Date(now.getTime() - DAY))) return "Yesterday";

  if (elapsed < 7 * DAY) {
    return when.toLocaleDateString(undefined, { weekday: "long" });
  }

  return when.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(when.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * How long something took, in the words somebody would use out loud.
 *
 * "12 seconds", "4 minutes", "3 hours" — never "0:04:07.221". Rounded to one
 * unit on purpose: an answer time of "4 minutes 7 seconds" reads as a
 * measurement, and this is meant to read as an answer (docs/Rules.md §7).
 */
export function formatDuration(ms: number): string {
  if (ms < 1_000) return "under a second";

  const units: [number, string][] = [
    [DAY, "day"],
    [HOUR, "hour"],
    [MINUTE, "minute"],
    [1_000, "second"],
  ];

  for (const [size, name] of units) {
    if (ms < size) continue;

    const count = Math.round(ms / size);

    return `${count} ${name}${count === 1 ? "" : "s"}`;
  }

  return "under a second";
}

/**
 * A plain calendar date: "4 October 2026".
 *
 * Used where the exact day matters and "Yesterday" would be no help at all —
 * when a plan renews, when a cancellation takes effect, when an invoice was
 * issued. Always spelled out, because 04/10 means two different days depending
 * on where the reader lives.
 */
export function formatDate(when: Date): string {
  return when.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

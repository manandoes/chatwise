// Reading a typed or pasted list of phone numbers.
//
// Campaigns used to reach only people who had messaged the business first, and
// every number came from a conversation that already existed. An owner can now
// add numbers by hand as well (docs/PRD.md §7.4), so something has to read what
// a spreadsheet column, a phone's contact list, or somebody typing in a hurry
// actually produces — and say plainly which lines it could not use.
//
// One person per line, as a number on its own or a number and a name:
//
//     919876543210
//     +91 98765 43210, Priya
//
// Nothing here decides whether a number may be messaged. The 25-recipient cap,
// the opt-out list, the plan's quota and the ban-risk warning are applied
// afterwards in send-campaign.ts, to typed numbers and picked contacts alike —
// a number typed in gets no fewer checks than one that arrived by conversation.
//
// No imports on purpose: the campaign builder runs this in the browser to count
// what has been pasted, and send-campaign.ts runs it again on the server, which
// is the run that decides. Same rule as starter-templates.ts and capabilities.ts.

/** The most digits an international number can have (the E.164 limit). */
const MAX_DIGITS = 15;

/**
 * The fewest digits we will accept.
 *
 * This catches a truncated paste and a number missing its country code. It is
 * not a check that the number exists — only WhatsApp can say that, and a
 * well-formed number for nobody still fails at the point of sending.
 */
const MIN_DIGITS = 8;

export type ParsedNumber = {
  /** Digits only, the way a conversation stores a contact's number. */
  phone: string;
  /** Whatever was written after the comma, used to fill in {name}. */
  name: string | null;
};

export type RejectedLine = {
  /** The line as it was written, so the owner can find it in their list. */
  line: string;
  /** What to do about it, in words that name the fix. */
  reason: string;
};

export type ParsedPhoneList = {
  /** Valid numbers, in the order given, with repeats removed. */
  numbers: ParsedNumber[];
  rejected: RejectedLine[];
};

/**
 * Splits a pasted list into numbers we can use and lines we cannot.
 *
 * Bad lines are returned rather than skipped. A campaign that quietly dropped
 * three of twenty-five numbers would look like it had sent to everybody
 * (docs/Rules.md §7), and the owner would find out only when three customers
 * never replied.
 */
export function parsePhoneList(raw: string): ParsedPhoneList {
  const numbers: ParsedNumber[] = [];
  const rejected: RejectedLine[] = [];
  const seen = new Set<string>();

  for (const line of raw.split(/[\r\n]+/)) {
    const trimmed = line.trim();

    if (!trimmed) continue;

    // Everything after the first comma is the name, so "+91 …, Smith, Jr" keeps
    // the comma in the name rather than becoming a third column.
    const [rawNumber, ...rest] = trimmed.split(",");
    const name = rest.join(",").trim();
    const digits = rawNumber.replace(/\D/g, "");

    if (!digits) {
      rejected.push({ line: trimmed, reason: "there's no phone number in it" });
      continue;
    }

    // The commonest mistake by far: a number copied in national format. Sent as
    // it stands it would reach somebody in whichever country reads it that way,
    // which is the one outcome worth being strict about.
    if (digits.startsWith("0")) {
      rejected.push({
        line: trimmed,
        reason: "start it with the country code instead of 0 (91…, 44…, 1…)",
      });
      continue;
    }

    if (digits.length < MIN_DIGITS) {
      rejected.push({
        line: trimmed,
        reason: "it's too short — check the country code is there",
      });
      continue;
    }

    if (digits.length > MAX_DIGITS) {
      rejected.push({
        line: trimmed,
        reason: `it has more than ${MAX_DIGITS} digits, so it isn't a phone number`,
      });
      continue;
    }

    // The same number twice is somebody pasting an overlapping list, not a
    // mistake worth naming. The database would refuse the second one anyway:
    // CampaignRecipient is unique on (campaignId, contactPhone).
    if (seen.has(digits)) continue;

    seen.add(digits);
    numbers.push({ phone: digits, name: name || null });
  }

  return { numbers, rejected };
}

/**
 * The rejected lines as one sentence to put on screen.
 *
 * Here rather than in the builder because the server says the same thing when
 * it refuses the send, and two copies of this wording would drift apart
 * (docs/Rules.md §7).
 */
export function describeRejected(rejected: RejectedLine[]): string {
  const listed = rejected
    .slice(0, 3)
    .map((one) => `"${one.line}" — ${one.reason}`)
    .join("; ");

  const rest = rejected.length - 3;

  return rest > 0
    ? `${listed}; and ${rest} more like it`
    : listed;
}

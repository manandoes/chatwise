// One number, with the words that make it mean something.
//
// Used by both Analytics and the Overview. A figure on its own is a quiz —
// every tile here says what it counts and, where it isn't obvious, over what
// (docs/Rules.md §7).
//
// `value` is a string rather than a number because half of these aren't
// numbers: "4 minutes", "62%", "—". Formatting belongs where the number is
// read, not here.

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  /** The small print under the figure: what it's out of, or where it's from. */
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="text-label uppercase text-text-secondary">{label}</p>

      <p className="mt-2 text-h2 font-semibold tabular-nums text-text-primary">
        {value}
      </p>

      {hint && (
        <p className="mt-1 text-pretty text-xs leading-relaxed text-text-secondary">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * A row of a bar chart: one label, one proportion.
 *
 * Deliberately not a charting library. Three or five bars made of a div are
 * the whole requirement, and a dependency the product owner has to trust
 * (docs/Rules.md §1) should buy more than that.
 */
export function Bar({
  label,
  value,
  total,
  hint,
}: {
  label: string;
  value: number;
  total: number;
  hint?: string;
}) {
  const share = total > 0 ? value / total : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-small text-text-primary">{label}</span>

        <span className="text-small tabular-nums text-text-secondary">
          {value}
          {total > 0 && (
            <span className="ml-2 text-xs text-text-disabled">
              {Math.round(share * 100)}%
            </span>
          )}
        </span>
      </div>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-elevated"
        role="presentation"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </div>

      {hint && <p className="text-xs text-text-secondary">{hint}</p>}
    </div>
  );
}

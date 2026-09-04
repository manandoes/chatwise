// One capability, explained properly: what it is, then the specifics.
// Alternates side to side on wide screens so the page doesn't march.

import type { LucideIcon } from "lucide-react";

export function FeatureDetail({
  icon: Icon,
  name,
  headline,
  body,
  specifics,
  flipped = false,
}: {
  icon: LucideIcon;
  name: string;
  headline: string;
  body: string;
  specifics: string[];
  flipped?: boolean;
}) {
  return (
    <section className="grid items-start gap-8 border-t border-border py-14 lg:grid-cols-2 lg:gap-16">
      <div className={flipped ? "lg:order-2" : undefined}>
        <div className="flex items-center gap-2.5">
          <Icon aria-hidden className="size-4 text-primary" />
          <p className="text-small font-medium text-primary">{name}</p>
        </div>

        <h2 className="mt-3 max-w-[24ch] text-balance text-h2 font-semibold tracking-tight text-text-primary">
          {headline}
        </h2>

        <p className="mt-4 max-w-[62ch] text-pretty leading-relaxed text-text-secondary">
          {body}
        </p>
      </div>

      <ul
        className={`space-y-3 rounded-lg border border-border bg-surface/50 p-6 ${
          flipped ? "lg:order-1" : ""
        }`}
      >
        {specifics.map((specific) => (
          <li
            key={specific}
            className="flex gap-3 text-small leading-relaxed text-text-secondary"
          >
            <span
              aria-hidden
              className="mt-2 size-1 shrink-0 rounded-full bg-primary"
            />
            <span className="text-pretty">{specific}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

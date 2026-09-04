// The placeholder for a screen that isn't built yet.
//
// It says plainly what will be here and when, rather than showing an empty page
// that looks broken (docs/Rules.md §4, §7).

import { NavIcon } from "@/components/dashboard/nav-icon";
import { PageHeader } from "@/components/dashboard/page-header";

export function ComingSoon({
  title,
  description,
  icon,
  phase,
  willDo,
}: {
  title: string;
  description: string;
  icon: string;
  /** Which build phase brings this to life — honest about where things stand. */
  phase: string;
  willDo: string[];
}) {
  return (
    <div className="space-y-8">
      <PageHeader title={title} description={description} />

      <div className="rounded-lg border border-border bg-surface/50 p-8">
        <NavIcon name={icon} className="size-6 text-text-disabled" />

        <h2 className="mt-4 text-h3 font-semibold text-text-primary">
          Not built yet
        </h2>
        <p className="mt-2 max-w-[62ch] text-pretty text-small leading-relaxed text-text-secondary">
          This screen arrives in {phase}. When it does, you&rsquo;ll be able to:
        </p>

        <ul className="mt-5 space-y-2.5">
          {willDo.map((item) => (
            <li
              key={item}
              className="flex gap-3 text-small leading-relaxed text-text-secondary"
            >
              <span
                aria-hidden
                className="mt-2 size-1 shrink-0 rounded-full bg-text-disabled"
              />
              <span className="text-pretty">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

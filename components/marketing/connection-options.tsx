// The two ways to connect a number, from docs/PRD.md §3 (Step B) and §7.1.
//
// The QR connection's ban risk is stated plainly rather than buried. Someone who
// finds that out after their number is gone is a worse outcome than someone who
// reads it here and picks the Business API — and docs/Rules.md §8 treats that
// warning as a safety feature, not marketing copy to soften.
//
// Both routes are paid, and the difference in what they cost is stated as
// plainly as the difference in what they do: the QR connection is covered by the
// subscription alone, and the Business API adds Meta's own per-conversation
// charges, billed by Meta. No rate is quoted for Meta's side anywhere — the
// numbers are theirs and vary by country (docs/Rules.md §9).

import { QrCode, ShieldCheck } from "lucide-react";

const OPTIONS = [
  {
    id: "qr",
    icon: QrCode,
    name: "QR connection",
    tagline: "For small businesses",
    summary:
      "Scan a code with your phone, exactly like WhatsApp Web. Your number, working in minutes, with nothing to apply for.",
    points: [
      "Your monthly plan is the whole bill — nothing is charged per message",
      "Set up in minutes — no Meta application or business verification",
      "Bulk sends capped at 25 people at a time, spaced out",
      "Unofficial channel: messaging people who didn't ask to hear from you can get your number banned",
    ],
    highlighted: false,
  },
  {
    id: "api",
    icon: ShieldCheck,
    name: "WhatsApp Business API",
    tagline: "For larger businesses",
    summary:
      "The official channel from Meta. Built for volume, with the reliability that comes from being sanctioned rather than tolerated.",
    points: [
      "Your monthly plan, plus Meta's per-conversation charges billed to you by Meta at their rates",
      "Official, supported connection",
      "Large contact lists, using templates Meta has approved",
      "Requires a Meta application and business verification before you can start",
    ],
    highlighted: true,
  },
];

export function ConnectionOptions() {
  return (
    <section className="mx-auto w-full max-w-content px-6 py-20 lg:py-24">
      <div className="max-w-[62ch]">
        <h2 className="text-balance text-h1 font-bold tracking-tight text-text-primary">
          Two ways onto WhatsApp
        </h2>
        <p className="mt-4 text-pretty text-text-secondary">
          You pick one when you sign up. An account is on the QR connection or
          the Business API — never both at once — so there is never any doubt
          about which route a message went out by. Both need a paid plan; only
          the Business API adds charges from Meta on top of it.
        </p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        {OPTIONS.map((option) => (
          <div
            key={option.id}
            className={`rounded-lg border p-7 ${
              option.highlighted
                ? "border-primary/40 bg-surface"
                : "border-border bg-surface/50"
            }`}
          >
            <div className="flex items-center gap-3">
              <option.icon
                aria-hidden
                className={`size-5 ${
                  option.highlighted ? "text-primary" : "text-text-secondary"
                }`}
              />
              <h3 className="text-h3 font-semibold text-text-primary">
                {option.name}
              </h3>
              <span className="ml-auto rounded-full border border-border px-2.5 py-1 text-text-secondary text-[0.6875rem]">
                {option.tagline}
              </span>
            </div>

            <p className="mt-4 text-pretty text-small leading-relaxed text-text-secondary">
              {option.summary}
            </p>

            <ul className="mt-6 space-y-3">
              {option.points.map((point) => (
                <li
                  key={point}
                  className="flex gap-3 text-small leading-relaxed text-text-secondary"
                >
                  <span
                    aria-hidden
                    className="mt-2 size-1 shrink-0 rounded-full bg-text-disabled"
                  />
                  <span className="text-pretty">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

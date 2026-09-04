// Setup, start to finish. This genuinely is an ordered sequence — it mirrors
// the four onboarding steps in docs/PRD.md §3 — so the numbers carry real
// information rather than being decoration.

const STEPS = [
  {
    title: "Pick your agent",
    body: "Choose one from the catalogue — receptionist, lead qualifier, appointments, sales, support and more. One agent per account, so there's exactly one thing answering your customers.",
  },
  {
    title: "Connect your WhatsApp",
    body: "Scan a QR code with your phone, the way WhatsApp Web works. Or, if you're on the official Business API, paste in your Meta credentials.",
  },
  {
    title: "Tell it about your business",
    body: "A few plain-English questions — your hours, what you sell, your policies — plus the tone you want and when it should fetch a human instead of guessing.",
  },
  {
    title: "It starts replying",
    body: "Customers message your normal number and get answers. You watch it happen in your inbox and step in whenever you want to.",
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-content px-6 py-20 lg:py-24">
      <h2 className="max-w-[20ch] text-balance text-h1 font-bold tracking-tight text-text-primary">
        Live in an afternoon, not a quarter
      </h2>
      <p className="mt-4 max-w-[62ch] text-pretty text-text-secondary">
        There is no bot to build and nothing to code. You answer questions about
        your business; the agent is already written.
      </p>

      <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="relative">
            <div className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 text-small font-semibold text-primary">
                {index + 1}
              </span>

              {/* The line joining one step to the next, on wide screens only. */}
              {index < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="hidden h-px flex-1 bg-gradient-to-r from-border to-transparent lg:block"
                />
              )}
            </div>

            <h3 className="mt-4 text-h3 font-semibold text-text-primary">
              {step.title}
            </h3>
            <p className="mt-2 text-pretty text-small leading-relaxed text-text-secondary">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

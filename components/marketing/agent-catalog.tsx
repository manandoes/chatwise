// The agent catalogue, straight from docs/PRD.md §5.
//
// Nine are customer-facing and you choose exactly one. The tenth, the CRM
// agent, isn't a choice — it runs in the background alongside whichever one you
// picked. Showing it apart from the others keeps that distinction honest.

const AGENTS = [
  {
    name: "Receptionist",
    trigger: "Answers general questions from your hours, FAQs and policies.",
  },
  {
    name: "Lead Qualifier",
    trigger: "Works out whether a new enquiry is worth your time, and files it.",
  },
  {
    name: "Appointment",
    trigger: "Handles “can I come at 4?” against your real calendar.",
  },
  {
    name: "Sales",
    trigger: "Fields pricing and plan questions, and sends a checkout link.",
  },
  {
    name: "Support",
    trigger: "Picks up order problems and issues, and raises what it can't fix.",
  },
  {
    name: "Follow-up",
    trigger: "Chases quotes that went quiet, using messages you approved.",
  },
  {
    name: "Personal Shopper",
    trigger: "Turns “a gift under ₹5,000” into real suggestions from your catalogue.",
  },
  {
    name: "Feedback",
    trigger: "Asks how it went after a purchase, and flags unhappy replies.",
  },
  {
    name: "Internal",
    trigger: "Answers your own team's questions from internal documents.",
  },
];

export function AgentCatalog() {
  return (
    <section className="border-y border-border bg-surface/40">
      <div className="mx-auto w-full max-w-content px-6 py-20 lg:py-24">
        <div className="max-w-[62ch]">
          <h2 className="text-balance text-h1 font-bold tracking-tight text-text-primary">
            Nine agents. You run one.
          </h2>
          <p className="mt-4 text-pretty text-text-secondary">
            Each one is already written and tested for a specific job, so you
            aren&rsquo;t assembling a chatbot from parts. Pick the job you
            actually need doing.
          </p>
        </div>

        <ul className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((agent) => (
            <li
              key={agent.name}
              className="group bg-background p-6 transition-colors hover:bg-surface-elevated"
            >
              <h3 className="font-semibold text-text-primary transition-colors group-hover:text-primary">
                {agent.name}
              </h3>
              <p className="mt-1.5 text-pretty text-small leading-relaxed text-text-secondary">
                {agent.trigger}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-6">
          <h3 className="font-semibold text-primary">
            And the CRM agent, always on
          </h3>
          <p className="mt-1.5 max-w-[70ch] text-pretty text-small leading-relaxed text-text-secondary">
            It isn&rsquo;t one of the nine and you don&rsquo;t choose it. It reads
            along in the background of every conversation and keeps your contact
            records current, whichever agent is doing the talking — so your leads
            list stays up to date without anyone typing into it.
          </p>
        </div>
      </div>
    </section>
  );
}

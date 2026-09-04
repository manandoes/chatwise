// What you get in the dashboard, from docs/PRD.md §6.

import {
  BarChart3,
  BookOpen,
  Inbox,
  Megaphone,
  PlugZap,
  Users,
} from "lucide-react";

const FEATURES = [
  {
    icon: Inbox,
    name: "Conversations",
    body: "Every chat your agent is handling, live. Jump in and take over mid-thread whenever you want to, then hand it back.",
  },
  {
    icon: Users,
    name: "Leads",
    body: "Contacts captured out of real conversations, with a status and a score. Edit them yourself and the agent won't overwrite your changes.",
  },
  {
    icon: BookOpen,
    name: "Knowledge base",
    body: "Your hours, prices, policies and catalogue. This is the only thing your agent answers from — it won't invent an answer it doesn't have.",
  },
  {
    icon: PlugZap,
    name: "Connection health",
    body: "Whether your number is actually connected right now, in plain words, and a reconnect button when it isn't.",
  },
  {
    icon: Megaphone,
    name: "Campaigns",
    body: "Send a message to a list of contacts, personalised per person, from a library of ready-made templates. Anyone who replies STOP is excluded automatically.",
  },
  {
    icon: BarChart3,
    name: "Analytics",
    body: "How many messages were handled, how fast, and how many enquiries turned into something.",
  },
];

export function DashboardFeatures() {
  return (
    <section className="border-t border-border bg-surface/40">
      <div className="mx-auto w-full max-w-content px-6 py-20 lg:py-24">
        <div className="max-w-[62ch]">
          <h2 className="text-balance text-h1 font-bold tracking-tight text-text-primary">
            One place for everything it handles
          </h2>
          <p className="mt-4 text-pretty text-text-secondary">
            The agent does the replying. The dashboard is where you watch it,
            correct it, and pick up the conversations worth your attention.
          </p>
        </div>

        <div className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.name}>
              <feature.icon aria-hidden className="size-5 text-primary" />
              <h3 className="mt-4 font-semibold text-text-primary">
                {feature.name}
              </h3>
              <p className="mt-2 text-pretty text-small leading-relaxed text-text-secondary">
                {feature.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Frequently asked questions.
//
// Built on the browser's own <details> element, so every answer is readable and
// searchable even if JavaScript never runs.
//
// Every answer here traces back to docs/PRD.md. Where a decision genuinely
// isn't made yet (docs/PRD.md §10), the answer says only what has been decided
// rather than inventing the rest — and nothing here states what Meta does or
// doesn't permit as though it were fact (docs/Rules.md §8).

import { Plus } from "lucide-react";

export type FaqItem = { question: string; answer: string };

export type FaqGroup = { heading: string; items: FaqItem[] };

export const FAQ_GROUPS: FaqGroup[] = [
  {
    heading: "Getting started",
    items: [
      {
        question: "Do I need a new phone number?",
        answer:
          "No. ChatWise works with the WhatsApp number you already use for your business. Your customers keep messaging the number they know.",
      },
      {
        question: "Do I have to write prompts, or any code?",
        answer:
          "No. Every agent is already written. You answer a handful of plain questions about your business — your hours, what you sell, your policies — and the tone you want, and that is the whole setup.",
      },
      {
        question: "How long does setup take?",
        answer:
          "On the QR connection, minutes: pick your agent, answer the questions, scan a QR code with your phone. The Business API route takes longer because Meta has its own application and business-verification process to go through first.",
      },
    ],
  },
  {
    heading: "How the agents work",
    items: [
      {
        question: "Can I run more than one agent?",
        answer:
          "No — one agent per account, deliberately. It means there is never a question about which agent replied to a customer or which one to correct. A business that genuinely needs two runs two accounts.",
      },
      {
        question: "Can I change my agent or connection later?",
        answer:
          "Yes, but it replaces your current setup rather than sitting alongside it — you will go back through setup for the new one. There is no way to end up running two agents, or a QR connection and the API, at the same time.",
      },
      {
        question: "What happens when the agent doesn't know something?",
        answer:
          "It says so and passes the conversation to you, rather than guessing. Agents only answer from the knowledge base and business details you gave them — they are not permitted to invent hours, prices or policies.",
      },
      {
        question: "Can I take over a conversation myself?",
        answer:
          "Yes. Any chat in your inbox can be taken over mid-thread — the agent pauses, you type, and you hand it back when you're done.",
      },
      {
        question: "What is the CRM agent?",
        answer:
          "A background agent that reads along with every conversation and keeps your contact records current, whichever agent is doing the talking. It isn't one of the nine you choose from and it doesn't count against the one-agent rule. If you edit a lead by hand, it won't overwrite what you wrote.",
      },
    ],
  },
  {
    heading: "Connecting WhatsApp",
    items: [
      {
        question: "What's the difference between the QR connection and the Business API?",
        answer:
          "Both need a paid plan; what differs is who else bills you. The QR connection works the way WhatsApp Web does: you scan a code, your phone stays linked, it's instant, and your monthly plan is the whole bill — but it is an unofficial route. The Business API is Meta's official channel, more reliable and built for volume, but you have to apply for it and Meta charges you per conversation on top of your plan, at their own rates.",
      },
      {
        question: "Could my number get banned?",
        answer:
          "On the QR connection, yes — that risk is real, and we would rather you hear it from us. Messaging people who never asked to hear from you, or messaging too often, is what puts a number at risk. That is why QR bulk sends are capped at 25 people at a time and spaced out, and why we show a warning before the first one. If you need to reach large lists, the Business API is the safe route.",
      },
      {
        question: "What happens if my connection drops?",
        answer:
          "Your dashboard shows the true state of the connection in plain words — connected, reconnecting, or disconnected and needing you — rather than quietly failing. It reconnects on its own where it can, and tells you when it can't.",
      },
    ],
  },
  {
    heading: "Messaging your contacts",
    items: [
      {
        question: "How many people can I message at once?",
        answer:
          "On the QR connection, 25 at a time, sent with a gap between each rather than all at once. On the Business API, much larger lists, using templates Meta has approved. The 25 limit is enforced by the system itself, not just discouraged.",
      },
      {
        question: "What happens when someone replies STOP?",
        answer:
          "They are recorded as opted out and excluded from every future send automatically, on both connections. Outgoing bulk messages also carry a line telling people how to opt out.",
      },
    ],
  },
  {
    heading: "Your data",
    items: [
      {
        question: "Can other ChatWise customers see my conversations?",
        answer:
          "No. Each customer's data is separate, and on the QR connection each WhatsApp session runs in its own isolated process — so another customer's session dropping, or their number being banned, cannot reach your account or your chats.",
      },
      {
        question: "How are my WhatsApp credentials stored?",
        answer:
          "Encrypted, and only ever used by the server. API tokens and session data are never sent to your browser, and they never appear in the app's code.",
      },
    ],
  },
];

export function FaqList({ groups }: { groups: FaqGroup[] }) {
  return (
    <div className="space-y-14">
      {groups.map((group) => (
        // On wide screens the group heading sits alongside its questions and
        // follows them down the page, so the answers keep a readable line length
        // without leaving half the screen empty.
        <section
          key={group.heading}
          className="grid gap-4 lg:grid-cols-[14rem_1fr] lg:gap-12"
        >
          <h2 className="text-h2 font-semibold tracking-tight text-text-primary lg:sticky lg:top-24 lg:self-start">
            {group.heading}
          </h2>

          <div className="divide-y divide-border border-y border-border">
            {group.items.map((item) => (
              <details key={item.question} className="group">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-4 text-text-primary marker:content-none hover:text-primary">
                  <span className="text-pretty font-medium">
                    {item.question}
                  </span>
                  <Plus
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-text-secondary transition-transform duration-200 group-open:rotate-45"
                  />
                </summary>

                <p className="max-w-[72ch] pb-5 text-pretty text-small leading-relaxed text-text-secondary">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

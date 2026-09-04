// The hero visual: a WhatsApp thread, because that is literally what this
// product produces. Everything here is drawn with markup rather than being a
// screenshot, so it stays sharp at any size and readable to screen readers.
//
// The exchange shown is what the Receptionist agent (docs/PRD.md §5) does:
// answers from the business's own knowledge base, and hands over to a person
// when it doesn't know.

import { Check, Phone, Video } from "lucide-react";

type Message = {
  from: "customer" | "agent";
  text: string;
  time: string;
};

const THREAD: Message[] = [
  {
    from: "customer",
    text: "Hi! Are you open this Sunday?",
    time: "09:41",
  },
  {
    from: "agent",
    text: "We are — Sunday 10am to 4pm. Our full hours are Mon–Sat 9–7, Sun 10–4. 🙂",
    time: "09:41",
  },
  {
    from: "customer",
    text: "Great. Do you do same-day repairs?",
    time: "09:42",
  },
  {
    from: "agent",
    text: "Yes, for screen and battery jobs booked before 2pm. Anything bigger we usually turn around next day.",
    time: "09:42",
  },
  {
    from: "customer",
    text: "What would a cracked screen cost for a Pixel 8?",
    time: "09:43",
  },
  {
    from: "agent",
    text: "I don't have Pixel 8 pricing to hand — let me get Ravi to confirm. He'll reply here shortly.",
    time: "09:43",
  },
];

export function ConversationPreview() {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      {/* The soft green glow behind the frame (Design.md §7). Decorative. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-6 rounded-full bg-primary/20 blur-[80px]"
      />

      <div className="relative overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl shadow-black/40">
        {/* Thread header */}
        <div className="flex items-center gap-3 border-b border-border bg-surface-elevated px-4 py-3">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-small font-semibold text-primary"
          >
            RM
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-small font-medium text-text-primary">
              Ravi Mobile Repairs
            </p>
            <p className="flex items-center gap-1.5 text-text-secondary text-[0.6875rem]">
              <span
                aria-hidden
                className="size-1.5 rounded-full bg-primary shadow-glow"
              />
              online
            </p>
          </div>

          <Video aria-hidden className="size-4 shrink-0 text-text-disabled" />
          <Phone aria-hidden className="size-4 shrink-0 text-text-disabled" />
        </div>

        {/* Messages */}
        <ol className="flex flex-col gap-2 px-4 py-5">
          {THREAD.map((message, index) => {
            const isAgent = message.from === "agent";

            return (
              <li
                key={message.text}
                style={{ animationDelay: `${index * 140}ms` }}
                className={`chat-bubble flex max-w-[85%] flex-col gap-0.5 rounded-2xl px-3 py-2 ${
                  isAgent
                    ? "self-end rounded-br-sm bg-primary/15"
                    : "self-start rounded-bl-sm bg-surface-elevated"
                }`}
              >
                <span className="sr-only">
                  {isAgent ? "Your agent replied:" : "Customer wrote:"}
                </span>

                <p className="text-small leading-relaxed text-text-primary">
                  {message.text}
                </p>

                <span className="flex items-center gap-1 self-end text-text-secondary text-[0.625rem]">
                  {message.time}
                  {isAgent && (
                    <Check aria-hidden className="size-3 text-primary" />
                  )}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Handover notice — the escalation path every agent must have
            (docs/Rules.md §5). */}
        <div className="border-t border-border bg-surface-elevated px-4 py-3">
          <p className="text-text-secondary text-[0.6875rem]">
            <span className="font-medium text-primary">Handed to Ravi</span> ·
            your Receptionist didn&rsquo;t have the answer, so it stopped rather
            than guessing.
          </p>
        </div>
      </div>
    </div>
  );
}

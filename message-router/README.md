# The message router

Every WhatsApp message that arrives passes through `router.ts`. There is one
entry point on purpose: whatever changes about how messages get *in* — a new
connector, a different queue — the part that decides what to do with one stays
in a single file.

What it does, in order:

1. Works out which account the message belongs to, from the connection it
   arrived on. Never from anything in the message itself.
2. Finds or starts that customer's conversation thread and records what they
   said.
3. Stops there if it has seen this message before — Meta re-sends webhooks it
   thinks were missed, and a repeat must not become a second reply.
4. Asks the account's one chosen agent (`/bots`) what to say.
5. Sends the reply back the way it came, and writes down what happened —
   including, when the agent handed the thread over, that it was *the agent*
   who did so rather than somebody in the inbox (Phase 9).
6. Asks the always-on CRM agent to bring that contact's record up to date —
   afterwards, never before. Nobody waits longer for a reply because of the
   bookkeeping, and if it fails the customer has still been answered.

## Things it deliberately does not do

- **It does not choose between agents.** An account runs exactly one
  (docs/PRD.md §3.1), so there is nothing to choose. The router exists anyway
  because everything *around* that decision has to live somewhere, and because
  it is the one place a choice would go if the product ever grows one.
- **It does not know how to send anything.** Whoever calls it passes in a way to
  deliver the reply — Meta's API for the paid tier, the customer's own worker
  process for the free tier. That keeps the browser-driving, signature-checking
  half of the system out of here entirely.
- **It never throws.** A webhook that fails makes Meta retry; a worker that
  crashes takes somebody's WhatsApp down. Failures are logged and returned as
  an outcome.

## When the agent says nothing

Three cases, and in all of them the customer's message is still recorded so the
business owner can see it and answer themselves:

- the account has not finished setting up
- the thread is already waiting for a person, so the agent stays out of the way
- the message was a duplicate

The middle case now covers two things that look identical from here: an agent
that handed the thread over, and a person who took it over from the inbox
(Phase 9). The router checks one field for both, which is the point — there is
never a second condition to remember before replying over the top of somebody.

The CRM agent is the exception to the middle one. It says nothing to anybody, so
it keeps reading a thread a person has taken over — a customer record that stops
keeping up the moment a human steps in would be wrong exactly when it matters
most.

Everything else gets a reply. Even "I can't answer this" is sent — a customer
who is left with silence has been failed twice.

## What the inbox needs from it

One small thing, and it happens here rather than in the inbox: every message
that is genuinely new bumps that thread's unread count. Doing it here is what
makes a webhook Meta re-sends leave the count alone — the router already knows
which messages it has seen before, and the inbox never has to.

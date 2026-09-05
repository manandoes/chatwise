# Pages and API routes

Everything a browser can reach. Next.js turns each folder into an address, so
the folder names here are the URLs a customer sees — which is why they are
written in plain English (docs/Rules.md §2).

## The public site

- `(marketing)/` — homepage, `features`, `pricing`, `faq`. No login needed. The
  brackets group these pages under a shared header and footer without adding
  anything to the address
- `(auth)/` — `login` and `signup`

## Behind a login

- `onboarding/` — the four-step setup wizard: which agent, how to connect
  WhatsApp, what the business does, how the agent should behave. Each step saves
  as it goes, so closing the tab halfway loses nothing
- `dashboard/` — everything an account manages day to day. `layout.tsx` is the
  sidebar and top bar, and it sends anyone with unfinished setup back to it

## When things go wrong

Three screens, in order of how badly (docs/Rules.md §4):

- `not-found.tsx` — an address that doesn't exist
- `error.tsx` — a page that failed
- `global-error.tsx` — the layout itself failed. Written in plain inline styles
  because it cannot rely on anything the layout would have set up

`dashboard/loading.tsx` fills the screen while a dashboard page is being worked
out, so a click never looks like it did nothing.

## `api/`

Server-side endpoints. See the README inside it — the short version is that
every route checks the signed-in user owns what it is about, and the two public
ones (a payment webhook and each customer's WhatsApp webhook) verify a signature
instead.

## What does not belong here

An agent's instructions. Those live in `bots/<agent>-bot/prompt.ts` and nowhere
else (docs/Rules.md §2) — a page calls an agent, it never contains one. The same
goes for the rules around bulk sending, which live in `campaigns/`: a rule
enforced only at the door stops existing the moment somebody adds a second door.

# ChatWise

ChatWise lets a business put a ready-made **AI agent on their own WhatsApp
number** — a receptionist, a lead qualifier, a sales assistant — and manage every
conversation, lead and setting from one dashboard.

The business owner never writes code. They pick the agent they want, answer a few
questions about their business, connect WhatsApp, and it goes live.

## How a customer uses it

1. They land on the website and sign up.
2. A short setup wizard asks four things: **which agent** they want, **how to
   connect WhatsApp**, **what their business does**, and **how the agent should
   behave**.
3. They connect their WhatsApp number, either by scanning a QR code or by
   entering official WhatsApp Business API details.
4. From then on, the agent answers their customers automatically, and everything
   shows up in their dashboard.

## Two ways to connect WhatsApp

**Both tiers are paid.** Every account needs a monthly ChatWise subscription
whichever way it connects. What differs is who the business is — and whether
anyone else bills them.

|  | **QR connection** | **Official API** |
|---|---|---|
| Who it's for | Small businesses | Larger businesses |
| How it connects | Scan a QR code, like WhatsApp Web | Official WhatsApp Business API from Meta |
| What it costs | The ChatWise subscription, and nothing else | The ChatWise subscription **plus Meta's per-conversation charges**, billed by Meta |
| Its plan | **Small Business**, ₹999 a month | **Enterprise**, ₹1,499 a month |
| Bulk messages | Up to **25 recipients** per send, spaced out | Large lists, using Meta-approved templates |
| Risk | Unofficial channel — careless sending can get a number banned | Officially sanctioned |

On the API tier, Meta bills the customer directly against their own Meta
account, at Meta's rates for their country and conversation type. That money
never passes through ChatWise, and nothing in this repo quotes a figure for it
(docs/Rules.md §9) — the screens say the charge exists and point at Meta.

## What it costs

**There is one plan per connection tier, and nothing else** — no ladder of
sizes. The plan a business buys *is* the way it connects to WhatsApp.

| | **Small Business** | **Enterprise** |
|---|---|---|
| Connection | QR code | Official WhatsApp Business API |
| Per month | ₹999 | ₹1,499 |
| Meta's per-conversation charge | None | Billed to you by Meta, at Meta's rates |
| Messages sent | 2,000 | 10,000 |
| Campaigns | 4 a month, up to 25 people each | Unlimited, no recipient cap |
| Saved templates | 10 | Unlimited |
| Knowledge answers | 50 | 100 |
| Analytics history | 30 days | Everything |
| Support | Email | Priority |

There is no free plan. An account with no live subscription — a new signup that
hasn't paid, or one whose cancellation has run its course — keeps everything it
has and can read it, but cannot send. That state is the `NONE` value in the
database; nothing sells it or shows it as a plan.

Both plans run one agent on one number, so nothing is priced per seat or per
bot. Payment goes through **Razorpay**, on their own hosted page — no card
details ever reach ChatWise.

The limits live in one file, [`lib/plans.ts`](lib/plans.ts), and that is the only
place to change them.

## One bot, one connection, per account

This is a firm product rule, not a setting: **an account runs exactly one agent
on exactly one connection type.** A business that wants a second agent needs a
second account. The database enforces this, not just the screens.

The one exception is the **CRM agent**, which runs quietly in the background
alongside whichever agent was chosen, keeping contact records up to date.

## What the dashboard does

| Screen | What it's for |
|---|---|
| **Overview** | The numbers at a glance, and whether WhatsApp is actually connected |
| **My bot** | The one agent this account runs — what it knows, how it behaves |
| **Conversations** | A live inbox. Watch a chat as it happens, take it over, reply yourself, hand it back |
| **Leads** | The contacts those conversations turned into. Correct anything the agent got wrong, and it leaves that field alone from then on |
| **Connect WhatsApp** | The QR scanner or the Business API form, and the connection's health |
| **Knowledge base** | The questions and answers the agent may answer from |
| **Analytics** | Messages handled, how long people waited, and how many became customers |
| **Campaigns** | Bulk sends, with the 25-recipient cap, the throttle and the opt-out checks that keep a number safe |
| **Billing** | Your plan, what you've used this month, and your invoices |

Two things are worth knowing about how it behaves, because they are promises
rather than preferences:

- **The agent and a person never reply at the same time.** Taking a
  conversation over — or simply typing a reply into it — stops the agent
  answering in that thread until you hand it back.
- **A field you edit on a lead becomes yours.** The background agent keeps the
  rest current and never overwrites what you corrected, unless you explicitly
  ask it to for that lead.
- **Running out of messages never silences you.** If a month's allowance runs
  out, the agent stops replying by itself and hands those threads to you —
  answering somebody by hand in the inbox is never limited.

## What's in this repo

| Folder | What's inside |
|---|---|
| `app/` | Every page and API endpoint |
| `bots/` | The agents' instructions — one folder per agent, named after the agent |
| `whatsapp-connectors/` | The two ways of talking to WhatsApp |
| `message-router/` | The single front door for incoming messages |
| `campaigns/` | Bulk outreach, and the safety limits around it |
| `components/` | Reusable interface pieces |
| `lib/` | Shared helpers — the database connection, the inbox, the lead rules, the numbers, the plans and their limits |
| `prisma/` | The database structure |
| `jobs/` | Scheduled and background work |
| `docs/` | The planning documents this project is built from |

If you want to change what an agent says, open its folder under `bots/` — that is
the only place its instructions live.

## The planning documents

Read these before changing anything. They are the source of truth, and the code
follows them rather than the other way round.

| Document | What it covers |
|---|---|
| [docs/PRD.md](docs/PRD.md) | What the product is and every feature it needs |
| [docs/Architecture.md](docs/Architecture.md) | The tech stack, how a message flows through the app, the folder layout |
| [docs/Rules.md](docs/Rules.md) | Hard boundaries — security, safety limits, what not to do |
| [docs/Phases.md](docs/Phases.md) | The build order, phase by phase |
| [docs/Design.md](docs/Design.md) | Colours, typography, components |
| [docs/Memory.md](docs/Memory.md) | Running log of what's built, what's in progress, and open questions |

## What runs where

ChatWise is **two processes**, not a separate frontend and backend:

| Process | What it is | Command |
|---|---|---|
| **The app** | Next.js — the website, the dashboard *and* every API route, in one process. There is no separate backend server. | `npm run dev` |
| **The WhatsApp worker** | An always-on Node process that drives QR-tier (QR) WhatsApp sessions and sends campaigns. Talks to the app through Redis, never over HTTP. | `npm run whatsapp-worker` |

The app on its own is enough for everything except the QR WhatsApp tier and
campaign sending. Start the worker when you need those.

Both processes read the same `.env`, and both need `GEMINI_API_KEY` — the worker
answers messages too.

## Running it locally

You need **Node.js 20.19 or newer**, a **PostgreSQL** database
([Supabase](https://supabase.com) is what we use), and — only for the WhatsApp
worker — a **Redis**.

```bash
# 1. Install dependencies
npm install

# 2. Create your local settings file
cp .env.example .env

# 3. Fill in three things in .env:
#      DATABASE_URL     Supabase → Settings → Database → Connection string,
#                       the POOLED one (port 6543)
#      DIRECT_URL       the same page, the DIRECT one (port 5432) — migrations only
#      AUTH_SECRET      generate one with:  openssl rand -base64 32
#    Add GEMINI_API_KEY (https://aistudio.google.com/apikey) when you want the
#    bots to actually reply. Without it messages still arrive and are handed to
#    a person — they are just never answered automatically.
#    (.env.example explains every other variable and when you'll need it.)

# 4. Create the database tables
npm run db:migrate

# 5. Start the app
npm run dev
```

Then open <http://localhost:3000/signup> and create yourself an account.

**Google sign-in is optional.** Leave `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` blank and the "Continue with Google" button simply
doesn't appear — email and password work on their own.

The app runs at <http://localhost:3000>. To check the database is connected,
open <http://localhost:3000/api/health> — it should say `"database": "connected"`.

To bring up the WhatsApp side as well, set `REDIS_URL` (locally:
`docker run -p 6379:6379 redis`) and run the worker in a second terminal:

```bash
npm run whatsapp-worker
```

**No PostgreSQL installed?** Prisma can run one for you locally:

```bash
npx prisma dev --name chatwise --detach   # start it
npx prisma dev ls                         # print its connection URL
```

Paste that URL into `DATABASE_URL` in your `.env`, leave `DIRECT_URL` blank, then
carry on from step 4. Note that it picks a new port each time it is created.

### Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Run the app locally with live reload |
| `npm run whatsapp-worker` | Run the WhatsApp session + campaign worker |
| `npm run build` | Build the production version |
| `npm start` | Run the built production version |
| `npm run lint` | Check the code for mistakes |
| `npm run db:migrate` | Apply database changes locally |
| `npm run db:deploy` | Apply already-written migrations to production |
| `npm run db:studio` | Open a visual browser for the database |

Run `npx prisma generate` after any change to `prisma/schema.prisma`.

## Deploying

Four pieces, and only one of them has an awkward requirement.

**1. Database — Supabase.** Create the project, then run the migrations against
it once from your own machine with `DIRECT_URL` pointing at the direct (5432)
string:

```bash
npm run db:deploy
```

Supabase often refuses to let migrations create their scratch "shadow" database.
If that happens, create a second empty database and point `SHADOW_DATABASE_URL`
at it.

**2. The app — any Node host; Vercel is the easy one.** `npm run build` is the
build command and it runs `prisma generate` first. Set every variable from
`.env.example` that you actually use, and note two:

- `DATABASE_URL` must be the **pooled** (6543) string, with
  `?pgbouncer=true&connection_limit=1` kept on the end. Serverless opens and
  drops connections constantly; the pooler is what stops that exhausting the
  database.
- `AUTH_URL` must be your real https domain, and `AUTH_SECRET` must be a
  *different* value from your local one. Off Vercel, also set
  `AUTH_TRUST_HOST="true"`.

**3. The WhatsApp worker — not Vercel.** It is a long-lived process that drives a
real Chrome, so it needs a host that runs containers or plain VMs (a GCE VM,
Railway, Render, Fly, a VPS). `Dockerfile.worker` builds it — Debian +
Chromium, no HTTP port, since the worker only makes outbound connections. Give
it the same `.env` values as the app plus `CHROME_PATH=/usr/bin/chromium` (set
by the image already) and `WHATSAPP_SESSION_PATH`.

That path does **not** need a persistent disk: whatsapp-web.js's `RemoteAuth`
keeps the real session encrypted in Postgres
(`whatsapp-connectors/web-qr/session-store.ts`), and re-populates the local
path from there on startup. A restarted or replaced container does not force
anyone to rescan a QR code.

Run **exactly one** instance — the manager tracks live sessions in memory
(`whatsapp-connectors/web-qr/session-manager.ts`), so a second instance
consuming the same command queue could act on a session it doesn't hold.
Scale the box vertically instead: each connected customer is a running
Chromium, at roughly 400–600 MB.

On a GCE VM, `scripts/deploy-worker-gcp.sh` does the whole thing end to end —
creates the VM if it doesn't exist yet, ships the source and *only* the four
env vars the worker needs over SSH (never through instance metadata, which
isn't access-controlled the way a file on the instance's own disk is), builds
`Dockerfile.worker` on it, and runs the container with
`--restart unless-stopped`. It's the same command for the first deploy and
every redeploy after:

```bash
./scripts/deploy-worker-gcp.sh
```

Elsewhere (Railway, Render, Fly, a VPS), the same image works — build
`Dockerfile.worker` and run it with `--restart unless-stopped --env-file .env`.

Skip this box entirely if you only sell the Business-API tier: that tier is
webhooks, and the app serves those itself.

**4. Redis.** Both boxes point `REDIS_URL` at the same one (Upstash, Railway, or
your own). It is how the app and the worker talk.

Then, in the vendors' dashboards:

- **Razorpay** → Webhooks → `https://<your-domain>/api/billing/webhook`,
  subscribed to the `subscription.*` events.
- **Meta**, per paying customer — each one gets their own webhook address; the
  Connect WhatsApp screen shows them what to paste.

Finally, open `https://<your-domain>/api/health`. It reports the database and
Redis honestly, which makes it the fastest way to catch a variable you set on
one box and forgot on the other.

## Secrets

Nothing secret is ever written into the code. Every key, token and connection
string is read from an environment variable, and each one is listed and explained
in [`.env.example`](.env.example). Your real `.env` file is never committed.

## Current status

**All fourteen phases are built**, and typecheck, lint and `npm run build` are
clean. That covers the public website, accounts and login, the setup wizard, the
dashboard, both ways of connecting WhatsApp, all nine agents plus the background
CRM agent, the message router, the live inbox with human handover, the leads
screens, analytics, campaigns, billing, and the hardening pass.

What is *proven* is narrower, and worth being straight about:

- Everything above passed 658 automated checks covering the router, every agent,
  handover, the lead-ownership rules, every analytics figure, every bulk-sending
  safety rule, every plan limit, and a standing audit that every API route checks
  who is asking and no screen shows a raw code.
- Those checks use a **stub model**, a **stub WhatsApp connection** and a
  **hand-built payment webhook**. So the plumbing and the guard rails are
  verified; the quality of a real reply, the behaviour of a real WhatsApp
  number, and a real payment are not.

Four things are needed to finish that off, and none of them is code:

1. A **`GEMINI_API_KEY`** — the worker host needs it too, not just the web app.
2. A **connected WhatsApp number**, on either tier.
3. **Razorpay keys and two Razorpay plans**, created in the Razorpay dashboard
   at ₹999 (Small Business) and ₹1,499 (Enterprise). Both plans are paid, so
   both need one. Leave them out and the app runs perfectly well with payments
   off — nothing is limited, and the billing screen says so.
4. An **email service**, so "forgot password" can exist at all.

See [docs/Memory.md](docs/Memory.md) for exactly where things stand, including
what's known to be missing.

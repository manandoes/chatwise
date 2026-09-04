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
3. They connect their WhatsApp number, either by scanning a QR code (free) or by
   entering official WhatsApp Business API details (paid).
4. From then on, the agent answers their customers automatically, and everything
   shows up in their dashboard.

## Two ways to connect WhatsApp

|  | **Free** | **Paid** |
|---|---|---|
| How it connects | Scan a QR code, like WhatsApp Web | Official WhatsApp Business API from Meta |
| Best for | Small businesses, lower message volume | Growing businesses that need reliability |
| Bulk messages | Up to **25 recipients** per send, spaced out | Large lists, using Meta-approved templates |
| Risk | Unofficial channel — careless sending can get a number banned | Officially sanctioned |

## One bot, one connection, per account

This is a firm product rule, not a setting: **an account runs exactly one agent
on exactly one connection type.** A business that wants a second agent needs a
second account. The database enforces this, not just the screens.

The one exception is the **CRM agent**, which runs quietly in the background
alongside whichever agent was chosen, keeping contact records up to date.

## What's in this repo

| Folder | What's inside |
|---|---|
| `app/` | Every page and API endpoint |
| `bots/` | The agents' instructions — one folder per agent, named after the agent |
| `whatsapp-connectors/` | The two ways of talking to WhatsApp |
| `message-router/` | The single front door for incoming messages |
| `campaigns/` | Bulk outreach, and the safety limits around it |
| `components/` | Reusable interface pieces |
| `lib/` | Shared helpers, including the database connection |
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

## Running it locally

You need **Node.js 20.19 or newer** and a **PostgreSQL** database. We use
[Supabase](https://supabase.com) for the hosted database.

```bash
# 1. Install dependencies
npm install

# 2. Create your local settings file
cp .env.example .env

# 3. Fill in two things in .env:
#      DATABASE_URL   your database connection string
#      AUTH_SECRET    generate one with:  openssl rand -base64 32
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

**No PostgreSQL installed?** Prisma can run one for you locally:

```bash
npx prisma dev --name chatwise --detach   # start it
npx prisma dev ls                         # print its connection URL
```

Paste that URL into `DATABASE_URL` in your `.env`, then carry on from step 4.
Note that it picks a new port each time it is created.

### Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Run the app locally with live reload |
| `npm run build` | Build the production version |
| `npm start` | Run the built production version |
| `npm run lint` | Check the code for mistakes |
| `npm run db:migrate` | Apply database changes locally |
| `npm run db:studio` | Open a visual browser for the database |

Run `npx prisma generate` after any change to `prisma/schema.prisma`.

## Secrets

Nothing secret is ever written into the code. Every key, token and connection
string is read from an environment variable, and each one is listed and explained
in [`.env.example`](.env.example). Your real `.env` file is never committed.

## Current status

Phases 0–4 are done and tested: the public website, accounts and login, the
setup wizard, and the dashboard with its **My bot** page.

**Phase 5 — connecting a real WhatsApp number by QR code — is built but not yet
proven end to end.** It needs two things this machine didn't have: a Redis, and
a phone to scan with. See [docs/Memory.md](docs/Memory.md) for exactly how to
finish it.

To run the WhatsApp side you need a Redis and a second process:

```bash
npm run dev              # the app
npm run whatsapp-worker  # the WhatsApp sessions (needs REDIS_URL + CHROME_PATH)
```

One thing to know: **the pricing page has no Business API price on it yet** — it
says so on the page — because that number hasn't been decided.

See [docs/Memory.md](docs/Memory.md) for exactly where things stand, including
what's known to be missing.

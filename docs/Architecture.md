# Architecture.md — App Flow & Technical Architecture

## 1. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js** (App Router) — full-stack: pages + API routes in one project | One codebase, one deploy, fewer moving parts for a small team |
| Language | TypeScript | Catches bugs before they ship; self-documenting |
| Database | **PostgreSQL** | Relational data (users, agents, leads, conversations) fits relational structure well |
| ORM | Prisma 7 (with the `@prisma/adapter-pg` driver adapter over `pg`) | Readable schema file that doubles as documentation of the data model. Prisma 7 talks to Postgres through a JavaScript driver adapter rather than a bundled binary engine, so the adapter + `pg` driver are required alongside it. |
| Auth | NextAuth.js v5 / Auth.js — email/password + Google OAuth, sessions in a signed cookie | Handles sessions, OAuth, and security best-practices out of the box. Passwords are hashed with Node's built-in `scrypt` (see `lib/password.ts`) rather than an extra dependency. |
| Styling | Tailwind CSS + shadcn/ui components | Fast to build, easy to theme (see Design.md), consistent components |
| Background jobs / queues | BullMQ + Redis | Needed for: message follow-ups, scheduled sends, reconnect checks, WhatsApp-web.js session workers |
| Free-tier WhatsApp connection | **whatsapp-web.js**, one isolated Node.js worker process per connected user | Keeps one user's session crash/ban risk from affecting anyone else (see §5) |
| Paid-tier WhatsApp connection | Official **WhatsApp Business Cloud API** (Meta) via webhooks | Official, reliable, per-message billed channel for larger businesses |
| File/image storage | S3-compatible object storage (e.g. Cloudflare R2 or AWS S3) | Knowledge base uploads, catalog images |
| Payments | Stripe (or regional equivalent — see PRD open questions) | Subscription billing, invoices, usage metering |
| Hosting | Vercel (Next.js app) + a separate small VM/container host for the whatsapp-web.js workers | Next.js app is stateless/serverless-friendly; whatsapp-web.js workers are NOT serverless-friendly (need persistent Chromium sessions), so they run on a normal always-on server |

## 2. High-Level App Flow

```
[Landing Page] --Login/Try it--> [Sign up or Log in]
        |
        v
[Onboarding Wizard]
  Step A: Pick agent(s)
  Step B: API (paid) or QR (free)?
  Step C: Business/product questions (varies per agent picked)
  Step D: How the bot should act (tone, escalation rules)
        |
        v
[Main Dashboard]
  |-- Overview
  |-- Agents (per-agent config)
  |-- Conversations / Inbox
  |-- Leads / CRM
  |-- Connect WhatsApp (API form OR QR scanner)
  |-- Knowledge Base
  |-- Analytics
  |-- Billing
  |-- Settings
```

### Message flow at runtime (once connected)

```
WhatsApp message arrives
   |
   v
[Business API webhook]  OR  [whatsapp-web.js worker event]
   |
   v
[Message Router]  -- routes to the account's ONE chosen bot (single-bot per account;
                    router is a single entry point, built to allow multi-bot later)
   |
   v
[Agent Engine]  -- loads that agent's config + knowledge base + conversation history
   |
   v
[AI response generated]  -- calls the LLM provider with agent-specific system prompt
   |
   v
[CRM Agent runs in parallel] -- updates lead/contact record regardless of which agent replied
   |
   v
Response sent back to WhatsApp + logged in Conversations/Inbox + Analytics updated
```

## 3. Folder & File Structure

Designed so a non-technical person can open the file tree and understand what's inside just from folder names — **bot logic lives in a folder named after the bot**, not "agent1" or "module-b".

```
[saas-name]/
│
├── app/                                # Next.js App Router — all pages & API routes
│   ├── (marketing)/                    # Public-facing pages, no login required
│   │   ├── page.tsx                    #   Landing / homepage
│   │   ├── pricing/page.tsx
│   │   ├── faq/page.tsx
│   │   └── features/page.tsx
│   │
│   ├── (auth)/                         # Sign up / login pages
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   │
│   ├── error.tsx                       # Plain-English screen when something breaks (Rules.md §4)
│   ├── not-found.tsx                   # Plain-English screen for an address that doesn't exist
│   │
│   ├── onboarding/                     # The slide-by-slide setup wizard
│   │   ├── choose-bots/page.tsx        #   Step A
│   │   ├── connection-type/page.tsx    #   Step B
│   │   ├── business-details/page.tsx   #   Step C
│   │   └── bot-behavior/page.tsx       #   Step D
│   │
│   ├── dashboard/                      # Everything behind login
│   │   ├── page.tsx                    #   Overview
│   │   ├── my-bot/page.tsx             #   The account's ONE agent: view and edit its config.
│   │   │                               #   Named for what the customer calls it (docs/PRD.md §6);
│   │   │                               #   deliberately singular — there is no "agents" list.
│   │   ├── conversations/page.tsx      #   Live inbox
│   │   ├── leads/page.tsx              #   CRM table
│   │   ├── connect-whatsapp/page.tsx   #   API form or QR scanner
│   │   ├── knowledge-base/page.tsx
│   │   ├── campaigns/page.tsx           #   Bulk outreach: lists, templates, scheduling
│   │   ├── analytics/page.tsx
│   │   ├── billing/page.tsx
│   │   └── settings/page.tsx
│   │
│   └── api/                            # Backend API routes
│       ├── auth/                       #   NextAuth handlers + the sign-up endpoint
│       ├── health/                     #   Liveness check: is the app up and can it reach the DB?
│       ├── onboarding/                 #   Saves each setup step: bot, connection, business, behavior
│       │                               #   Enforces one agent + one connection per account
│       ├── whatsapp/
│       │   ├── business-api/           #   Webhook + send endpoints for paid tier
│       │   └── qr-session/             #   start / status / stop / send-test for the free tier
│       ├── billing/                    #   Stripe webhooks & checkout
│       ├── agents/                     #   Read/update the account's ONE agent (PATCH only —
│       │                               #   it cannot create one, let alone a second)
│       │   └── re-setup/               #     Reopens the wizard to change agent or connection
│       └── campaigns/                  #   Create/send bulk campaigns; enforces tier caps
│
├── bots/                               # ⭐ All AI agent "brains" — one folder per bot, plain-English names
│   ├── receptionist-bot/
│   │   ├── prompt.ts                   #   The agent's system prompt / instructions
│   │   ├── config-schema.ts            #   What onboarding questions this bot needs
│   │   └── handler.ts                  #   Logic for how it responds
│   ├── lead-qualifier-bot/
│   ├── appointment-bot/
│   ├── sales-bot/
│   ├── support-bot/
│   ├── follow-up-bot/
│   ├── personal-shopper-bot/
│   ├── feedback-bot/
│   ├── internal-bot/
│   ├── crm-bot/                        #   Runs alongside every conversation
│   └── shared/                         #   Code shared by multiple bots
│       ├── config-types.ts             #     The shape a bot uses to describe itself + its setup questions
│       └── bot-catalog.ts              #     The list of selectable agents — the single source of truth
│                                       #     read by the setup picker, the API and the dashboard
│
├── whatsapp-connectors/                # Everything about talking to WhatsApp itself
│   ├── business-api/                   #   Official Meta Cloud API integration
│   │   ├── send-message.ts
│   │   └── webhook-handler.ts
│   └── web-qr/                         #   whatsapp-web.js integration (free tier)
│       ├── worker.ts                   #   The isolated per-user session process
│       ├── session-manager.ts          #   Starts/stops/tracks each user's worker
│       ├── session-store.ts            #   Saves that session, encrypted, in the database
│       ├── session-commands.ts         #   What the web app asks the workers to do
│       ├── protocol.ts                 #   The message shapes all three processes share
│       └── qr-generator.ts
│
├── message-router/                     # Single entry point for inbound messages.
│   └── router.ts                       #   MVP: always routes to the account's one chosen
│                                       #   bot (one-bot-per-account). Structured to allow
│                                       #   multi-bot routing in a future version.
│
├── campaigns/                          # Bulk messaging / outreach engine
│   ├── send-campaign.ts                #   Core send logic; enforces tier caps (25 max on free)
│   ├── throttle.ts                     #   Spaces out free-tier sends to reduce ban risk
│   ├── templates/                      #   Predefined starter message templates (PRD §7.3)
│   │   └── starter-templates.ts
│   └── opt-out.ts                      #   Handles STOP/unsubscribe + consent checks
│
├── components/                         # Reusable UI pieces (buttons, cards, forms, etc.)
│   ├── ui/                             #   shadcn/ui base components
│   ├── auth/                           #   Log-in and sign-up forms
│   ├── dashboard/                      #   Sidebar, top bar, page header, connection badge,
│   │                                   #   the My bot editor and the change-setup panel
│   ├── onboarding/                     #   Wizard slide components
│   └── marketing/                      #   Landing page sections
│
├── lib/                                # Shared utilities & core logic
│   ├── db.ts                           #   Prisma client
│   ├── utils.ts                        #   shadcn/ui class-name helper (`cn`)
│   ├── auth.ts                         #   Auth config + `requireUser()` / `getApiUser()` guards
│   ├── encryption.ts                   #   AES-256-GCM for anything secret at rest
│   ├── redis.ts                        #   Redis connections + "is it actually reachable?"
│   ├── whatsapp-connection.ts          #   Finds the signed-in customer's connection, safely
│   ├── onboarding.ts                   #   Server-side: where an account is up to in setup
│   ├── onboarding-steps.ts             #   The setup steps as plain data — safe for the browser
│   ├── password.ts                     #   Password hashing & checking (Node's built-in scrypt)
│   ├── api-response.ts                 #   The one error shape every API route returns
│   ├── ai-client.ts                    #   Wrapper around the LLM API calls
│   ├── stripe.ts
│   ├── generated/prisma/               #   Generated Prisma Client — git-ignored, rebuilt by
│   │                                   #   `prisma generate`. Never edit by hand.
│   └── validation/                     #   Form/schema validation
│
├── proxy.ts                            # Runs before every matched page: sends signed-out
│                                       #   visitors away from the dashboard, and signed-in
│                                       #   ones away from the login screen. (Called
│                                       #   `middleware.ts` before Next.js 16.)
│
├── prisma/
│   ├── schema.prisma                   #   Database structure — the source of truth for data model
│   └── migrations/
│
├── jobs/                               # Background/queued tasks (BullMQ)
│   ├── follow-up-scheduler.ts
│   ├── campaign-sender.ts              #   Runs scheduled/throttled bulk sends
│   ├── reconnect-checker.ts
│   └── usage-billing-sync.ts
│
├── public/                             # Static assets (logo, images, icons)
│
├── docs/                                # These planning documents live here
│   ├── PRD.md
│   ├── Architecture.md
│   ├── Rules.md
│   ├── Phases.md
│   ├── Design.md
│   └── Memory.md
│
├── .env.example                        # Documented list of required environment variables
├── prisma7.config.ts                   # Prisma 7 config — points at the schema and reads DATABASE_URL
├── components.json                     # shadcn/ui settings (which style, where components go)
├── next.config.ts
├── package.json
└── README.md                           # Plain-English project overview for anyone new
```

Every folder above carries a short `README.md` explaining, in plain English, what
belongs in it — so the file tree stays readable to a non-developer.

## 4. Data Model (Core Entities — high level)

- **User** — account owner (email, auth info, subscription status)
- **Business** — the business profile collected in onboarding Step C (name, industry, hours, tone preferences from Step D)
- **AgentInstance** — *(built in Phase 3)* the **single** bot chosen for a Business (references exactly one of the fixed bot types in `/bots`, stores its config answers). Enforce **one AgentInstance per Business** at the DB level (unique constraint on `businessId`), not just in the UI. The always-on CRM agent is handled as a background capability, not as a second AgentInstance row (see PRD.md §3.1).
- **WhatsAppConnection** — *(built in Phase 3)* **exactly one per Business**: type is `api` **or** `qr` (never both), credentials/session reference, status. Enforce one-per-Business + single-type at the DB level (unique constraint on `businessId`).
- **Conversation** — a WhatsApp chat thread with a contact
- **Message** — individual message in a conversation, tagged with which agent (if any) generated the reply
- **Lead** — CRM record: contact info, score, status, tags
- **Subscription** — plan, billing status, usage counters
- **Campaign** — a bulk send: template used, target contact list, tier, status, schedule, delivery/read/reply counts
- **MessageTemplate** — a reusable outreach template (starter or user-created); on the paid tier also tracks Meta approval status
- **ContactList / Segment** — a saved group of contacts a campaign targets (free-tier sends capped at 25 recipients per send, per PRD.md §7.1)
- **OptOut** — record of contacts who replied STOP / unsubscribed, checked before any campaign send

Full field-level schema belongs in `prisma/schema.prisma`, not duplicated here — this doc stays high-level so it doesn't go stale every time a column is added.

### How the one-setup-per-account rule is actually enforced

Three separate layers, so no single mistake can break it:

1. **The database.** `agent_instances.businessId` and `whatsapp_connections.businessId`
   each carry a UNIQUE index. A second row is rejected by PostgreSQL with a
   `23505` unique violation, whatever the application does.
2. **The `BotType` enum** has no `CRM` value, so the always-on CRM agent cannot
   be stored as an account's chosen bot even by a direct SQL insert.
3. **The API routes** write with `upsert` keyed on `businessId` — changing your
   mind mid-setup replaces the single row — and refuse outright once
   `onboardingCompletedAt` is set, because switching afterwards is a deliberate
   re-setup rather than a wizard step.

The screens are the fourth layer, and the least important one: the pickers are
radio inputs, so the interface cannot express a second choice.

## 5. Why Isolated Per-User Processes for the Free (QR) Tier

Each free-tier customer's whatsapp-web.js session:
- Runs as its own worker process (not a shared process handling all users' sessions)
- Has its own browser session storage, so one user's disconnect, ban, or crash cannot affect another user
- Is started/stopped on demand by `session-manager.ts` and tracked in the `WhatsAppConnection` table
- Communicates back to the main app via the job queue (Redis/BullMQ), not direct in-process calls

This costs more server resources per free user than a shared process would, but it's the safer and more scalable choice long-term, and it keeps a problem with one customer's WhatsApp session from ever touching another customer's data or connection.

### How it actually runs (built in Phase 5)

Three processes, which may be on three different machines:

```
  Next.js app                 session-manager.ts              worker.ts (one per customer)
  (Vercel)                    (always-on host)                (child process of the manager)
      |                              |                                   |
      |── command queue (Redis) ────▶|── fork() ────────────────────────▶ |
      |                              |                                   |── drives Chromium
      |◀─ live state (Redis) ────────|◀── process messages ──────────────│    via whatsapp-web.js
```

- The app never launches a browser and never touches a session; it can't, being
  serverless. It puts a command on the queue and reads back the state the
  manager publishes.
- The **QR code** lives only in Redis with a short expiry — it is valid for well
  under a minute and replaced repeatedly while somebody scans.
- The **saved session** is encrypted (AES-256-GCM) and kept in the database, so a
  worker machine can be replaced without anyone rescanning.
- The worker files run under **plain Node**, which executes TypeScript directly —
  no build step and no extra runner to install. That is why files under
  `web-qr/` import with relative paths and `.ts` extensions rather than the
  `@/...` shortcut the app uses.
- **Having a `REDIS_URL` is not the same as Redis being reachable.** The app
  checks reachability before claiming the service is available, so an outage
  shows an honest message instead of a hanging page (docs/Rules.md §4).

## 6. Environment & Deployment Notes

- Next.js app deploys to Vercel (or similar) — stateless, scales automatically.
- whatsapp-web.js workers need a persistent, always-on host (e.g. a small VM or container service like Railway/Fly.io/a dedicated EC2 box) since each holds an open browser session — these do **not** belong on serverless infrastructure.
- Redis is required for both the job queue and for tracking live QR worker status.
- All secrets (WhatsApp API tokens, Stripe keys, DB URL, Redis URL, AI provider key) go in environment variables, documented in `.env.example`, never committed.

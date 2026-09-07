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
| QR-tier WhatsApp connection | **whatsapp-web.js**, one isolated Node.js worker process per connected user | Keeps one user's session crash/ban risk from affecting anyone else (see §5) |
| API-tier WhatsApp connection | Official **WhatsApp Business Cloud API** (Meta) via webhooks | Official, reliable, per-message billed channel for larger businesses |
| File/image storage | S3-compatible object storage (e.g. Cloudflare R2 or AWS S3) | Knowledge base uploads, catalog images |
| Payments | **Razorpay** — chosen by the product owner on 2026-09-05, settling PRD.md §10. Called over plain HTTPS from `lib/razorpay.ts`; no SDK | Subscription billing in rupees, hosted payment pages so no card details reach this codebase, and invoices we read rather than copy (see §5f) |
| Hosting | Vercel (Next.js app) + a separate small VM/container host for the whatsapp-web.js workers | Next.js app is stateless/serverless-friendly; whatsapp-web.js workers are NOT serverless-friendly (need persistent Chromium sessions), so they run on a normal always-on server |

## 2. High-Level App Flow

```
[Landing Page] --Login/Try it--> [Sign up or Log in]
        |
        v
[Onboarding Wizard]
  Step A: Pick agent(s)
  Step B: API or QR? (both paid)
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

### Where that actually runs (built in Phase 7)

The two tiers reach the same `message-router/router.ts` from different processes,
because they have to:

| | API tier (Business API) | QR tier (QR) |
|---|---|---|
| Message arrives at | the webhook route in the Next.js app | the customer's own worker process |
| The router runs in | the web app, inside `after()` | the always-on session manager |
| The reply goes out via | an HTTPS call to Meta | the worker holding that browser session |

The API tier answers Meta with a `200` **before** the agent starts thinking:
Meta gives a webhook only a few seconds before it assumes we are down and starts
re-sending, and a model takes longer than that. Next.js's `after()` runs the work
once the response has gone.

The QR tier cannot run the router in the web app at all — the app is
serverless and has no way to reach a browser session running on another machine.
So the manager, which already owns those child processes, calls the router
itself. Consequently **the worker host needs the AI key too**, not just the web
app.

One thing the QR tier deliberately does *not* do: the customer's message text
travels from the worker to its own parent over the private process channel, and
is stripped before anything is relayed to the shared Redis event queue. Their
conversation belongs in their owner's inbox, not in infrastructure every part of
the system can read (docs/Rules.md §4).

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
│       │   ├── business-api/           #   credentials + send-test, and
│       │   │   └── webhook/[token]/     #     one PUBLIC webhook address per customer
│       │   └── qr-session/             #   start / status / stop / send-test for the QR tier
│       ├── billing/                    #   subscription/ (start, change, cancel) and
│       │                               #     webhook/ — PUBLIC, where Razorpay reports a
│       │                               #     payment. The only path to a paid plan
│       ├── agents/                     #   Read/update the account's ONE agent (PATCH only —
│       │                               #   it cannot create one, let alone a second)
│       │   └── re-setup/               #     Reopens the wizard to change agent or connection
│       ├── conversations/              #   The inbox: the live thread list, taking a
│       │   └── [id]/messages/          #     conversation over, and replying by hand
│       ├── leads/                      #   Saving a lead somebody corrected by hand
│       ├── knowledge-base/             #   The FAQs the account's agent answers from
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
│       ├── handler-types.ts            #     What an agent is given, and what it may answer
│       ├── prompt-shared.ts            #     The rules every agent follows, written once
│       ├── run-agent.ts                #     Ask the model; cope when it cannot answer
│       ├── handlers.ts                 #     Which agent handles which bot type
│       └── bot-catalog.ts              #     The list of selectable agents — the single source of truth
│                                       #     read by the setup picker, the API and the dashboard
│
├── whatsapp-connectors/                # Everything about talking to WhatsApp itself
│   ├── index.ts                        #   One way to send, whichever tier — everything above
│   │                                   #   this line asks for a connector instead of branching
│   ├── capabilities.ts                 #   What each tier may do (bulk caps, throttling,
│   │                                   #   templates) as data. Safe to import in the browser
│   ├── business-api/                   #   Official Meta Cloud API integration
│   │   ├── graph-api.ts                #     Calling Meta, and turning its errors into plain English
│   │   ├── credentials.ts              #     Encrypted storage + verifying them against Meta
│   │   ├── send-message.ts
│   │   └── webhook-handler.ts          #     Signature checking + routing a message to an account
│   └── web-qr/                         #   whatsapp-web.js integration (QR tier)
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
│   ├── send-campaign.ts                #   Builds a campaign and sends one message at a
│   │                                   #   time. Every safety rule is here: the 25 cap,
│   │                                   #   the warning, opt-outs checked twice, approved
│   │                                   #   templates, and the plan's own limits
│   ├── throttle.ts                     #   Spaces out QR-tier sends to reduce ban risk
│   ├── templates/
│   │   ├── starter-templates.ts        #   Ready-made wording to start from (PRD §7.3)
│   │   └── saved-templates.ts          #   The messages a business keeps to reuse
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
│   ├── knowledge-base.ts               #   The FAQs an agent may answer from
│   ├── conversations.ts                #   The inbox: reading a thread, taking it
│   │                                   #   over, and typing a reply yourself
│   ├── leads.ts                        #   The CRM record, and who may change what —
│   │                                   #   a field a person edited stays theirs.
│   │                                   #   Both halves live here: the agent's writes
│   │                                   #   and the leads screen's
│   ├── analytics.ts                    #   The numbers on Overview and Analytics,
│   │                                   #   counted from real Conversation/Message/Lead rows
│   ├── format-when.ts                  #   "Yesterday", "2:14 pm", "4 minutes" — times
│   │                                   #   and durations as people say them
│   ├── plans.ts                        #   The two paid plans as data — prices, limits and what
│   │                                   #   each includes. THE file to edit when a plan
│   │                                   #   changes. Safe for the browser; holds no secrets
│   ├── razorpay.ts                     #   The only file that talks to the payment provider
│   ├── subscription.ts                 #   Which plan an account is on, and how that changes
│   ├── usage.ts                        #   What has been used this period, counted from real
│   │                                   #   rows, and whether any more is allowed
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
├── jobs/                               # Background work, run by the always-on host
│   ├── campaign-sender.ts              #   Ticks every 15s and sends whatever is due
│   ├── follow-up-scheduler.ts          #   (not built yet)
│   └── reconnect-checker.ts            #   (not built yet)
│                                       #   There is deliberately no usage-billing-sync:
│                                       #   usage is counted from the rows on demand, so
│                                       #   there is nothing to sync (see §5f)
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
- **Message** — individual message in a conversation, tagged with which agent (if any) generated the reply. From Phase 9 it may also have been typed by a person at the business, in the inbox.
- **Conversation (Phase 9 additions)** — records *who* stopped the agent replying (the agent handing over, or a person taking the thread over) and how many of the contact's messages have arrived since anyone looked.
- **KnowledgeEntry** — *(built in Phase 7)* one question-and-answer pair a Business's agent may answer from. The Phase 7 knowledge base is exactly this list plus the setup answers; uploads and catalogues come later.
- **Lead** — *(built in Phase 8, screens in Phase 10)* CRM record: contact info, score, status, tags, and a sentence on what the person wants. One per conversation, written by the background CRM agent. It also records **which fields a person edited by hand**, because those are the ones the agent must leave alone from then on (docs/Rules.md §5).
- **Campaign** — *(built in Phase 12)* a bulk send: the words, the tier it was written for, its status and schedule, and the Meta template it names on the API tier.
- **CampaignRecipient** — *(built in Phase 12)* one row per person per campaign: their own copy of the message with the placeholders already filled in, the earliest it may go out (the throttle, written down), and what became of it. UNIQUE on `(campaignId, contactPhone)`, so nobody can be messaged twice by one campaign whatever the code does.
- **MessageTemplate** — *(built in Phase 12)* a message a business keeps to reuse. On the QR tier that is a convenience; on the API tier it also records the name and approval status of the template registered at Meta.
- **~~ContactList / Segment~~** — **deliberately not built.** See §5e: `CampaignRecipient` *is* the list, and recipients only ever come from conversations the business already has.
- **OptOut** — *(built in Phase 12)* somebody who asked not to be messaged again. Keyed on the phone number rather than the conversation, so it survives a thread being deleted, and checked before every send on every tier (docs/Rules.md §8).
- **Subscription** — *(built in Phase 13)* one row per business: which plan, what state the payment is in, Razorpay's customer and subscription ids, the paid period, and whether a cancellation or downgrade is waiting for that period to end. No usage counters — see §5f.
- **BillingEvent** — *(built in Phase 13)* the id of every payment event already dealt with. Razorpay's own id is the primary key, so a re-sent event fails to insert and is dropped — the same trick that stops a re-sent WhatsApp message becoming a second reply.

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

Each QR-tier customer's whatsapp-web.js session:
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

## 5a. How the paid (Business API) tier works (built in Phase 6)

No browser and no worker process — just HTTPS calls to Meta, so all of it runs
inside the web app.

```
  a customer's customer          Meta                     ChatWise (Vercel)
        |                          |                             |
        |── sends a message ──────▶|── signed webhook ──────────▶ | /api/whatsapp/business-api
        |                          |                             |    verify signature
        |                          |                             |    find the account by phone_number_id
        |◀── reply ────────────────|◀── Graph API send ───────────|
```

**Every customer brings their own Meta app** (product owner's decision,
2026-09-04). Nothing about Meta is configured platform-wide: no shared app
secret, no shared verify token. Each customer enters their own phone number ID,
access token and app secret, and all three are stored encrypted against their
own connection.

That decision has a direct architectural consequence:

- **Each customer gets their own webhook address**, with a random segment in
  the path:
  `/api/whatsapp/business-api/webhook/<their-own-token>`.
  This is not decoration. Because the signing secret belongs to the customer's
  app rather than to ChatWise, we must know *whose* webhook a request is before
  we can verify it — and Meta's initial verification call carries only a token
  and a challenge, no phone number at all. The path is the only thing that
  could identify the account there.
- **The verify token is generated by ChatWise**, shown once on the Connect
  screen, and pasted into Meta by the customer. One less thing for a
  non-technical person to invent, and guaranteed strong.

Two further things about this endpoint deserve care:

- **It is the only route in ChatWise the public internet can reach without
  logging in.** It cannot require a login, because Meta calls it. Instead it
  verifies every payload against an HMAC signature computed with *that
  customer's* app secret, over the *raw* request bytes. Anything unsigned or
  wrongly signed is refused before a single field is read — and a secret
  belonging to a different customer does not work.
- **`phone_number_id` stays unique across accounts.** The signature already
  proves which customer a payload came from, but the number inside it must
  match that account, and no two accounts may claim the same number.

Access tokens and app secrets are encrypted at rest with the same key as the QR
sessions, and decrypted only at the moment they are needed. Neither is ever
returned to the browser, not even masked; the dashboard is told only *whether*
credentials exist.

**The free (QR) tier needs none of this.** That route never contacts Meta, so a
QR-tier customer has no Meta app, no app secret and no webhook.

## 5b. How the live inbox works (built in Phase 9)

The Conversations screen shows a conversation that is happening somewhere else
entirely — on a customer's phone — so it has to find out about new messages
without anybody pressing reload.

It does that by **asking, on a timer**: the list re-asks every 10 seconds, an
open thread every 5, and both stop while the tab is in the background. No new
service, no socket server, no extra dependency (docs/Rules.md §1). The app is
serverless and has nowhere to hold a socket open, and a realtime service is not
a decision to make inside one feature — if the delay ever becomes a real
complaint, that is the point to propose one properly.

**Taking over is one field, checked in one place.** `Conversation.escalatedAt`
means "the agent is not replying here", whether the agent handed over itself or
a person pressed Take over — and typing a reply in the inbox counts as taking
over, because somebody who has just answered a customer does not want the agent
answering the next message on top of them (docs/Rules.md §5). The router checks
that one field before it replies, so there is never a second condition to
forget. `escalatedBy` records which of the two it was; it changes what the
screen says, and nothing about what the agent does.

**A reply that did not send is not written down.** The router records failed
sends, because by then there is nobody to tell. The inbox does the opposite: the
person is sitting in front of the screen, so they get the reason, their words
stay in the box, and the thread never shows the customer a message they never
received.

## 5c. Whose write wins on a lead (built in Phase 8 and 10)

A lead is the one record in ChatWise that two different authors keep writing to:
the background CRM agent, on every message, and a person in the dashboard,
whenever they notice it is wrong. docs/Rules.md §5 settles the conflict — a
person's edit is not to be overwritten — and both halves of that rule live in
`lib/leads.ts`, deliberately in one file, because a rule about who wins split
across two modules is a rule that drifts.

```
  CRM agent ──▶ applyAgentUpdate ──┐
                                   ├──▶ Lead row
  the leads screen ──▶ applyHumanEdit ──┘
```

- `applyHumanEdit` records, in `fieldsEditedByHuman`, **only the fields whose
  value actually changed**. Somebody who fixes a status has taken the status,
  not the whole record — the agent carries on keeping the summary current,
  which is what it is for.
- `applyAgentUpdate` skips every field named there. It is not asked to; the
  field never reaches the update.
- `letTheAgentUpdateThis` is the owner's per-lead waiver. It does not erase the
  list, so turning it back off restores exactly the protection they had.
- `notes` is the one column with a single author. The agent cannot write it —
  not by policy, but because the field is not in the shape its answer is parsed
  into.

## 5d. Where the numbers come from (built in Phase 11)

Analytics counts rows. There is no separate metrics store, no counter table and
no nightly rollup — `lib/analytics.ts` queries Conversation, Message and Lead
directly, and both screens that show figures call the same function.

That is a deliberate choice for this size of product, and it has a limit worth
writing down: **it will stop being the right answer at some volume.** The
queries are aggregates over one business's rows, and the answer-time
calculation pulls the most recent 5,000 messages in the window into memory to
pair each question with its reply. For a small business that is nothing. When
one account has millions of messages, this becomes a rollup job — which is a
change to make when the numbers say so, not before.

Three rules the figures follow, all of them visible on the screen:

- **A period governs activity, not the pipeline.** Messages, answer times and
  leads captured are counted inside the chosen window. Lead statuses are not: a
  lead first seen six weeks ago can convert today, and windowing that would
  quietly hide the slow ones.
- **Answer time is a median.** One reply written the next morning makes an
  average meaningless. The screen also shows how many replies the figure came
  from, so nobody reads confidence into two data points.
- **A number that cannot honestly be worked out is null, not zero.** No leads
  means no conversion rate — the tile shows "—" and says why, rather than "0%",
  which reads as a finding.

## 5e. How a bulk send actually runs (built in Phase 12)

Bulk outreach is the one feature where a bug costs a customer their WhatsApp
number, so the shape of it is deliberate rather than convenient.

**Writing a campaign** (`campaigns/send-campaign.ts` → `buildCampaign`) is where
every rule is applied, in one place, on the server:

1. The words must be complete — no `{discount}` left unfilled, nothing longer
   than WhatsApp accepts.
2. The account must have a connection, and only **one** campaign may be waiting
   or sending at a time. Two overlapping campaigns would send at twice the rate
   the throttle exists to hold.
3. The QR tier's 25-recipient cap and its ban-risk warning are required, from
   `whatsapp-connectors/capabilities.ts` (docs/Rules.md §8).
4. The plan's own limits are applied too — how many campaigns this month, and
   whether there are enough messages left to send to everybody chosen (§5f).
5. Everyone who has opted out is removed, and an opt-out line is appended if the
   message does not already have one.
6. On the API tier the named template must be one Meta has approved.
7. Each person's copy is written out in full, with `{name}` already filled in,
   and given the exact time it may go out.

**Sending** is a separate process. `jobs/campaign-sender.ts` runs on the same
always-on host as the QR session manager, ticks every 15 seconds, and asks for
whatever is now due. Each message is claimed atomically —
`updateMany({ where: { id, status: "PENDING" }, data: { status: "SENDING" } })`
— so two ticks, or two hosts, can never both send the same one.

Two decisions worth knowing, both departures from the original sketch:

- **PostgreSQL is the schedule, not BullMQ.** A queue holding "this person still
  needs messaging" would be a second copy of a fact the database already owns,
  and the two disagreeing means somebody gets messaged twice. `sendAfter` on the
  recipient row is the only schedule there is.
- **A send interrupted mid-flight is FAILED, never retried.** If a row has been
  claimed for more than ten minutes with nothing to show for it, we do not know
  whether the message went out. "Possibly sent twice" is worse than "definitely
  not sent" when the cost is a banned number.

## 5f. How billing works (built in Phase 13)

**Razorpay owns the truth about money; ChatWise owns the truth about
entitlement.** Razorpay says whether a payment went through. `lib/plans.ts` says
what that entitles the account to, and `lib/usage.ts` enforces it.

- **`lib/plans.ts` is the only file to edit when a plan changes.** Two plans,
  both paid, **one per connection tier and nothing else** — Small Business
  (₹999, QR) and Enterprise (₹1,499, Business API) — with every limit as plain
  data, plus `NO_SUBSCRIPTION_PLAN` for an account that has not paid or has
  finished cancelling. It holds no secrets and is safe to read in the browser, so
  the pricing page, the billing screen and the server checks all read the same
  numbers. The *prices* are display only: what is actually charged is the plan
  set up in Razorpay, named by the `RAZORPAY_PLAN_ID_*` environment variables —
  and on Enterprise the price is not even the customer's whole bill, because Meta
  charges them per conversation on top of it.

- **The plan and the connection tier are the same choice.** `PlanId` and
  `ConnectionType` are separate enums because they are stored on different rows,
  but they hold the same decision: Small Business is the QR tier, Enterprise is
  the API tier. `planForConnectionType` in `lib/plans.ts` is the lookup between
  them, and `checkApiConnectionAllowed` in `lib/usage.ts` is what stops an
  account on one plan wiring up the other tier's connection.
- **`lib/razorpay.ts` is the only file that talks to Razorpay.** Plain HTTPS with
  basic authentication, the same way `business-api/graph-api.ts` calls Meta — no
  SDK, because the API is form-simple and every dependency is something the
  non-technical owner has to trust (docs/Rules.md §1). Replacing the provider
  means replacing this one file.
- **Money never touches ChatWise.** Paying happens on Razorpay's own hosted
  page; the customer is sent there and comes back. No card details reach this
  codebase at any point.
- **Only the webhook grants anything.** Opening a payment page grants nothing.
  An account becomes entitled to a paid plan when — and only when — a signed
  `subscription.*` event arrives at `/api/billing/webhook` saying so. The
  endpoint is public, so it verifies an HMAC-SHA256 signature over the raw body
  before believing a word of it, exactly as the Meta webhook does.
- **There are no usage counters.** Usage is counted from the real rows every
  time it is asked for: messages sent are the outbound messages in this
  account's conversations since the period began. A number worked out that way
  cannot drift from what actually happened, which is why `jobs/usage-billing-sync.ts`
  from the original sketch was never built — there is nothing to sync.

What a limit does when it is reached:

| Limit | What happens |
| --- | --- |
| Messages this period | The agent stops replying by itself and hands the thread to a person. The customer still gets one sentence, filed as ChatWise's rather than the agent's. **Replying by hand in the inbox is never limited** — a plan caps the automation, not the owner. |
| Campaigns this period | A new campaign is refused before it is written, rather than after. |
| Messages vs campaign size | A campaign that would not fit in what is left is refused, saying how many are left. |
| Saved templates | A new one is refused; editing the ones already saved always works. |
| Knowledge answers | Saving the list is refused, saying how many the plan includes. |
| Official WhatsApp Business API | Saving API credentials is refused on any plan but Enterprise. |
| History window | Analytics offers only the periods the plan allows, and quietly gives the longest allowed rather than arguing about the address bar. |

And one rule that overrides all of them: **when `RAZORPAY_KEY_ID` and
`RAZORPAY_KEY_SECRET` are not set, nothing is limited at all.** Holding an
account to a plan's limits when there is no way to pay for a bigger one would be
a bug wearing a business rule's clothes. The billing screen says so plainly
rather than showing buttons that would fail.

A failed payment does not switch the product off either. Razorpay retries a card
for days; the account keeps its plan through `PAST_DUE` and only drops back to
Free when the subscription is actually cancelled.

## 5g. What was hardened before launch (built in Phase 14)

Four things were added, and one bug was found by looking rather than by anything
breaking.

**Rate limiting** (`lib/rate-limit.ts`). Until Phase 14 nothing stopped somebody
making ten thousand sign-up attempts, guessing passwords all night, or hammering
the endpoint that asks Meta to verify credentials. Counters live in Redis —
which is already required for the WhatsApp workers — because the web app is
serverless and a counter in one machine's memory is invisible to the next. It
**fails open on purpose**: if Redis is unreachable, requests are allowed and the
failure is logged, because turning a Redis blip into "nobody can log in" is a
worse outcome than a window with no limiting in it. This is a brake on abuse,
never the thing protecting anything — every route still checks ownership.

**Security headers** (`next.config.ts`). `frame-ancestors 'none'` is the one
that matters most: without it, anybody could put the dashboard in an invisible
iframe on their own page and trick a signed-in owner into clicking "Disconnect"
or "Send campaign". `Referrer-Policy` stops an address containing a conversation
or lead id being handed to whatever site is linked to next. The
Content-Security-Policy still allows inline scripts and styles, which Next's
hydration and Tailwind both need; tightening that means issuing a nonce from
`proxy.ts`, which is a real change rather than a header tweak and is noted as
outstanding rather than half-done.

**A last-resort error screen** (`app/global-error.tsx`). `app/error.tsx` catches
a page that fails; this catches the root layout failing, which previously fell
through to the framework's own stack trace on a white page — exactly what
docs/Rules.md §4 forbids. It has no imports at all and inline styles, because a
screen that only appears when things are already broken should have nothing left
in it to break.

**A loading state** (`app/dashboard/loading.tsx`). Dashboard screens ask the
database several questions before they can render; without this, clicking a link
left the previous page sitting there, which reads as a click that did not
register.

**And the bug:** `bg-surface-raised` was used in nine files and defined in none.
Tailwind v4 builds its classes from the `@theme` block, so a colour that is not
in there produces no CSS and fails completely silently — those hover states
simply never happened, and nothing anywhere said so. All nine now use
`surface-elevated`, which is the token that exists, and the Phase 14 checks
compare every colour used against the theme so it cannot come back.

## 6. Environment & Deployment Notes

- Next.js app deploys to Vercel (or similar) — stateless, scales automatically.
- whatsapp-web.js workers need a persistent, always-on host (e.g. a small VM or container service like Railway/Fly.io/a dedicated EC2 box) since each holds an open browser session — these do **not** belong on serverless infrastructure.
- Redis is required for both the job queue and for tracking live QR worker status.
- All secrets (WhatsApp API tokens, the Razorpay key secret and webhook secret, DB URL, Redis URL, AI provider key) go in environment variables, documented in `.env.example`, never committed.
- Razorpay needs one webhook pointed at `https://<your-domain>/api/billing/webhook`, subscribed to the `subscription.*` events. Without `RAZORPAY_WEBHOOK_SECRET` every event is refused, which means nobody can ever become entitled to a paid plan — so it is not optional once payments are live.
- The app runs perfectly well with no Razorpay keys at all: payments are simply off, nothing is limited, and the billing screen says so.

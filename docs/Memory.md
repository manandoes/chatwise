# Memory.md — Living Progress Log

> **How to use this file:** This is not filled in up front — it starts empty/near-empty and gets updated by whoever (or whichever AI) is coding, at the end of every work session. Its whole purpose is so that a new chat/tool/session can read this one file and know exactly where things stand, without re-reading the entire codebase or guessing. Keep entries short and factual. Newest updates at the top of each section.

---

## Current Status

- **Current phase:** Phase 5 — WhatsApp Connection (free/QR tier) — **built and tested as far as this machine allows; needs Redis + a real phone to finish**
- **Last updated:** 2026-09-04
- **Last updated by:** Claude Opus 5 (Claude Code)
- **Next up:** finish verifying Phase 5 (see Known Issues), then Phase 6 — the WhatsApp Business API tier
- **Database:** Supabase (hosted PostgreSQL), confirmed by the product owner on 2026-09-03.

## What's Done (working, tested)

- [x] **Phase 0: Next.js app scaffolded** — Next.js 16.3.4 (App Router, TypeScript, Turbopack), React 19.2, Tailwind CSS v4.
- [x] **Phase 0: Design system applied** — full docs/Design.md palette, type scale, glow shadows and dark-only theme encoded as CSS variables in `app/globals.css`, mapped onto shadcn/ui's token names. Fonts: Geist (sans) + JetBrains Mono (mono).
- [x] **Phase 0: shadcn/ui initialised** — `components.json`, Radix primitives, Lucide icons. No components pulled in yet; they get added as phases need them.
- [x] **Phase 0: Prisma + PostgreSQL wired up** — base schema with `User` and `Business`, first migration (`prisma/migrations/20260903190354_init`) created and applied.
- [x] **Phase 0: Folder structure matches docs/Architecture.md §3** — every folder created, each with a plain-English `README.md` describing what belongs in it and which phase builds it.
- [x] **Phase 0: `.env.example` written** — every environment variable the project will need, grouped by the phase that first needs it, with instructions for generating secrets.
- [x] **Phase 0: `README.md` written** — plain-English overview aimed at a non-technical reader.
- [x] **Phase 0: Verified running** — `npm run build` and `npm run lint` both pass clean; `npm start` serves the placeholder homepage; `GET /api/health` returns `{"status":"ok","database":"connected"}` against a real Postgres.
- [x] **Phase 1: Sign-up with email and password** — `POST /api/auth/sign-up`, validated on both sides, passwords hashed with scrypt, duplicate emails rejected by the unique index as well as by an explicit check.
- [x] **Phase 1: Log in / log out** — NextAuth v5 with a Credentials provider; sessions in a signed cookie. Logging in from the sign-up form happens automatically so nobody types their password twice.
- [x] **Phase 1: Google sign-in** — wired and ready, but only appears once `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set. **Not yet tested against a real Google project** (see Known Issues).
- [x] **Phase 1: Protected routes** — `proxy.ts` guards `/dashboard/*` and `/onboarding/*`, remembers where the visitor was heading, and bounces signed-in people off `/login` and `/signup`. `requireUser()` is a second, independent check inside each page.
- [x] **Phase 1: Dashboard placeholder + Settings shell** — `/dashboard` greets the user; `/dashboard/settings` shows name, email, sign-in method and join date, read by the session's own user id.
- [x] **Phase 1: Supabase connection wiring** — pooled `DATABASE_URL` for the app, direct `DIRECT_URL` for migrations, optional `SHADOW_DATABASE_URL`. All documented in `.env.example`.
- [x] **Phase 2: Marketing site built** — homepage, `/features`, `/pricing` and `/faq`, sharing a header (with a working small-screen menu), footer and skip-to-content link. All four are statically prerendered.
- [x] **Phase 2: Hero product visual** — the WhatsApp thread in the hero is drawn in markup rather than being a screenshot, so it stays sharp at any size and reads to screen readers. It deliberately shows the agent *failing* to know a price and handing over to a human, which is the escalation behaviour docs/Rules.md §5 requires.
- [x] **Phase 2: Content traced to the PRD** — the nine choosable agents and the always-on CRM agent (§5), the two connection types (§3 Step B, §7.1), the dashboard features (§6), and the 25-recipient cap and opt-out handling (§7.1, §7.2).
- [x] **Phase 2: Verified visually and functionally** — screenshotted every page at 1440px, and at true 390px/768px viewports; build and lint clean; all 11 internal links resolve, and both marketing entry points reach `/signup`.
- [x] **Phase 3: Setup wizard built** — all four steps (agent → connection → business → behaviour), each saving as you go, with a progress bar whose finished steps are clickable. Closing the tab halfway loses nothing; returning drops you at the first unfinished step.
- [x] **Phase 3: Per-agent setup questions** — every selectable agent has a `config-schema.ts` in its own folder listing the questions it needs (docs/Architecture.md §3). Step C reads them, so a Sales agent asks about pricing and an Appointment agent asks about the calendar, without the wizard knowing anything about either.
- [x] **Phase 3: One shared agent catalogue** — `bots/shared/bot-catalog.ts` is now the single source of truth, read by the picker, the API and the dashboard. This closes the duplication flagged in Phase 2.
- [x] **Phase 3: One-setup rule enforced at three layers** — UNIQUE indexes on `agent_instances.businessId` and `whatsapp_connections.businessId`; a `BotType` enum with no `CRM` value; and API routes that upsert the single row and refuse once setup is complete. Documented in docs/Architecture.md §4.
- [x] **Phase 3: Step gating** — steps unlock in order, unfinished accounts are pushed out of the dashboard into setup, and finished accounts are pushed out of setup into the dashboard.
- [x] **Phase 3: Escalation path is required** — Step D will not submit without one, because an agent with no way out leaves a customer stuck with no route to a person (docs/Rules.md §5).
- [x] **Phase 3: Plain-English error and 404 screens** — `app/error.tsx` and `app/not-found.tsx`, replacing the framework's raw error screen (docs/Rules.md §4).
- [x] **Phase 3: Verified end-to-end** — 31 automated checks through the running app, plus 8 checks straight against PostgreSQL confirming it rejects a forced second agent and second connection with `23505`, that `CRM` isn't a valid `BotType`, and that unknown answer keys are dropped rather than stored. All four steps screenshotted at desktop, tablet and true mobile widths.
- [x] **Phase 4: Dashboard shell built** — fixed 240px sidebar and 64px top bar (docs/Design.md §4), with grouped navigation, the current page marked, and a live WhatsApp connection badge pinned to the bottom of the sidebar. Below 1024px the sidebar becomes a slide-in panel opened from the top bar, so there is only one copy of the navigation to keep in step.
- [x] **Phase 4: Every dashboard destination is a real screen** — the seven not-yet-built ones say plainly what will be there and which phase brings it, rather than showing an empty page that looks broken.
- [x] **Phase 4: My bot page** — shows the account's single agent, and makes its business answers, tone, language and escalation rules editable. The questions it shows come from the chosen agent's own `config-schema.ts`, so the screen never has to know which agent it is displaying.
- [x] **Phase 4: Changing agent or connection** — a confirmation that spells out exactly what happens, then `POST /api/agents/re-setup` reopens the wizard with every current answer pre-filled. It replaces the single slot and never adds a second (docs/Rules.md §6).
- [x] **Phase 4: No "add another" anywhere** — verified by a test that greps every dashboard screen for add-a-bot wording.
- [x] **Phase 4: Verified end-to-end** — 38 automated checks: all ten screens load, the sidebar renders everywhere, My bot reflects the onboarding answers and only that agent's questions, edits save and persist, validation still demands an escalation path, `POST /api/agents` is rejected (405 — the route cannot create an agent), the re-setup round trip works and the edits survive it, and every route refuses a signed-out caller. Screenshotted at 1440px and true 390px/768px.
- [x] **Phase 5: The QR connector is built** — `worker.ts` (one isolated process per customer), `session-manager.ts` (the always-on supervisor), `session-store.ts` (encrypted session storage), `session-commands.ts` (what the app asks for), `protocol.ts` (the shapes all three processes share) and `qr-generator.ts`.
- [x] **Phase 5: Per-customer process isolation proven** — two workers were started at once and each produced its own distinct, real QR code from WhatsApp's servers, in separate OS processes. This is the docs/Architecture.md §5 requirement, demonstrated rather than assumed.
- [x] **Phase 5: Sessions are encrypted at rest** — AES-256-GCM in `lib/encryption.ts`. Verified against the real database that a known marker in the session does **not** appear in the stored bytes, that the same session encrypts differently each time, that it round-trips byte-for-byte, and that a tampered row throws instead of being used (docs/Rules.md §3).
- [x] **Phase 5: Connect WhatsApp page** — QR display with scanning instructions, live status in plain words, disconnect, and a "send a test message" box for proving the connection works.
- [x] **Phase 5: Honest degradation when the service is down** — the app checks whether Redis actually *answers* rather than whether a URL is configured. With Redis unreachable it returns a clean 503 and the page says so, instead of hanging.
- [x] **Phase 5: Verified as far as possible here** — 24 route checks (auth on every endpoint, ownership, API-tier accounts refused from QR routes, graceful 503s, no secrets leaked into HTML), 12 encrypted-store checks, and 7 worker/QR checks. Build and lint clean.
- [x] **Phase 1: Verified end-to-end** — 25 automated checks against a running production build all pass: sign up, validation errors, duplicate email, wrong password, successful login, session contents, both protected pages, signed-in redirect off `/login`, three open-redirect attempts blocked, log out, and log back in. Confirmed directly in the database that passwords are stored as salted scrypt hashes and that the same password produces different stored values.

## What's In Progress

**Phase 5 is code-complete but not fully verified.** Everything that can be
tested without Redis and without a phone has been, and passes. Two things remain
and both need the product owner:

1. **Provide a Redis** and set `REDIS_URL` — then the app-to-worker path can be
   exercised end to end.
2. **Scan a QR code with a real phone**, which is the only way to prove the
   "done when" from docs/Phases.md.

Nothing is half-written; the gap is infrastructure and a physical device, not
code.

## Known Issues / Bugs

- **Deployment to hosting is NOT done.** This is the one Phase 0 item outstanding.
  The build is verified locally and there is nothing app-side blocking a deploy,
  but pushing to Vercel needs the product owner's own Vercel account, a Git
  remote, and a hosted Postgres URL — none of which should be created on their
  behalf. **Action for the product owner:** connect the repo to Vercel, set
  `DATABASE_URL` (and later the other `.env.example` variables) in the Vercel
  project settings, and deploy. `/api/health` is there to confirm the deployed
  app reached its database.
- **4 `high` npm audit findings**, all inside the Prisma **CLI's** own
  dependencies (`deepmerge-ts`, `mysql2`). The CLI is a devDependency, is not
  shipped to production, and we use PostgreSQL, not MySQL. `npm audit fix --force`
  would downgrade Prisma to v6 — not worth it. Re-check on the next Prisma release.
- **npm's `latest` tag for `prisma` currently points at `8.0.0-rc.12`**, a release
  candidate. Both `prisma` and `@prisma/client` are therefore **pinned exactly to
  `7.10.0`** in package.json. Do not run `npm i prisma@latest` — it installs the
  RC, which fails to resolve on npm 11.5.2 (`Cannot read properties of null
  (reading 'edgesOut')`) and drags in vulnerable transitive packages.
- **Google sign-in is written but never exercised against a real Google project.**
  Everything else in Phase 1 was tested end to end; this one path cannot be until
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` exist. **Action for the product
  owner:** create an OAuth client in the Google Cloud console, add
  `http://localhost:3000/api/auth/callback/google` (and the production
  equivalent) as an authorised redirect URI, put both values in `.env`, and try
  the button. Until then it correctly stays hidden.
- **No rate limiting on sign-up or login yet.** Nothing stops someone hammering
  `/api/auth/sign-up` or guessing passwords in bulk. Password checks are
  deliberately slow (scrypt), which blunts guessing, but that is not a
  substitute. Proper throttling needs Redis, which arrives in Phase 5 — do this
  then, and before any real launch (Phase 14 hardening).
- **No "forgot password" flow, and no email sending at all.** The
  `VerificationToken` table exists and `emailVerified` is on `User`, but nothing
  writes to them. Anyone who forgets their password currently has no way back in.
  Needs an email provider to be chosen — **flagging this as a new open question**
  (see the table below).
- **The pricing page has no actual prices.** The Business API plan shows "Being
  finalised" where an amount belongs, and the page carries a notice saying so.
  This is deliberate — docs/PRD.md §10 leaves pricing open and docs/Rules.md §9
  forbids inventing it — but the page is **not shippable to real customers until
  a number goes in**. Everything else on it (what each plan includes) is real.
- **The `Business` row is created when someone first opens setup**, not at
  sign-up, and starts nameless — which is why `Business.name` is nullable. If a
  user signs up and never opens setup, they have a `User` and no `Business`.
- **After starting a re-setup, going straight to `/dashboard` lands on Step D,
  not Step A.** "Where are you up to?" means "the first unfinished step", and
  after a re-setup nothing is unfinished except the completion flag. The
  *Change setup* button itself sends you to Step A correctly, and every step is
  clickable in the progress bar, so this is a mild oddity rather than a trap.
  Worth revisiting if customers find it confusing.
- **Phase 5 is NOT signed off: no Redis and no phone on this machine.** The
  connector is written and every testable piece passes, but two things could not
  be verified here:
  **(a)** the app-to-worker queue path, because there is no Redis (no
  `redis-server`, and the Docker daemon isn't running);
  **(b)** an actual QR scan and a real message, which needs a phone.
  **Action for the product owner:** provide a Redis (Upstash and Railway both
  have free tiers, or `docker run -p 6379:6379 redis` locally), put it in
  `REDIS_URL`, run `npm run whatsapp-worker` alongside `npm run dev`, then open
  Connect WhatsApp and scan.
- **Where the workers will live is still undecided.** They cannot run on Vercel
  — each holds an open Chromium (docs/Architecture.md §6). Needs a small
  always-on host (Railway, Fly.io, a VM) with Chrome or Chromium installed and
  `CHROME_PATH` set.
- **Puppeteer's browser downloader brings 5 `high` audit findings** (`extract-zip`
  path traversal). That code path only runs when Puppeteer *downloads* a
  browser, which we never do — the workers point at an already-installed Chrome
  via `CHROME_PATH`. Re-check when whatsapp-web.js updates its Puppeteer.
- **Inbound messages are counted, not stored.** The worker reports *that* a
  message arrived, never its contents. That is deliberate for now
  (docs/Rules.md §4) — the message router is Phase 7 and the inbox is Phase 9,
  so there is nowhere legitimate for message text to go yet.
- **No reconnect job yet.** `jobs/reconnect-checker.ts` from
  docs/Architecture.md §3 is not written. A worker that dies is reported as
  disconnected, but nothing automatically brings it back — the customer presses
  Connect again. Worth building before launch.
- **No rate limit on "send a test message".** It needs a connected session and a
  login, and it is capped at 500 characters, but nothing stops repeated use.
  Fold into the same rate-limiting work as sign-up and login.
- **The local Prisma dev database drops connections under concurrent load.**
  Loading three pages at once during testing produced
  `P1017 / ConnectionClosed`; retrying worked and `/api/health` stayed green.
  This looks like the throwaway `prisma dev` server rather than the app, but it
  is worth re-checking against real Supabase, where the pooled `DATABASE_URL`
  exists precisely to handle this.

## Assumptions Made

Per docs/Rules.md §10 — all of these need the product owner's confirmation.

1. **Product name is "ChatWise"** — the docs use a `[SaaS_NAME]` placeholder; the
   repo folder is `chatwise`, so that name is used in the UI, README and page
   titles. A find-and-replace fixes it if the real name differs.
2. **Planning docs moved from the repo root into `docs/`** — that is where
   docs/Architecture.md §3 says they live, and the build prompt refers to them as
   `docs/*.md`. No content was changed by the move.
3. **Prisma 7 (not 6)** — Prisma 7 requires a driver adapter (`@prisma/adapter-pg`
   + `pg`) instead of a bundled query engine, and puts the generated client in a
   project folder rather than `node_modules`. docs/Architecture.md §1 and §3 were
   updated to record this.
4. **Generated Prisma client lives at `lib/generated/prisma/`** (git-ignored).
   Prisma 7 requires an explicit output path; its own default was `app/generated/`,
   which would sit inside the Next.js routing folder. Recorded in
   docs/Architecture.md §3.
5. **`app/api/health/` added** — not in the original Architecture.md tree. It is
   how "the app deploys and the DB connects" gets proven, and it doubles as an
   uptime check later. Added to docs/Architecture.md §3.
6. **The app is dark-only** — docs/Design.md describes a dark theme with no light
   variant, so the dark palette is the default `:root` and there is no theme
   toggle. Say the word if a light mode is wanted.
7. **Geist chosen over Inter** for headings and body — docs/Design.md §3 allows
   either; Geist ships with the Next.js font pipeline. JetBrains Mono is used for
   monospace exactly as specified.
8. **Empty folders hold a `README.md` rather than stub `.ts` files.** Git cannot
   track a truly empty folder, and stub TypeScript files for unbuilt phases would
   be dead code that contradicts docs/Rules.md §9 ("don't skip ahead"). Each
   README says what belongs there and which phase builds it. The named `.ts`
   files from Architecture.md §3 get created in their own phase.
9. **`ANTHROPIC_API_KEY` listed in `.env.example`** as the AI provider variable.
   docs/Architecture.md says "LLM provider" without naming one. Change it in
   Phase 7 if a different provider is preferred.
10. **NextAuth v5 (`5.0.0-beta.32`), not the stable v4.** docs/Architecture.md
    says "NextAuth.js (Auth.js)" — "Auth.js" is v5's name. v4 is in maintenance
    and its App Router support needs workarounds; v5 is what the Next.js
    ecosystem has standardised on. It is nonetheless **a beta dependency in an
    app that will take payments** — worth a conscious yes/no from the product
    owner. Switching to v4 later is a contained change to `lib/auth.ts`,
    `proxy.ts` and the two form components.
11. **Passwords hashed with Node's built-in `scrypt`, not bcrypt or argon2.**
    docs/Rules.md §1 says not to add a package when a few lines of plain code
    will do. scrypt is a vetted password KDF that ships inside Node, so this adds
    no dependency. See `lib/password.ts` — random salt per password, timing-safe
    comparison, and a matching delay when the email doesn't exist so that
    response times don't reveal which addresses are registered.
12. **Form validation is hand-written, not Zod.** Same reasoning — Zod is not in
    docs/Architecture.md's stack, and the rules are simple enough not to warrant
    a dependency yet. `lib/validation/auth.ts` runs in both the browser and the
    server. If Phase 3's onboarding forms get much more complex, adding Zod is
    worth proposing then (it would need an Architecture.md update first).
13. **Sessions live in a signed cookie, not the `Session` database table.** This
    is not a preference: NextAuth requires cookie sessions whenever
    email-and-password sign-in is used. The `Session` table still exists because
    the Prisma adapter expects it.
14. **A wrong password and an unregistered email give the identical message.**
    Saying "no account with that email" would let anyone test which email
    addresses are registered here.
16. **Marketing copy was written from docs/PRD.md, not invented.** Every claim
    on the four public pages traces to the PRD. Two things were stated carefully
    on purpose: the free tier's ban risk is described the way docs/PRD.md §7.1
    and §7.2 describe it rather than softened, and nothing asserts what Meta does
    or doesn't permit as fact (docs/Rules.md §8). **The copy still needs a read
    through by the product owner** — it is a sales page, and tone is their call.
17. **"Can I change my agent or connection later?" is answered only partially**
    in the FAQ. It says the change *replaces* your setup rather than adding to it
    (which docs/Rules.md §6 settles) and deliberately does not say whether that
    is self-serve, assisted, or needs a new account — docs/PRD.md §10 hasn't
    decided. Revisit that answer once you do.
18. **The agent list is duplicated in marketing copy for now.** The nine agents
    are written out in `components/marketing/agent-catalog.tsx`. Phase 3's picker
    and Phase 8's bot folders will need the same list, and at that point it
    should move to one shared catalogue that both read from. Building that now
    would have meant scaffolding Phase 3/8 early (docs/Rules.md §9).
19. **`Business.name` was made nullable.** The row has to exist before Step C
    asks for a name, because Steps A and B hang off it. Setup completion is
    tracked by `Business.onboardingCompletedAt` rather than by whether fields
    are filled in.
20. **Per-agent answers are stored as JSON** on `AgentInstance.config`, keyed by
    question id, rather than as columns. The questions differ per agent and will
    change as agents are built, and columns would mean a migration each time.
    Answers are filtered against the agent's own schema before saving, so only
    known question ids are ever stored. Note docs/Rules.md §7 bans JSON *editors*
    in the customer-facing UI — the customer only ever sees labelled boxes.
21. **The wizard's Step C asks three universal questions** (business name, line
    of work, what you do) on top of the agent-specific ones. docs/PRD.md §3
    describes Step C as business/product questions without fixing the list.
22. **Tone and language are fixed lists**, not free text: four tones and four
    language options (including "whatever the customer writes in"). Free text
    here would be a prompt-injection surface once the bots are wired up in
    Phase 7.
23. **`app/error.tsx` and `app/not-found.tsx` were added during Phase 3**, which
    is strictly Phase 14 territory. Justification: a real dropped-database error
    surfaced Next.js's raw "This page couldn't load" screen mid-testing, which
    docs/Rules.md §4 forbids outright. These are minimal; Phase 14 still owns the
    full error-state pass.
24. **The route is `dashboard/my-bot/`, not `dashboard/agents/`.**
    docs/Architecture.md §3 originally said `agents/`, but docs/PRD.md §6 and
    docs/Phases.md both call the screen "My Bot", and a plural `agents/` reads as
    a list — which is exactly the impression the one-agent rule needs to avoid.
    docs/Architecture.md §3 was updated to match.
25. **Changing agent or connection = reopening the wizard on the same account,**
    with every current answer pre-filled. Nothing is deleted at that moment; the
    old answers are only cleared if the customer actually picks a *different*
    agent, because a different agent asks different questions. This is the
    "full re-onboarding on the same account" option from docs/PRD.md §10, which
    docs/Rules.md §6 already leans toward — **still worth an explicit yes from
    the product owner**, since the alternatives were an admin-assisted reset or
    requiring a new account.
26. **The dashboard is closed while a re-setup is unfinished.** Nothing in it is
    meaningful until setup is complete, and the confirmation says so before the
    customer commits.
27. **Placeholder screens name the phase that will build them** (e.g. "This
    screen arrives in Phase 12"). Honest for the product owner testing now, but
    **these strings are internal build language and should be softened or
    removed before real customers see them** — flagging for Phase 14.
28. **The worker processes run TypeScript directly under plain Node**
    (`node --conditions=react-server`), rather than adding a TypeScript runner
    such as `tsx`. Node 24 executes `.ts` natively, so this honours
    docs/Rules.md §1 (no dependency where the platform will do). The costs:
    files under `whatsapp-connectors/web-qr/` must import with **relative paths
    and `.ts` extensions**, `lib/db.ts` had to do the same for its generated
    client, and `tsconfig.json` gained `allowImportingTsExtensions`. The
    `--conditions=react-server` flag makes the `server-only` marker package
    resolve to its no-op build outside a bundler.
29. **The saved session is stored in the database, not on the worker's disk.**
    docs/Rules.md §3 says session data must be encrypted at rest *in the
    database*, so whatsapp-web.js's `RemoteAuth` is used with a custom encrypted
    store rather than the simpler `LocalAuth` (which writes readable files to
    disk). It also means a worker machine can be replaced without customers
    rescanning.
30. **The QR code is kept in Redis, not the database.** It changes several times
    a minute and is worthless after about a minute, so it is stored with a
    90-second expiry and never persisted.
31. **A "send a test message" box was added to the Connect screen.** Not in
    docs/PRD.md, but docs/Phases.md's Phase 5 "done when" requires proving a
    message can be sent, and a customer needs some way to check their setup
    works. It is capped at 500 characters and needs a connected session.
32. **Message counters (`messagesReceived`/`messagesSent`) were added to
    `WhatsAppConnection`.** They give the connection-health indicator something
    real to show and prove the pipe works, without storing message content.
15. **Google and password sign-ins are not auto-linked.** If someone signs up
    with a password and later clicks "Continue with Google" using the same
    address, they are told to use their password instead, rather than the two
    being silently merged — silent linking is how account-takeover happens when a
    provider's email verification can't be trusted.

### Still open — please answer before the phase that needs them


These are docs/PRD.md §10's open questions. None blocked Phase 0.

| Question | Needed by |
|---|---|
| Final pricing tiers and per-plan limits | Phase 2 (pricing page), Phase 13 |
| Payment gateway — Stripe, or a regional provider like Razorpay given the ₹ pricing examples? | Phase 13 |
| Meta WhatsApp Business API onboarding steps, for the "Connect WhatsApp" screen copy | Phase 6 |
| **Switching bot/connection type** — full re-onboarding on the same account (wiping the old config), an admin-assisted reset, or a new account? docs/Rules.md §6 leans toward "re-setup of the single slot", which is the working assumption. | Phase 4 |
| Is the background CRM agent always included, or bundled only with certain plans? | Phase 8 |
| **New:** which email service should send password resets and verification emails (Resend, Postmark, SendGrid, Amazon SES…)? Nothing can email anyone until this is picked. | Whenever "forgot password" is wanted — no later than Phase 14 |
| **New:** is NextAuth v5 **beta** acceptable, or should this drop back to the stable v4? See assumption 10. | Confirm before Phase 14 |

## Decisions Log

- **Prisma pinned to exactly `7.10.0`** (both `prisma` and `@prisma/client`),
  because npm's `latest` tag currently serves an 8.0.0 release candidate. See
  Known Issues. Revisit when Prisma 8 goes stable.
- **`shadcn` moved from `dependencies` to `devDependencies`** — it is a
  code-generation CLI, not something the running app needs.
- **`server-only` guard on `lib/db.ts`** — makes it a build error, not a runtime
  surprise, if the database client is ever imported into browser code
  (docs/Rules.md §3).
- **`postinstall` runs `prisma generate`** so the generated client exists after a
  fresh `npm install` and on the hosting provider's build machine, without anyone
  having to remember an extra step.
- **docs/Architecture.md updated in the same session** for every structural
  change above, per docs/Rules.md §2 (docs and code must not drift).
- **Supabase confirmed as the database** (product owner, 2026-09-03). No stack
  change — Supabase is hosted PostgreSQL, so Prisma is unaffected. What it does
  change is connection wiring: the app uses the **pooled** URL (port 6543) and
  migrations use the **direct** URL (port 5432), because a transaction pooler
  cannot run schema changes. Prisma 7 has no `directUrl` setting, so the split is
  `lib/db.ts` (pooled, from `DATABASE_URL`) versus `prisma7.config.ts` (direct,
  from `DIRECT_URL`).
- **`SHADOW_DATABASE_URL` added** as an optional variable. `prisma migrate dev`
  rehearses each migration on a scratch database it normally creates itself,
  which needs create-database permission — Supabase often doesn't grant it. This
  gives an escape hatch. It was needed locally too: Prisma's built-in dev server
  puts tables into Postgres's `template1`, so every freshly created database
  inherits them and the rehearsal fails with `relation "users" already exists`.
- **The shadcn `Button` and `Input` defaults were edited**, not wrapped: heights
  raised to 40px, radius to ~10px, and the primary button given the green glow
  and `--primary-hover`. shadcn components are meant to be owned and edited, and
  changing them once keeps every later phase consistent with docs/Design.md
  without each screen passing overrides.
- **One narrow type cast in `lib/auth.ts`.** `@auth/prisma-adapter`'s types
  expect the Prisma Client at `node_modules/@prisma/client`; Prisma 7 generates
  it into our project instead, so the declarations don't line up even though it
  is the same client. The cast is narrowed to exactly the adapter's parameter
  type rather than `any`, and the adapter only calls ordinary model methods.
- **The sign-up form logs the person in automatically** after creating their
  account, rather than sending them to the login screen to retype what they just
  typed.
- **The hero headline is a single colour, not half green.** The first version
  set the second half in `--primary`; a block of bright green display text
  fights docs/Design.md §2's rule that the green is a signature accent used
  sparingly. Green now appears above the fold only on the CTA, the online dot and
  inside the conversation.
- **The hero visual is drawn in markup, not a screenshot.** docs/Design.md §7
  asks for product imagery in a dark frame with a green glow. A real screenshot
  would go stale the moment the dashboard changes and would be invisible to
  screen readers; the built version stays sharp, stays current, and reads aloud.
- **FAQ answers use the browser's own `<details>` element** rather than a
  JavaScript accordion — every answer stays readable and findable with the
  browser's Find even if scripts never run.
- **The FAQ groups are two-column on wide screens**, heading beside its
  questions. At full width a single column left half the page empty.
- **No new dependency was added for any of this.** The marketing pages use the
  existing Tailwind theme, shadcn components and Lucide icons.
- **Setup saves step by step rather than all at the end.** It means someone can
  close the tab and come back, and it means each step's answers are validated
  against the rules that actually apply to them. The cost is that a `Business`
  row exists before it has a name.
- **`lib/onboarding.ts` was split into two files.** The progress bar runs in the
  browser, and importing the step list from a module that also imported
  `lib/db.ts` pulled the database client into the client bundle — caught at build
  time by the `server-only` guard added in Phase 1. `lib/onboarding-steps.ts` now
  holds the pure data; `lib/onboarding.ts` keeps everything that touches the
  database.
- **The agent pickers are radio inputs, not styled `<div>`s.** Arrow keys move
  between options and screen readers announce "3 of 9" for free — and, more to
  the point, a radio group is structurally incapable of expressing two choices
  (docs/Rules.md §6).
- **Each bot's setup questions live in its own folder** (`config-schema.ts`),
  not in the wizard. Adding an agent means adding a folder and one line in
  `bots/shared/bot-catalog.ts`; the wizard needs no change. This follows
  docs/Rules.md §2 — bot-specific knowledge stays under `/bots`.
- **`prompt.ts` and `handler.ts` were deliberately NOT created** for any bot.
  Phase 3 needs only the setup questions; the agents' actual instructions and
  behaviour are Phases 7 and 8 (docs/Rules.md §9 — don't skip ahead).
- **The navigation lives in one place** (`components/dashboard/nav-items.ts`) as
  plain data with no database import, so the sidebar can use it in the browser.
  Same split as `lib/onboarding-steps.ts` — and the same reason.
- **`/api/agents` has no POST.** It can read and update the account's one agent
  and nothing else; creating one only ever happens through setup. A POST returns
  405, which is a nice free proof that the route cannot mint a second agent.
- **The connection badge always pairs a colour with words** ("Not connected
  yet", "Reconnecting…"), never a bare coloured dot — docs/Design.md §8 requires
  colour never to be the only signal.
- **Placeholder screens say what's coming rather than sitting empty**, so a
  half-built dashboard reads as unfinished rather than broken (docs/Rules.md §4).
- **"Configured" and "reachable" are treated as different questions.** The first
  version assumed a set `REDIS_URL` meant the service was up. Testing found the
  worst possible failure: with a URL set and nothing listening, ioredis retried
  forever, the page hung, and the log filled with connection errors. Now the app
  connects lazily, gives up after a few attempts, refuses to queue commands
  while disconnected, and *pings* Redis before claiming the service is
  available. This is exactly the stale-status trap docs/Rules.md §4 warns about.
- **Two different Redis connections, on purpose.** The web app's is impatient
  (fails fast, so a page never hangs); the session manager's is patient and
  uncapped, because BullMQ workers block on Redis waiting for jobs. Using one
  set of options for both would break one of them.
- **The worker reports events but holds no opinions.** It does not write to the
  database except through the session store, and it doesn't know the web app
  exists. All the interpreting happens in the session manager, so the rules for
  what a status means live in one place.
- **Screenshot testing uses the Chrome already installed on this machine**
  (headless `--screenshot`), so no browser-automation package was added. Note
  Chrome on Windows will not size a window below **500px**, so a `--window-size`
  narrower than that silently renders at 500px and crops — which looks exactly
  like a mobile overflow bug but isn't. True narrow viewports were checked by
  loading the app in a fixed-width iframe served from a scratch server; see the
  session notes below.

## Key File/Folder Pointers

| If you need to change… | Go to |
|---|---|
| Colours, fonts, spacing, the green glow | `app/globals.css` (values come from docs/Design.md) |
| The database structure | `prisma/schema.prisma`, then `npm run db:migrate` |
| How the app connects to the database | `lib/db.ts` |
| Which environment variables exist | `.env.example` |
| What a folder is for | the `README.md` inside it |
| Whether the app can reach its database | `GET /api/health` |
| How signing in works, or who is signed in | `lib/auth.ts` (`auth()`, `requireUser()`) |
| Which pages need a login | `proxy.ts` |
| Password hashing | `lib/password.ts` |
| Form/input rules and the open-redirect guard | `lib/validation/auth.ts` |
| The shape every API error takes | `lib/api-response.ts` |
| The log-in and sign-up screens | `app/(auth)/` and `components/auth/` |
| Public website copy and layout | `app/(marketing)/` and `components/marketing/` |
| The header/footer on public pages | `components/marketing/site-header.tsx`, `site-footer.tsx` |
| Plan contents and the pricing placeholder | `components/marketing/pricing-plans.tsx` |
| FAQ questions and answers | `components/marketing/faq-list.tsx` (`FAQ_GROUPS`) |
| The agent list shown to visitors | `components/marketing/agent-catalog.tsx` |
| Which agents exist, and their setup questions | `bots/<agent>-bot/config-schema.ts` + `bots/shared/bot-catalog.ts` |
| Adding a new agent | add its folder + one line in `bots/shared/bot-catalog.ts` + a value in the `BotType` enum |
| The setup wizard's screens | `app/onboarding/` and `components/onboarding/` |
| Where an account is up to in setup | `lib/onboarding.ts` (`getOnboardingState`) |
| Saving a setup step | `app/api/onboarding/{bot,connection,business,behavior}/route.ts` |
| The one-bot / one-connection constraints | `prisma/schema.prisma` (`@unique` on `businessId`) |
| The dashboard sidebar and its links | `components/dashboard/nav-items.ts` |
| The dashboard frame (sidebar + top bar) | `components/dashboard/shell.tsx`, `app/dashboard/layout.tsx` |
| The My bot screen | `app/dashboard/my-bot/page.tsx` + `components/dashboard/my-bot-form.tsx` |
| Editing an agent, or restarting setup | `app/api/agents/route.ts`, `app/api/agents/re-setup/route.ts` |
| A "coming soon" screen's wording | that screen's own `page.tsx` under `app/dashboard/` |
| How a WhatsApp session actually runs | `whatsapp-connectors/web-qr/session-manager.ts` |
| What one customer's session does | `whatsapp-connectors/web-qr/worker.ts` |
| How sessions are encrypted | `lib/encryption.ts` + `whatsapp-connectors/web-qr/session-store.ts` |
| Messages between app, manager and worker | `whatsapp-connectors/web-qr/protocol.ts` |
| Starting the worker service | `npm run whatsapp-worker` |
| Whether Redis is actually up | `lib/redis.ts` (`isQueueReachable`) |

## Environment / Setup Notes for a New Session

- **Node.js 24.16 / npm 11.5.2** on Windows 10 in this environment.
- **No local PostgreSQL and no running Docker daemon on this machine.** The local
  database used to verify Phase 0 is Prisma 7's built-in one:

  ```bash
  npx prisma dev --name chatwise --detach   # start it
  npx prisma dev ls                         # show its URL and port
  npx prisma dev stop chatwise              # stop it
  ```

  It picks a **random port each time it is created** — this machine got
  `postgres://postgres:postgres@localhost:51218/template1?sslmode=disable`, which
  is what the local `.env` holds. Re-run `npx prisma dev ls` and update `.env` if
  the port has changed. Any ordinary Postgres URL works just as well.
- `.env` is git-ignored; `.env.example` is the committed template. Copy one to the
  other and fill in `DATABASE_URL` to get running.
- **The database has no test data yet** — no seed script, and no test WhatsApp
  numbers, until Phase 1 and Phase 5 respectively.
- **Next.js 16 gotchas** worth knowing before writing routing code (they differ
  from older Next.js and from most training data):
  - `cookies()`, `headers()`, `params` and `searchParams` are **async** — always
    `await` them. Synchronous access was removed in v16.
  - `middleware.ts` is now **`proxy.ts`**, exporting a function named `proxy`,
    and it runs on the Node.js runtime (no edge runtime). This matters for
    Phase 1's protected routes.
  - Route handlers are **not cached by default**; opt in with
    `export const dynamic = 'force-static'` if ever needed.
  - Next.js keeps a copy of its own docs at `node_modules/next/dist/docs/` —
    read those rather than relying on memory.
- **Prisma 7 gotchas:**
  - Config lives in **`prisma7.config.ts`** (v7's preferred name; `prisma.config.ts`
    is the legacy fallback). `DATABASE_URL` is read there, not in `schema.prisma`.
  - The client is imported from `@/lib/generated/prisma/client`, **not**
    `@prisma/client`, and must be constructed with the `PrismaPg` adapter — see
    `lib/db.ts`.
  - Re-run `npx prisma generate` after every schema change (`npm run db:generate`).
  - `npx prisma init` also dropped Prisma's own skill files into `.claude/`,
    `.agents/`, `.windsurf/` and `skills-lock.json`. They are reference material
    for Prisma's CLI and client API; harmless, and safe to delete if unwanted.

---

## Session Update — 2026-09-03

- **Worked on:** Phase 0 — Project Setup.
- **Completed:** Next.js 16 + TypeScript + Tailwind v4 scaffold; docs/Design.md
  theme encoded in `app/globals.css`; shadcn/ui initialised; Prisma 7 + PostgreSQL
  connected with a `User`/`Business` base schema and an applied migration; the
  full docs/Architecture.md §3 folder tree with plain-English READMEs;
  `.env.example`; a non-technical `README.md`; a placeholder homepage; and an
  `/api/health` endpoint. Build, lint and a live database check all pass.
- **In progress / left off at:** nothing mid-flight. Phase 1 (Auth & Accounts) is
  next, once the product owner has tested Phase 0.
- **New assumptions or decisions:** see "Assumptions Made" and "Decisions Log"
  above — the notable ones are the product name **ChatWise**, **Prisma 7 pinned to
  7.10.0**, and the docs moving into `docs/`.
- **Anything broken:** no. The only incomplete Phase 0 item is **deploying to
  hosting**, which needs the product owner's Vercel account and a hosted database
  — see Known Issues.

## Session Update — 2026-09-03 (Phase 1)

- **Worked on:** Phase 1 — Auth & Accounts. Product owner confirmed **Supabase**
  as the database at the start of the session.
- **Completed:** NextAuth v5 with email/password and Google sign-in; sign-up API
  route with scrypt password hashing; hand-written shared validation; route
  protection in `proxy.ts` plus a `requireUser()` check inside each page;
  log-in, sign-up, dashboard and Settings screens styled to docs/Design.md;
  Supabase pooled/direct connection wiring; `Account`, `Session` and
  `VerificationToken` tables migrated. Build and lint clean; 25 end-to-end checks
  against a running production build all pass.
- **In progress / left off at:** nothing mid-flight. Phase 2 (marketing pages) is
  next, once the product owner has tested Phase 1.
- **New assumptions or decisions:** NextAuth **v5 beta** rather than stable v4;
  scrypt instead of bcrypt; hand-written validation instead of Zod; identical
  error message for wrong-password and unknown-email; Google and password logins
  deliberately not auto-linked. All expanded above.
- **Anything broken:** no. Three known gaps, all listed under Known Issues:
  Google sign-in is untested for want of real credentials, there is **no
  rate limiting** on sign-up or login, and there is **no password-reset flow**
  because no email provider has been chosen.

## Session Update — 2026-09-04 (Phase 2)

- **Worked on:** Phase 2 — Landing / Marketing Pages.
- **Completed:** Homepage (hero with a built WhatsApp-thread visual, four-step
  setup sequence, the agent catalogue, the two connection routes, the dashboard
  features, closing CTA), plus `/features`, `/pricing` and `/faq`, all sharing a
  header with a working small-screen menu, a footer, and a skip link. Build and
  lint clean; every page screenshotted at desktop, tablet and true mobile widths;
  all 11 internal links resolve.
- **In progress / left off at:** nothing mid-flight. Phase 3 (Onboarding Wizard)
  is next, once the product owner has tested Phase 2.
- **New assumptions or decisions:** the hero headline is one colour rather than
  half green (docs/Design.md §2); the hero visual is built in markup rather than
  being a screenshot; FAQ answers use native `<details>`. All expanded above.
- **Anything broken:** no — but **the pricing page cannot go live to customers
  until a real Business API price replaces "Being finalised"**, and the marketing
  copy needs a read-through by the product owner. Both are under Known Issues.

### How to screenshot the app on this machine

No browser-automation package is installed, and none is needed — Chrome is
already on this machine:

```bash
CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars   --virtual-time-budget=5000 --window-size=1440,1000   --screenshot=out.png http://localhost:3000/
```

**Chrome on Windows will not make a window narrower than 500px.** Asking for
`--window-size=390,...` renders at 500px and crops the image to 390 — which
looks precisely like a mobile layout bug and is not one. To check real narrow
viewports, load the app inside a fixed-width iframe on a page served over http
(file:// cannot iframe http://), and screenshot that:

```js
// scratch server on :3002 — iframe the app at the width you want to test
const page = `<body style="margin:0;display:flex;gap:20px">
  <iframe src="http://localhost:3000/" style="width:390px;height:3400px;border:0"></iframe>
</body>`;
```

## Session Update — 2026-09-04 (Phase 3)

- **Worked on:** Phase 3 — Onboarding Wizard.
- **Completed:** All four setup steps, saving as they go, with step gating in
  both directions between setup and the dashboard. `config-schema.ts` for each
  of the nine selectable agents, plus a shared catalogue that the picker, the API
  and the dashboard all read. `AgentInstance` and `WhatsAppConnection` tables
  with UNIQUE indexes on `businessId`, and a `BotType` enum with no `CRM` value.
  Four API routes, each checking the login and looking the business up by the
  signed-in user rather than any id from the request. Plain-English error and
  404 screens. Build and lint clean; 31 app-level checks and 8 database-level
  checks all pass; every step screenshotted at desktop, tablet and true mobile.
- **In progress / left off at:** nothing mid-flight. Phase 4 (Dashboard Shell +
  My Bot page) is next, once the product owner has tested Phase 3.
- **New assumptions or decisions:** `Business.name` made nullable; per-agent
  answers stored as filtered JSON; tone and language are fixed lists rather than
  free text; `error.tsx`/`not-found.tsx` added early. All expanded above.
- **Anything broken:** no. The notable gap is that **there is still no way for a
  customer to change their agent or connection after finishing setup** — the API
  correctly refuses, and Phase 4's My Bot page is where that flow belongs. This
  also depends on docs/PRD.md §10's still-unanswered "switching setup" question.

## Session Update — 2026-09-04 (Phase 4)

- **Worked on:** Phase 4 — Dashboard Shell + My Bot page.
- **Completed:** The 240px sidebar and 64px top bar, collapsing to a slide-in
  panel below 1024px; all ten dashboard destinations as real screens, the seven
  unbuilt ones saying what's coming; the My bot page with the agent's own
  questions, tone, language and escalation editable and saving; and a change-
  setup flow that reopens the wizard with everything pre-filled rather than
  adding a second agent. Renamed the route `dashboard/agents/` →
  `dashboard/my-bot/` and updated docs/Architecture.md to match. Build and lint
  clean; 38 automated checks pass; screenshotted at desktop, tablet and mobile.
- **In progress / left off at:** nothing mid-flight. Phase 5 (the free/QR
  WhatsApp connection) is next, once the product owner has tested Phase 4.
- **New assumptions or decisions:** the `my-bot` rename; re-setup means
  reopening the wizard on the same account with answers kept; the dashboard stays
  closed until a re-setup is finished. All expanded above.
- **Anything broken:** no. Two things to note: **placeholder screens currently
  name internal build phases** and should be softened before real customers see
  them, and after starting a re-setup a direct visit to `/dashboard` lands on
  Step D rather than Step A. Both are under Known Issues.

## Session Update — 2026-09-04 (Phase 5)

- **Worked on:** Phase 5 — the free-tier WhatsApp connection.
- **Completed:** The whole `web-qr` connector — an isolated child process per
  customer, the supervisor that manages them, encrypted session storage in the
  database, the command/event protocol, QR rendering, four API routes and the
  Connect WhatsApp screen. Also `lib/encryption.ts` and `lib/redis.ts`.
- **Verified:** two workers started simultaneously each produced their own real
  QR code from WhatsApp in separate processes; sessions encrypt, round-trip and
  reject tampering; all four routes refuse signed-out callers and API-tier
  accounts; the app degrades honestly when Redis is unreachable. Build and lint
  clean.
- **NOT verified — needs the product owner:** an actual QR scan with a phone,
  and the app-to-worker queue path, because this machine has no Redis. See
  Known Issues for exactly what to do.
- **New assumptions or decisions:** workers run TypeScript directly under plain
  Node rather than adding a runner; sessions stored encrypted in the database via
  `RemoteAuth` rather than readable on disk; QR codes kept in Redis with a
  90-second expiry; a "send a test message" box added to prove the connection.
- **Anything broken:** no, but one real bug was found and fixed during testing —
  the app treated "REDIS_URL is set" as "Redis is up", which made the page hang
  rather than report an outage. See the Decisions log.

### Running the WhatsApp worker locally

```bash
# 1. A Redis, any of these:
docker run -p 6379:6379 redis        # or Upstash / Railway free tier

# 2. Put its URL in .env as REDIS_URL, and set:
#      ENCRYPTION_KEY   openssl rand -base64 32
#      CHROME_PATH      path to an installed Chrome/Chromium

# 3. Two terminals:
npm run dev
npm run whatsapp-worker

# 4. Open the dashboard → Connect WhatsApp → Connect, and scan the code.
```

---

### Template for each new session's update (copy/paste and fill in):

```
## Session Update — [DATE]
- Worked on:
- Completed:
- In progress / left off at:
- New assumptions or decisions:
- Anything broken:
```

# Rules.md — Boundaries for the AI Coding Assistant

These rules apply to any AI (or human) writing code in this repo. When in doubt, follow this file over general habits or training defaults.

## 1. Stack Discipline

- **Do** use: Next.js (App Router), TypeScript, Prisma + PostgreSQL, Tailwind + shadcn/ui, NextAuth.js, BullMQ + Redis, whatsapp-web.js (free tier only), WhatsApp Business Cloud API (paid tier only), Stripe.
- **Don't** introduce a new framework, database, state-management library, CSS approach, or auth system without it being written into Architecture.md first. If a task seems to need one, stop and flag it instead of silently adding a dependency.
- **Don't** use class components — functional components + hooks only.
- **Don't** reach for a new npm package if the standard library, an already-installed package, or a few lines of plain code can do it. Every new dependency is something the (non-technical) product owner now has to trust.
- **Avoid** ORMs/DB clients other than Prisma. Avoid raw SQL unless Prisma genuinely cannot express the query — and comment why if you do.

## 2. File & Folder Discipline

- Keep the folder structure exactly as defined in Architecture.md. If a new top-level folder feels necessary, propose the change and update Architecture.md in the same PR/commit — never let the docs and the code drift apart.
- Bot logic **always** lives under `/bots/<bot-name>-bot/` — never inline a bot's prompt or behavior inside a dashboard page or API route. The dashboard/API only ever *calls* the bot, it never *contains* the bot.
- Name files and folders in plain English, matching what a non-technical person would call the thing (e.g. `connect-whatsapp/`, not `wa-int/`). No unexplained abbreviations.
- One component/function does one job. If a file is doing three unrelated things, split it.

## 3. Secrets & Security

- **Never** hardcode API keys, tokens, database URLs, or any secret in source code — always read from environment variables, and add the variable (with a placeholder value and a comment) to `.env.example`.
- **Never** expose a WhatsApp Business API token, Stripe secret key, or database credential to the frontend/browser. Anything the browser needs must go through a server-side API route.
- WhatsApp session data (QR-tier) and API credentials (paid tier) must be encrypted at rest in the database, not stored as plain text.
- Every dashboard/API route must check that the logged-in user actually owns the Business/AgentInstance/Conversation they're trying to read or modify — no trusting an ID from the request alone (prevents one customer from seeing another's data).

## 4. Error Handling

- Never let an error surface to the user as a raw stack trace, a blank screen, or a browser console error with no on-screen explanation. Always show a plain-English message ("Something went wrong connecting to WhatsApp — try again or contact support") plus a "details" link/log for developers if useful.
- Every API route wraps its logic in try/catch and returns a consistent error shape (`{ error: { message, code } }`), never lets an unhandled exception crash the process.
- WhatsApp connection failures (both API and QR tiers) must be caught, logged, and reflected in the `WhatsAppConnection` status field — the dashboard should always show accurate connection health, never a stale "connected" state.
- Background jobs (BullMQ) must have retry logic with backoff, and a dead-letter/failure log the product owner (not just a developer) can see from Settings or Analytics.
- Log errors server-side (structured logging) but never log secrets, full message content of end-users' private conversations beyond what's needed for debugging, or payment details.

## 5. AI/Agent Behavior Rules

- Each bot's system prompt lives in its own `prompt.ts` file under its bot folder — never duplicate prompt text across bots. Shared instructions go in `/bots/shared/`.
- A bot must only use the tools/integrations listed for it in PRD.md §5 (e.g. the Receptionist bot should not be silently given checkout/catalog access). If a task requires giving a bot a new capability, update PRD.md first.
- The CRM bot's writes must never overwrite fields a human has manually edited in the dashboard without an explicit "let the bot update this" setting.
- Agents must have a defined escalation/handoff path to a human (per PRD.md Onboarding Step D) — never leave a customer's customer stuck in a bot loop with no way to reach a person.
- Do not fabricate business information (hours, pricing, policies) — a bot only answers from the Knowledge Base / config data provided for that Business. If it doesn't have the answer, it says so and escalates rather than guessing.

## 6. One-Setup-Per-Account Rules (hard constraint)

Per PRD.md §3.1, each account gets **exactly one bot type and exactly one connection type**. This must be enforced in code, not just UI copy:

- The DB schema must have a **unique constraint** so a Business can have only **one AgentInstance** and only **one WhatsAppConnection**. Don't rely on the frontend to prevent duplicates.
- The onboarding bot picker (Step A) and connection picker (Step B) are **single-select** — never multi-select. An account can never have `api` and `qr` at the same time, or two customer-facing bots.
- The always-on **CRM agent is the only exception** — it runs as a background capability alongside the chosen bot and must **not** be created as a second AgentInstance row.
- Do **not** add "add another bot" or "add another connection" affordances to the dashboard. Switching bot/connection type is a **re-setup of the single slot** (per the resolution to PRD.md §10's open question), never an addition alongside the existing one.
- Any API route that creates an AgentInstance or WhatsAppConnection must reject the request if one already exists for that Business, returning a clear "you already have a bot/connection set up" error — never silently create a second.

## 7. Non-Technical-Friendliness Rules

- Every setting exposed to the end customer (the business owner using [SaaS_NAME]) must have a plain-English label and short helper text — no raw technical field names, no JSON editors in the customer-facing dashboard.
- Prefer showing status as plain words + a colored indicator ("Connected", "Reconnecting…", "Disconnected — action needed") over technical codes.
- Any code comment explaining *why* a bot folder or connector works a certain way should be written so a curious non-developer product owner skimming the repo could follow the gist.

## 8. Bulk Messaging / Outreach Rules (compliance & ban-safety)

Bulk outreach is the highest-risk feature in the app — getting it wrong can get a customer's WhatsApp number banned or expose them to legal penalties. These rules are firm:

- **Enforce the free-tier 25-recipient cap in code** (PRD.md §7.1) — the send API route must reject any free-tier (QR) campaign with more than 25 recipients, and the UI must disable selecting more than 25. Never rely on the UI alone.
- **Throttle free-tier sends** — space out the 25 messages with a delay between each (via the `campaign-sender` job), never fire them instantly. Do not remove or shorten this throttle for "speed."
- **Show the mandatory free-tier warning** (PRD.md §7.2) and require explicit acknowledgment before the first send — do not let a free-tier bulk send proceed without it.
- **Check opt-outs before every send** — any contact in the `OptOut` table (replied STOP / unsubscribed) must be automatically excluded. Never send to an opted-out contact, on any tier.
- **Append an opt-out line** to outbound bulk messages if the template doesn't already contain one.
- **Paid tier requires approved templates** — a paid-tier campaign can only send a `MessageTemplate` whose Meta approval status is approved. Block sends using unapproved templates.
- **Don't invent compliance claims** — don't hardcode statements about what Meta "allows" as fact; where policy specifics are uncertain, flag as an open question (Rules.md §10) rather than guessing.
- The 25-cap, throttle, warning, and opt-out checks are **safety features, not conveniences** — do not simplify or remove them to make the feature faster or easier to build.

## 9. What the AI Should NOT Do

- Don't skip ahead to a later phase (see Phases.md) before the current phase's scope is done and working.
- Don't silently change the data model (`prisma/schema.prisma`) without noting the change and its reason in Memory.md.
- Don't remove or "simplify away" the per-user process isolation for the free/QR tier (Architecture.md §5) for the sake of convenience — this is a deliberate safety/scalability decision, not an accident.
- Don't invent pricing, plan limits, or legal/compliance claims about WhatsApp's API policies — flag these as open questions (see PRD.md §10) instead of guessing.
- Don't commit `.env`, credentials, or any real customer data/exports to the repo.
- Don't add analytics/tracking scripts, ads, or third-party trackers beyond what's explicitly requested.

## 10. When Unsure

If a requirement is ambiguous or missing from PRD.md/Architecture.md, the AI should:
1. Make the smallest reasonable assumption needed to keep moving,
2. Clearly note the assumption in Memory.md under "Assumptions made,"
3. Flag it back to the product owner rather than quietly deciding something with long-term consequences (pricing, data model, security-relevant choices).

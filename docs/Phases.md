# Phases.md — Build Roadmap

Each phase should be fully working and testable before moving to the next. Don't start a later phase's code while an earlier phase has known-broken pieces.

## Phase 0 — Project Setup
- Initialize Next.js (TypeScript, App Router, Tailwind) project
- Set up Prisma + PostgreSQL connection, empty base schema (User, Business)
- Set up repo structure exactly per Architecture.md (empty folders with placeholder files where needed)
- Set up `.env.example`, README.md with plain-English project overview
- Deploy a "hello world" version to hosting so the pipeline is proven early
- **Done when:** empty app deploys successfully, DB connects, folder structure matches Architecture.md

## Phase 1 — Auth & Accounts
- Sign up / log in (email+password, Google OAuth) via NextAuth.js
- Session handling, protected routes (dashboard requires login, marketing pages don't)
- Basic account/profile page (Settings shell)
- **Done when:** a user can create an account, log out, log back in, and reach a protected (empty) dashboard page

## Phase 2 — Landing / Marketing Pages
- Homepage with hero, features overview, how-it-works
- Pricing page (placeholder tiers, wired to "Get Started" → signup)
- FAQ page
- **Done when:** all marketing pages are built, responsive, and link correctly into the signup flow

## Phase 3 — Onboarding Wizard
- Step A: Choose bot — **single-select** agent picker UI, reads from the fixed catalog (PRD.md §5). One bot per account (PRD.md §3.1).
- Step B: Connection type — API **or** QR/free, **single-select** (never both), explanation copy for each
- Step C: Business/product questions — dynamic based on the bot chosen
- Step D: Bot behavior — tone, language, escalation rules
- Persist all onboarding answers to the `Business` and `AgentInstance` tables — with **unique constraints** enforcing one AgentInstance + one WhatsAppConnection per Business (Rules.md §6)
- **Done when:** a new user can complete the full wizard and land on the (still mostly empty) dashboard with their choices saved, and the DB rejects any attempt to create a second bot or connection

## Phase 4 — Dashboard Shell + My Bot Page
- Dashboard layout (sidebar nav, top bar, all the pages listed in Architecture.md as empty/placeholder screens)
- **My Bot** page: shows the account's single chosen bot from onboarding, edit its config. No "add bot" affordance (Rules.md §6). Changing bot type here is a re-setup, not an addition.
- **Done when:** dashboard navigation works end-to-end, My Bot page reflects the one bot from onboarding data

## Phase 5 — WhatsApp Connection (Free/QR Tier First)
- Build the `web-qr` connector: worker process, session manager, QR generator
- Connect WhatsApp page: QR code display, connection status, disconnect/reconnect
- Isolated per-user process behavior confirmed working (Architecture.md §5)
- **Done when:** a real WhatsApp account can be connected via QR scan and a test message can be sent/received through it

## Phase 6 — WhatsApp Connection (Paid/Business API Tier)
- Build the `business-api` connector: webhook handler, send-message endpoint
- Connect WhatsApp page: credentials form + setup guide for API tier
- **Done when:** a test WhatsApp Business API account can send/receive through the app

## Phase 7 — First Bot End-to-End: Receptionist
- Build `/bots/receptionist-bot/` fully (prompt, config schema, handler)
- Build the Message Router (even if it only routes to one bot for now)
- Knowledge Base page (minimal — FAQs/hours) feeding the Receptionist bot
- **Done when:** a real inbound WhatsApp message (via either connector) gets a correct AI reply from the Receptionist bot, and it shows up in Conversations

## Phase 8 — Remaining Bot Types
- Build out the rest of `/bots/`: Lead Qualifier, Appointment, Sales, Support, Follow-up, Personal Shopper, Feedback, Internal, CRM — so **any account can choose any one of them** at onboarding.
- Each bot is built and tested standalone against its PRD.md §5 scenario. The router still routes an account's inbound messages to that account's **one** chosen bot (no multi-bot routing — PRD.md §3.1); the CRM agent runs in parallel as the background capability.
- **Done when:** every bot type works individually against its test scenario, and an account configured with any given bot correctly receives replies from only that bot (plus background CRM updates)

## Phase 9 — Conversations Inbox & Human Handoff
- Live inbox view of ongoing conversations
- Human takeover (pause bot, human sends manually, resume bot)
- Escalation triggers from bots (per Rules.md §5) surface here
- **Done when:** a human can see a live bot conversation and take over mid-thread

## Phase 10 — Leads / CRM
- Leads table (from Lead Qualifier + CRM bot writes)
- Manual edit, tagging, status changes, protection against bot overwriting human edits (Rules.md §5)
- **Done when:** leads populate automatically from conversations and can be managed manually

## Phase 11 — Analytics
- Messages handled, response times, conversion metrics, per-agent breakdown
- **Done when:** dashboard shows real numbers pulled from Conversation/Message/Lead data

## Phase 12 — Campaigns / Bulk Outreach
- Campaigns page: build a contact list/segment, pick or edit a template, schedule/send
- Ship the predefined starter template library (PRD.md §7.3); allow user-created templates
- Free-tier (QR): enforce the **25-recipient cap** + throttle + mandatory warning (Rules.md §8)
- Paid-tier (API): template approval flow, larger sends
- Opt-out (STOP) handling + exclude opted-out contacts on every send
- Delivery/read/reply tracking per campaign
- **Done when:** a free-tier user can send a throttled ≤25-recipient campaign (after acknowledging the warning) and a paid-tier user can send an approved-template campaign, with opt-outs respected and results tracked

## Phase 13 — Billing & Subscriptions
- Razorpay integration: plan selection, hosted checkout, webhook handling for subscription status (the plan documents said Stripe; the owner chose Razorpay on 2026-09-05)
- Usage tracking against plan limits (message volume; campaign limits if any)
- Billing page: current plan, invoices, upgrade/downgrade
- **Done when:** a user can subscribe, get gated correctly by plan limits, and manage their subscription

## Phase 14 — Polish, Hardening, Launch Prep
- Error states/edge cases across all phases (Rules.md §4)
- Security review (Rules.md §3): auth checks on every route, encrypted secrets, no leaked tokens
- Performance pass, mobile responsiveness check
- Final design pass against Design.md
- **Done when:** the app is ready to onboard real paying customers

**Status (2026-09-05): the code is done; the accounts are not.** Rate limiting,
security headers, a last-resort error screen, a dashboard loading state and a
standing source audit (118 checks) are all in. What still stands between this
and a real paying customer is not code: a `GEMINI_API_KEY`, a connected
WhatsApp number, a Razorpay account with one plan per paid tier, and an email
service so that "forgot password" can exist. See docs/Memory.md.

The model provider is **Google Gemini** (`gemini-3.8-flash`), chosen by the
product owner on 2026-09-05. It is reached over plain HTTPS from
`lib/ai-client.ts`, which is the only file in the repo that knows who the
provider is. See README.md for how to run and deploy the two processes.

---

**Note:** Phases 5 and 6 (the two WhatsApp connectors) can be reordered or built in parallel by different people if needed — everything after Phase 6 depends on *a* connector existing, not specifically both.

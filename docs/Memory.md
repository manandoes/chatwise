# Memory.md — Living Progress Log

> **How to use this file:** This is not filled in up front — it starts empty/near-empty and gets updated by whoever (or whichever AI) is coding, at the end of every work session. Its whole purpose is so that a new chat/tool/session can read this one file and know exactly where things stand, without re-reading the entire codebase or guessing. Keep entries short and factual. Newest updates at the top of each section.

---

## Current Status

- **Current phase:** Phase 14 - Polish, Hardening, Launch Prep - **code-complete, typecheck, lint and build clean, 118 automated checks passing (Phases 8-13's 540 still passing too - 658 in total)**
- **Last updated:** 2026-09-05
- **Last updated by:** Claude Opus 5 (Claude Code)
- **Next up:** nothing left to build. What remains is the non-code things under Known Issues: a `GEMINI_API_KEY`, a connected WhatsApp number, a Razorpay account with one Razorpay plan per ChatWise plan (all three are paid), and an email service. Until those exist, nothing here has ever answered a real customer, sent a real message, or taken a real rupee.
- **Phases built:** 0-14. All of them.
- **Database:** Supabase (hosted PostgreSQL), confirmed by the product owner on 2026-09-03.
- **AI provider:** **Google Gemini**, chosen by the product owner on 2026-09-05, replacing the assumed Anthropic. Default model `gemini-3.8-flash`, overridable with `GEMINI_MODEL`. `lib/ai-client.ts` is the only file that knows who the provider is; no agent, prompt or router line changed in the swap.
- **Payments:** **Razorpay**, chosen by the product owner on 2026-09-05. Prices settled by the owner: **₹999 (Small Business) and ₹1,499 (Enterprise)** a month. The owner explicitly delegated *what each plan includes* to this codebase - those limits live in `lib/plans.ts` and are the one thing to edit to change the product's shape.
- **Pricing model:** **both connection tiers are paid** - set by the product owner on 2026-09-05, replacing the earlier free-QR/paid-API split. There is **no free plan**. The QR tier is for small businesses and the monthly subscription is their whole bill, with no per-message cost. The API tier is for larger businesses: the same monthly subscription *plus* Meta's per-conversation charges, which **Meta bills directly to the customer's own Meta account**. That money never passes through ChatWise, and no rate for it is quoted anywhere in the code or the screens - the numbers are Meta's, they vary by country and conversation type, and inventing one would break docs/Rules.md §9. `FREE` survives only as a stored enum value meaning "no live subscription": it grants nothing, nothing sells it, and `lib/plans.ts` calls it `NO_SUBSCRIPTION_PLAN`.
- **How to run any of this:** see "How to Run This" below - it covers the app on
  its own, the QR tier, and the Business API tier.

## What's Done (working, tested)

- [x] **Phase 14: Rate limiting** - `lib/rate-limit.ts`. Until now nothing stopped ten thousand sign-up attempts, a night of password guessing, or somebody hammering the endpoint that calls Meta on a customer's behalf. Counters live in Redis, which was already required. It **fails open** on purpose: a Redis blip must not become "nobody can log in". Applied to signing up, signing in, starting a QR session, verifying Meta credentials, buying a plan, writing a campaign, and replying by hand.
- [x] **Phase 14: Security headers** - `next.config.ts`. `frame-ancestors 'none'` (plus `X-Frame-Options`) stops the dashboard being put in an invisible iframe on somebody else's page and a signed-in owner being tricked into clicking "Disconnect". `Referrer-Policy` stops an address holding a conversation or lead id reaching whatever site is linked to next. Plus `nosniff`, a `Permissions-Policy` that turns off camera, microphone, location and payment, HSTS, and no `X-Powered-By`.
- [x] **Phase 14: A last-resort error screen** - `app/global-error.tsx`. `app/error.tsx` catches a page that fails; this catches the *layout* failing, which previously fell through to the framework's raw stack trace on a white page (docs/Rules.md §4). It imports nothing and styles itself inline, because a screen that only appears when things are broken should have nothing left in it to break.
- [x] **Phase 14: A loading state for the dashboard** - `app/dashboard/loading.tsx`. Several screens ask the database three or four questions before they can render, and without this a click looked like it had not registered.
- [x] **Phase 14: A real design bug found and fixed** - `bg-surface-raised` was used in nine files and defined in none. Tailwind v4 builds its classes from the `@theme` block, so a colour that is not there produces no CSS and fails completely silently: those hover states and the analytics bar track simply never happened. All nine now use `surface-elevated`, and the checks compare every colour used against the theme so it cannot come back.
- [x] **Phase 14: Razorpay's own words no longer reach a customer** - an invoice's status was being printed straight out of their API (`issued`, `partially_paid`). It now goes through `invoiceStatusLabel` (docs/Rules.md §7).
- [x] **Phase 14: The three missing folder READMEs written** - `app/`, `lib/` and `prisma/` had none, which docs/Architecture.md §3 says every folder carries.
- [x] **Phase 14: Verified with 118 automated checks, most of them standing audits** - deliberately written against the source rather than against behaviour, because "every route checks who is asking" cannot be proved by exercising the routes you happened to think of. They check: every API route names an ownership guard or is on a five-entry list of public-by-design ones with a reason; both public webhooks verify a signature; every route catches its own errors; no secret's name appears in anything that runs in the browser; every file holding a secret is `server-only`; no key-shaped string is anywhere in the source; every environment variable the code reads is documented in `.env.example`; every sensitive route is rate limited and the limiter fails open; every security header is sent; every colour used exists in the theme; no screen prints a raw status; no customer's message is ever logged; nothing is pinned wider than the narrowest phone; and the documents still describe the code.

- [x] **One plan per tier, and nothing else (2026-09-05)** - the plan ladder is gone. There are exactly **two plans, one per connection tier**: **Small Business ₹999** (QR connection) and **Enterprise ₹1,499** (official Business API). No sizes within a tier, no upsell path except moving between the two - the plan a business buys *is* the way it connects. `PlanId` in the database became `NONE / SMALL_BUSINESS / ENTERPRISE`, with migration `20260905220000_two_tier_plans` mapping existing rows (STARTER→SMALL_BUSINESS, GROWTH and PRO→ENTERPRISE, FREE→NONE). The Razorpay env vars are now `RAZORPAY_PLAN_ID_SMALL_BUSINESS` and `RAZORPAY_PLAN_ID_ENTERPRISE`; **anyone who was on PRO needs their Razorpay subscription re-pointed at the Enterprise plan by hand**, because the migration moves entitlement and only Razorpay can move what is charged. `planForConnectionType()` is the lookup between the two enums, since they now hold the same decision.
- [x] **Both tiers are paid (2026-09-05)** - the product owner settled the pricing model: QR for small businesses at the subscription price and nothing per message, API for larger businesses at the subscription price plus Meta's per-conversation charges billed by Meta. The free plan is gone. `lib/plans.ts` holds the paid plans plus `NO_SUBSCRIPTION_PLAN` (the `NONE` enum value, all limits zero) for accounts that have not paid or have finished cancelling - they keep and can read everything, they just cannot send. `billingNote(plan)` is what every screen prints beside a price, so Enterprise can never show its subscription cost as if it were the whole bill. `whatsapp-connectors/capabilities.ts` gained `billsPerMessageAtMeta`, which is where "does anyone else charge for this?" is now answered. The words "free tier" and "paid tier" were removed from the whole repo - code, comments, schema, screens and docs - because both were pricing claims that had stopped being true; the tiers are named QR and API after what they are rather than what they cost.
- [x] **Phase 13: The plans, in one file** - `lib/plans.ts` holds the prices, every limit and what each plan includes, as plain data with no secrets, read by the pricing page, the billing screen and every server-side check. The marketing pricing page used to keep its own copy of what each plan included; it now reads this one, so a plan can no longer say two different things in two places.
- [x] **Phase 13: Razorpay, in one file** - `lib/razorpay.ts` is the only thing that talks to the payment provider: subscriptions, invoices, cancellation and webhook signature checking, over plain HTTPS with basic authentication. No SDK, for the same reason Meta's Graph API has none (docs/Rules.md §1). Swapping provider means replacing that one file.
- [x] **Phase 13: Card details never reach ChatWise** - paying happens on Razorpay's own hosted page. The app hands over a link and gets a webhook back; it never sees a card number, and there is no publishable key in the browser either.
- [x] **Phase 13: Only the webhook grants anything** - opening a payment page grants nothing at all. An account becomes entitled to a paid plan when a signed `subscription.*` event says the money arrived, and not before. The endpoint is public, so it verifies an HMAC-SHA256 signature over the raw bytes before believing a word of it - the same defence as the Meta webhook.
- [x] **Phase 13: A re-sent payment event changes nothing twice** - `BillingEvent` uses Razorpay's own event id as its primary key, so a second delivery fails to insert and is dropped. The same trick that stops a re-sent WhatsApp message becoming a second reply.
- [x] **Phase 13: Limits are counted, never tallied** - there is no usage counter and no usage table. "Messages sent this month" is the number of outbound messages in this account's conversations since the period began, worked out each time it is asked for. `jobs/usage-billing-sync.ts` from the original architecture sketch was therefore never built: there is nothing to sync.
- [x] **Phase 13: Running out of messages does not silence a business** - the agent stops replying by itself and hands the thread to a person, and the customer still gets one sentence rather than silence (docs/Rules.md §5). **Replying by hand in the inbox is deliberately never limited** - a plan caps the automation, not the owner. That sentence is filed as ChatWise's rather than the agent's, so it cannot flatter the agent's reply counts or answer times in Analytics.
- [x] **Phase 13: Every limit is enforced where the spending happens** - campaigns and campaign size in `buildCampaign`, the agent's replies in the router, saved templates and knowledge answers in their own API routes, the official WhatsApp API at the point credentials are saved, and the analytics history window on the page itself. Not one of them is enforced only in the browser.
- [x] **Phase 13: With payments off, nothing is limited** - an installation with no `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` behaves exactly as it did before Phase 13, and the billing screen says so plainly instead of showing buttons that would fail. Holding an account to a limit when there is no way to pay for a bigger one would be a bug wearing a business rule's clothes.
- [x] **Phase 13: A failed payment doesn't switch the product off** - Razorpay retries a card for days. The account keeps its plan through `PAST_DUE` with a warning on the billing screen, and only drops to no plan at all when the subscription is actually cancelled. Cancelling keeps everything until the period already paid for runs out.
- [x] **Phase 13: The billing screen** - current plan and status in plain words, what has been used this period against the plan's limits, both plans with what changes between them, and invoices read live from Razorpay rather than copied into our database. Upgrades take effect immediately; downgrades wait for the month already paid for.
- [x] **Phase 13: Migration applied** - `20260905031834_billing_subscriptions` added `PlanId`, `SubscriptionStatus`, `Subscription` and `BillingEvent`.
- [x] **Phase 13: Verified with 119 automated checks** - the plan list and its arithmetic; every Razorpay status translated, including an unknown one falling to "unpaid" rather than "paid"; a webhook signature accepted, and refused when the body, the secret or the length is wrong; the same event twice changing nothing twice; an event about somebody else's subscription ignored; a failed payment keeping the plan and a cancellation dropping it; usage counted from real rows with inbound and other accounts' traffic excluded; every limit at its exact boundary; the agent falling silent at the limit while a person can still reply; and the whole lot switching off when payments are off.

- [x] **Phase 12: Campaigns are built, and every safety rule with them** - write a message, pick people who have already messaged you, and it goes out one at a time. `campaigns/send-campaign.ts` holds every rule in one place: the QR tier's 25-recipient cap, the mandatory ban-risk warning, opt-outs excluded, an opt-out line appended, one campaign at a time, and - since Phase 13 - the plan's own limits (docs/Rules.md §8).
- [x] **Phase 12: Nobody is ever messaged twice** - enforced by the database (`@@unique([campaignId, contactPhone])`) rather than by whichever code path built the list, and each message is claimed atomically before it is sent, so two ticks of the sender can never both send it.
- [x] **Phase 12: A send interrupted half-way is given up on, never retried** - if a message has been claimed for ten minutes with nothing to show for it, we cannot tell whether it went out. "Possibly sent twice" is worse than "definitely not sent" when the cost is a banned number.
- [x] **Phase 12: The throttle is real** - 45 seconds either side of 15, written into each recipient's `sendAfter` when the campaign is built, so the spacing is a fact in the database rather than a timer somebody could restart. The number is **our own conservative guess, not Meta's**, and is flagged for the owner to tune.
- [x] **Phase 12: STOP works, and only when it means STOP** - matched against the whole message with punctuation and case ignored, so "please don't stop sending me these" unsubscribes nobody. Handled before the escalation check, so a thread waiting for a person still honours it. Opt-outs are checked again at the moment of sending, because a campaign written on Monday may go out on Wednesday.
- [x] **Phase 12: Templates on both tiers** - on the QR tier a saved message; on the API tier the name, language and approval status of something registered at Meta. A template Meta has not approved cannot be sent.
- [x] **Phase 12: The sender runs on the always-on host** - `jobs/campaign-sender.ts` ticks every 15 seconds beside the QR session manager. PostgreSQL is the schedule, not BullMQ: a queue holding "this person still needs messaging" would be a second copy of a fact the database owns, and disagreement means double sends.
- [x] **Phase 12: Delivery, read and reply tracking** - Meta's receipts are matched to a recipient by message id and can never walk backwards from "read" to "sent". A reply is noticed by the router.
- [x] **Phase 12: Bulk messages never flatter the numbers** - recorded as `CAMPAIGN`, counted separately in Analytics, and skipped when working out how long people waited: a broadcast is not somebody answering a customer.
- [x] **Phase 12: Migration applied** - `20260905022920_campaigns_templates_optouts` added `Campaign`, `CampaignRecipient`, `MessageTemplate`, `OptOut` and their enums, plus `MessageAuthor.CAMPAIGN`.
- [x] **Phase 12: Verified with 106 automated checks** - the cap, the warning, the throttle's real spacing, opt-outs honoured twice over, an unapproved template refused, nobody messaged twice, an interrupted send given up on, receipts that cannot go backwards, and every one of those refused for another account's ids.

- [x] **Phase 11: Analytics** — messages in and out, which of the three possible authors did the replying, how long people actually waited, and how many leads became customers. Over the last 7 days, 30 days or all time; the period is in the address, so a view can be bookmarked or sent to somebody. No client JavaScript on the page.
- [x] **Phase 11: The numbers are counted, never estimated** — `lib/analytics.ts` queries the real Conversation, Message and Lead rows. No metrics store, no counter table, no rollup. A figure that cannot honestly be worked out comes back null and the tile shows "—" with the reason, rather than a zero that reads like a finding (docs/Rules.md §4).
- [x] **Phase 11: Answer time is a median, and says what it is based on** — one reply written the next morning would make an average meaningless. Measured from the **first** message of a run, which is when somebody actually started waiting, and shown separately for the agent and for a person.
- [x] **Phase 11: The Overview stopped lying** — it had hardcoded "Not connected yet" since Phase 3, which became wrong the moment Phase 5 could connect a number. It now shows the connection's real status and the real headline figures, plus a nudge when conversations are waiting.
- [x] **Phase 11: Verified with 44 automated checks** — threads built with known timings, then every figure checked against what was put in: each window's message counts, the author breakdown, medians including the two-messages-then-one-reply case, conversion over all leads rather than the window, an empty account returning nulls instead of zeroes, and another account's traffic never appearing.
- [x] **Phase 10: The leads screen** — every lead is there because the background CRM agent put it there while another agent was answering somebody; nothing is typed in, and the empty state says so rather than showing an "Add lead" button that would be a lie. Filter by status, open one, read the conversation it came from.
- [x] **Phase 10: Editing a lead by hand** — name, email, status, score, tags, summary, next step, and notes that are the person's alone. Checked in the browser for quick feedback and again on the server, which never trusts the browser's verdict.
- [x] **Phase 10: A person's edit is claimed field by field** — `applyHumanEdit` records only the fields whose value **actually changed**. Somebody who fixes a status has taken the status, not the whole record; the agent carries on keeping the summary current. Marking every field on screen would have quietly switched the agent off the first time anyone touched a lead.
- [x] **Phase 10: The screen says who owns each field** — under every box: "Your agent keeps this up to date" or "Yours — your agent won't change it". The protection docs/Rules.md §5 asks for is invisible otherwise, and an invisible guarantee is one nobody trusts.
- [x] **Phase 10: The owner's waiver works both ways** — `letTheAgentUpdateThis` lets the agent update everything again, and does **not** erase which fields were the person's, so turning it back off restores exactly the protection they had.
- [x] **Phase 10: The status vocabulary moved out of the agent's prompt** — `lib/validation/leads.ts` now owns the five statuses and their plain-English labels, read by both the dashboard and the CRM agent. The dashboard was otherwise going to import an agent's prompt into the browser to find out what "QUALIFIED" is called (docs/Rules.md §2). No schema change; `bots/crm-bot/prompt.ts` re-exports them so nothing else moved.
- [x] **Phase 10: Verified with 48 automated checks** — the full round trip above all: the agent writes a lead by itself, a person corrects two fields, the agent writes again and leaves exactly those two alone while keeping the rest current, the waiver is turned on and off. Plus the filter and counts, every validation rule, another account's lead being untouchable, and the agent being unable to write into a person's notes.
- [x] **Phase 9: The inbox is live** — the thread list and an open conversation both keep themselves up to date while somebody is looking (10 seconds and 5 seconds; both stop while the tab is in the background). Polling, not sockets: the app is serverless and has nowhere to hold one open, and adding a realtime service is not a decision to make inside a feature (docs/Rules.md §1). See docs/Architecture.md §5b.
- [x] **Phase 9: A person can take a conversation over** — "Take over" stops the agent replying in that thread, and so does simply typing a reply, because somebody who has just answered a customer does not want the agent answering the next message on top of them (docs/Rules.md §5). "My agent can carry on" hands it back. `lib/conversations.ts` holds all of it; the API routes are thin.
- [x] **Phase 9: Replying by hand** — typed in the inbox, sent through the same connector both tiers already use, recorded as the person's own message (`author: HUMAN`) and never passed off as the agent's. A reply that could **not** be sent is deliberately not written down: the person is right there, so they get the reason and their words stay in the box, rather than the thread showing the customer a message they never received.
- [x] **Phase 9: Escalations surface where they can be acted on** — a thread the agent handed over is marked in the list and at the top of the thread, and now says which of the two kinds of quiet it is: the agent asking for help, or a person having already stepped in (`Conversation.escalatedBy`). The router still checks the single `escalatedAt` field before replying, so there is never a second condition to forget.
- [x] **Phase 9: Unread counts** — counted by the router as messages arrive, so a webhook Meta re-sends leaves the count alone, and cleared when somebody actually opens the thread.
- [x] **Phase 9: Migration applied** — `20260904190200_conversations_human_takeover` added `HandoverSource`, `Conversation.escalatedBy` and `Conversation.unreadCount`.
- [x] **Phase 9: Verified with 64 automated checks** against a stub model and a stub WhatsApp connector. Covers: unread counting and re-deliveries not double-counting; the inbox list and its preview; taking over stopping the agent; typing a reply doing the same; handing back letting the agent answer again; a person's reply recorded as theirs; a failed send leaving no trace; the agent's own handover reason surviving a person's reply; polling returning only what is new; and every one of those refused for a different account's conversation id.
- [x] **Phase 9: Migration ordering repaired** — the Phase 8 leads migration was named with a timestamp *earlier* than the Phase 7 migration that creates the table it references, so a database could never be built from the files. Both it and the new one are renamed to sort correctly; the whole chain now replays from empty.
- [x] **Phase 8: All nine selectable agents are built** — Receptionist, Lead Qualifier, Appointment, Sales, Support, Follow-up, Personal Shopper, Feedback and Internal. Each has its own `prompt.ts` (its instructions, in plain language) and a thin `handler.ts`. `bots/shared/handlers.ts` lists them; the router changed not at all to gain eight agents.
- [x] **Phase 8: The always-on CRM agent is built** — `bots/crm-bot/`. It never talks to anybody: it reads the conversation another agent is having and keeps one record per contact up to date. Its answer is JSON, so every field is checked before it reaches the database — an unknown status, a score of 5000 or forty tags change nothing.
- [x] **Phase 8: A person's edit wins** — `lib/leads.ts` decides what the CRM agent may actually change, and a field somebody edited by hand in the dashboard is left alone from then on (docs/Rules.md §5). Enforced in code, not asked for in a prompt. `letTheAgentUpdateThis` is the owner's explicit waiver, per lead.
- [x] **Phase 8: Asking the model is written once** — `bots/shared/run-agent.ts` holds the ask-and-cope logic all nine agents share, so an agent's own folder holds only what makes it that agent. Every agent's prompt is now built from labelled setup answers and is told today's date in the business's own timezone.
- [x] **Phase 8: The two agents that speak first have their words here too** — `composeFollowUpNudge` and `composeFeedbackRequest` are written and tested; the background job that decides *when* to send them is Phase 12. Their timings (`followUpSchedule`, `feedbackDelayMs`) are read from the owner's setup answers, in the agent's own folder.
- [x] **Phase 8: Migration applied** — `20260904180048_add_leads_for_crm_agent` added the `Lead` table and `LeadStatus`.
- [x] **Phase 8: Verified with 159 automated checks** against a stub model. Covers: every agent answering from its own account's setup answers and nobody else's; no agent's instructions leaking into another's prompt; handover; a thread waiting for a person staying quiet while the CRM record keeps up; the CRM agent's nonsense being refused field by field; a human edit surviving the agent; the owner waiving that protection; a re-delivered message; the model being unreachable; both first-message composers.
- [x] **Phase 7: The Receptionist is built** — `bots/receptionist-bot/prompt.ts` (its instructions, in plain language) and `handler.ts` (thin: ask, read the answer, cope when the model can't). Rules shared by every agent — never invent business information, always leave a way out to a person, keep it short for WhatsApp — live once in `bots/shared/prompt-shared.ts`.
- [x] **Phase 7: The message router is built** — `message-router/router.ts` is the single entry point for every inbound message from either connector. It records the message, decides, replies, and writes down what happened. It never throws at its caller, and it knows nothing about signatures, browsers or queues.
- [x] **Phase 7: Both connectors feed it** — the Business API webhook routes each message (inside `after()`, so Meta gets its 200 immediately) and the QR session manager routes each message from the worker's process channel. The QR worker now reports what a message said; the manager strips that before relaying anything to the shared Redis queue.
- [x] **Phase 7: Knowledge base page** — plain question-and-answer boxes, saved through `/api/knowledge-base` (replace-all, in one transaction). Hours and the other setup answers are **shown** there but edited on My bot, so no fact has two homes.
- [x] **Phase 7: Conversations (read-only)** — a list and a thread view of everything that was said, plus "My agent can carry on" to clear a handover. **Superseded by Phase 9**, which made both live and added taking over and replying by hand; `components/dashboard/resume-agent-button.tsx` was folded into the thread's own controls and deleted.
- [x] **Phase 7: Verified with 94 automated checks** — 60 against the router (with a stub model standing in for the real one) and 34 over real HTTP against a running app. Covers: a reply built from the business's own answers; the same message arriving twice being answered once; handover; the agent staying quiet while a person deals with a thread; a photo; an agent that isn't built yet; the model being unreachable; one account's knowledge base never reaching another's agent; a customer trying to reprogram the agent; a signed webhook end to end and an unsigned one refused.
- [x] **Phase 7: Migration applied** — `20260904190000_conversations_messages_knowledge_base` added `Conversation`, `Message` and `KnowledgeEntry`.

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
> The Phase 6 items below are built and checked as far as this machine allows.
> Nothing on that tier has yet exchanged a real message with Meta — see
> "What's In Progress" and Known Issues before treating it as signed off.

- [x] **Phase 6: Migrations applied** — `20260904125704_add_whatsapp_api_credentials` created `WhatsAppApiCredential`; `20260904184336_per_customer_meta_app` then added the per-customer app secret, webhook path token and verify token.
- [x] **Phase 6: Both tiers share one ownership check** — `lib/whatsapp-connection.ts` (`requireApiConnection` / `requireQrConnection`) finds the connection from the session's user id, never from an id in the request, and refuses a QR account on API routes and vice versa (409).
- [x] **Both tiers now sit behind one interface** — `whatsapp-connectors/index.ts` (`connectorFor("QR" | "API")` → `sendText()`) and `whatsapp-connectors/capabilities.ts` (the tier rules as data). Both send-test routes go through it, so it has real callers rather than being scaffolding. Build, lint and `tsc --noEmit` clean afterwards.
- [x] **Phase 6: The Business API connector is built** — `graph-api.ts` (calling Meta, and translating its errors into plain English), `credentials.ts` (encrypted storage plus verification against Meta), `send-message.ts`, and `webhook-handler.ts`.
- [x] **Phase 6: One Meta app per customer** — each customer supplies their own phone number ID, access token **and app secret**, all stored encrypted against their own connection. Nothing about Meta is configured platform-wide; there is no shared app secret and no shared verify token.
- [x] **Phase 6: One webhook address per customer** — `/api/whatsapp/business-api/webhook/<their-own-token>`. Necessary rather than cosmetic: the signing secret belongs to the customer's app, so the account has to be identified *before* verification, and Meta's initial handshake carries no phone number at all. The verify token is generated for them and shown on the Connect screen.
- [x] **Phase 6: The webhook defends itself** — the only route the public internet can reach without a login, so it verifies the HMAC signature over the **raw** request bytes using *that customer's* secret before reading a single field. Verified that **one customer's app secret cannot sign another customer's webhook**, and that unsigned, wrongly-signed, and signed-over-different-bytes payloads are all refused.
- [x] **Phase 6: The QR tier needs nothing from Meta** — verified that a QR-tier account's Connect screen never mentions an app secret, a phone number ID or a webhook, and that QR accounts are refused from the API routes entirely.
- [x] **Phase 6: Credentials verified before they're stored** — saving calls Meta to check the token actually works, so a typo is caught at setup rather than discovered when a customer's message goes unanswered. Confirmed against the real Graph API that a bogus token is rejected and the error becomes plain English.
- [x] **Phase 6: Access tokens encrypted at rest** — same AES-256-GCM as the QR sessions. Verified against the database that the plain token does not appear in the stored bytes. Never returned to the browser, not even masked.
- [x] **Phase 6: Connect WhatsApp page for API accounts** — credentials form, a four-step guide to where each value lives in Meta's console, the webhook address ready to copy, and message counters.
- [x] **Phase 6: Verified as far as possible here** — 23 per-customer isolation checks (own webhook address, own verify token, own signing secret, cross-customer signing refused, both secrets unreadable in the database), 17 tier-separation and validation checks, plus the earlier route checks. Confirmed the app works with **no platform Meta variables set at all**. Build and lint clean.
- [x] **Phase 1: Verified end-to-end** — 25 automated checks against a running production build all pass: sign up, validation errors, duplicate email, wrong password, successful login, session contents, both protected pages, signed-in redirect off `/login`, three open-redirect attempts blocked, log out, and log back in. Confirmed directly in the database that passwords are stored as salted scrypt hashes and that the same password produces different stored values.

## What's In Progress

**Both connectors are code-complete and neither is signed off.** In both cases
the gap is infrastructure and outside accounts, not unfinished code — nothing is
half-written.

**Phase 5 (QR tier)** — two things remain, both needing the product owner:

1. **Provide a Redis** and set `REDIS_URL` — then the app-to-worker path can be
   exercised end to end.
2. **Scan a QR code with a real phone**, which is the only way to prove the
   "done when" from docs/Phases.md.

**Phase 6 (Business API tier)** — every path that can be exercised without Meta
has been, and the build is clean, but the "done when" ("a test WhatsApp Business
API account can send/receive through the app") needs three things this machine
does not have:

1. **A Meta app with WhatsApp added and a test number registered**, giving a
   phone number ID, an access token and an app secret. All three are entered
   **in the dashboard, per customer** — none of them is an environment variable
   any more (see the 2026-09-04 rework below).
2. **A publicly reachable HTTPS address**, because Meta calls the webhook from
   the internet and cannot reach `localhost`. A tunnel (cloudflared, ngrok) is
   enough for testing — see "How to Run This".

**Phase 7 (the Receptionist end to end)** — code-complete and tested against a
stub model. The "done when" ("a real inbound WhatsApp message gets a correct AI
reply and shows up in Conversations") needs two things this machine does not
have:

1. **An `GEMINI_API_KEY`.** Without it the pipeline still runs: the message
   arrives, is recorded, the customer is told a person will follow up, and the
   thread is flagged. It is just never answered by an agent. The QR-tier
   worker host needs the key as well as the web app — the router runs in the
   session manager for QR accounts.
2. **A connected number** (either tier), which is the same blocker as Phases 5
   and 6.

What has *not* been proven: how good the Receptionist's answers actually are.
Every check used a stub model, so what is verified is the plumbing and the
guard rails — that the prompt contains the business's real hours and answers,
that a handover is honoured, that nothing is invented on an unbuilt agent's
behalf. The quality of a real reply is a judgement call for the product owner
once a key is in place.

**Phases 10 and 11 (leads and analytics)** — nothing external is blocking
either. Both read data the earlier phases write, and both are checked against
data built for the purpose. The honest caveat is different in kind: **neither
has been looked at with a real account's worth of real data.** The leads screen
has never shown a lead the model actually wrote, and every analytics figure is
correct against rows a test made up. Numbers can be right and still be the
wrong numbers to show, and that is a judgement the product owner has to make
once there is traffic.

**Phase 9 (the live inbox and human handover)** — the same two blockers again,
and one of them bites harder here:

1. **A connected number.** Replying by hand goes out through the same connector
   the agents use, so nothing about the send half has been exercised against a
   real WhatsApp. The checks stub the connector out.
2. **An `GEMINI_API_KEY`** only for the half where the agent is answering;
   taking over, replying and handing back work without one.

Also worth a real look once there is traffic: **how well polling holds up.** Ten
seconds on the list and five on an open thread is a guess made without a busy
account to watch. If a hundred threads and several people watching turns out to
be heavy on the database, the fix is either a longer interval or a proper
realtime service — the second is a stack decision (docs/Rules.md §1), not
something to slip in quietly.

**Phase 8 (the other eight agents + the CRM agent)** — same two blockers, same
shape, and it is worth being blunt about the second half of it:

1. **The same `GEMINI_API_KEY` and a connected number**, as above. The CRM
   agent needs the key too — with no key it simply does not run, and no lead
   records are written.
2. **Nobody has read a single real reply from any of these agents.** All 159
   checks used a stub model. What is verified is that each agent gets its own
   account's details and nobody else's, that a handover is honoured, that the
   CRM agent cannot write nonsense into a customer list, and that a person's
   edit survives it. Whether the Sales agent actually holds the line on a
   discount, or the Appointment agent really refuses to promise 4pm, can only
   be judged by reading real replies. **Suggested first test once a key is in
   place:** set an account up as the Sales agent, ask it for a discount it was
   not allowed to give, and see what it says.

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
- **Phase 6 is NOT signed off: no Meta app and no public URL on this machine.**
  Every route, the signature check, the encryption and the screen are written and
  the build is clean, but nothing has ever exchanged a real message with Meta.
  **Action for the product owner:** create a Meta app with WhatsApp added,
  expose this app over HTTPS (a tunnel is fine), then paste the phone number ID,
  access token and app secret into Connect WhatsApp — the screen hands back that
  account's own webhook address and verify token to enter at Meta, where the
  webhook must be subscribed to the `messages` field.
- **The webhook cannot be tested from `localhost`.** Meta calls it from the
  internet. Without a tunnel the *outbound* half (saving credentials, sending a
  test message) still works fine — only inbound messages and delivery statuses
  are unreachable.
- **Meta's temporary access tokens expire, and nothing warns anyone.** The token
  on Meta's API Setup screen is short-lived; when it dies, sending fails with a
  readable message and `lastError` is set, but no one is told until they look.
  A permanent token is the answer for any number that matters. Worth a proper
  expiry warning — or a token-health check — before launch.
- **Only plain text can be sent over the Business API.** `sendTextMessage()`
  covers replies inside an open conversation, which is what an agent does.
  Starting a conversation generally needs a template Meta has approved; that
  belongs with campaigns in Phase 12 (docs/Rules.md §8).
- **Business API inbound messages are counted, not read.** Exactly as with the
  QR tier: the webhook records that messages arrived and updates the counters,
  and deliberately never touches the message text. Phase 7 (router) and Phase 9
  (inbox) are where that becomes legitimate.
- **The webhook always answers 200, even when handling fails.** That stops Meta
  retrying forever, but it also means a bug there is invisible except in the
  server log. Once there is real monitoring (Phase 14), failures here should
  raise something louder.
- **No rate limit on the Business API "send a test message" route** — same gap
  as the QR one, and it should be fixed in the same pass.
- **Phase 6 is not signed off either: no Meta app to test against.** Everything
  testable here passes, including a real call to Meta that correctly rejected a
  bogus token. What remains is a live round trip. **Action for the product
  owner:** create a Meta app with WhatsApp added and a test number registered;
  deploy somewhere with a public HTTPS address (Meta will not call
  `localhost`); in Connect WhatsApp paste the phone number ID, access token and
  app secret; then take the callback URL and verify token that screen gives back
  and enter them in Meta under WhatsApp → Configuration, subscribing to the
  `messages` field. Nothing goes in `.env` — it is all per account now.
- **A customer who doesn't enter their app secret cannot receive anything.** The
  webhook refuses everything it cannot verify — deliberately, since accepting
  unsigned payloads would let anyone write to that account. The field is
  therefore required when saving credentials, and the form explains why. If a
  customer reports missing inbound messages, check their webhook is configured
  in Meta and subscribed to the `messages` field.
- ~~Meta's onboarding model~~ — **ANSWERED by the product owner on 2026-09-04:
  each customer brings their own Meta app and their own app secret, and
  QR-tier customers need nothing from Meta at all.** Phase 6 was reworked to
  match; see the Decisions log. This closes one of docs/PRD.md §10's open
  questions.
- **`META_GRAPH_API_VERSION` defaults to `v21.0`.** Meta retires versions on its
  own schedule and this default will age. It is an env var precisely so it can
  be bumped without a code change — but check it is current before launch.
- **Template messages are not implemented.** Only plain text is sent, which is
  the right thing for replying inside an open conversation. Messages that
  *start* a conversation generally need a template Meta has approved; that
  arrives with campaigns in Phase 12, where the approval rules matter
  (docs/Rules.md §8).
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
9. **Superseded 2026-09-05.** The provider is Google Gemini, chosen by the
   product owner; `GEMINI_API_KEY` is the variable in `.env.example`. See
   decision 37.
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
    on purpose: the QR tier's ban risk is described the way docs/PRD.md §7.1
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
33. **Credentials are entered by hand, not through Meta's Embedded Signup.**
    Meta offers a hosted flow that would create the app and number for the
    customer; it needs a reviewed Meta app and business verification, which
    doesn't exist yet. Pasting the values from Meta's console works today and
    needs nothing from Meta up front. docs/PRD.md §10's question about Business
    API onboarding was **answered on 2026-09-04** — each customer brings their
    own Meta app — so this is now the decided approach rather than a stopgap.
    Adopting Embedded Signup later would replace the form and nothing below it.
34. **`META_GRAPH_API_VERSION` defaults to `v21.0`** and is an environment
    variable rather than a constant. Meta retires versions on its own schedule,
    so this is the one thing that will need changing on someone else's timetable.
35. **The WhatsApp Business Account ID is optional.** Sending needs only the
    phone number ID and the token; the WABA id is stored because it makes
    support conversations easier, and the form says so rather than demanding it.
36. **The webhook address is derived from the incoming request**
    (`x-forwarded-host`/`host`, with `AUTH_URL` preferred when set) rather than
    being configured. It is then right in development, on a preview deploy and
    in production without anyone remembering to change it — but note that behind
    a tunnel you should set `AUTH_URL` to the tunnel's address, or the screen
    will show `localhost`.
37. **The test-message box was added to the API tier too**, matching the QR tier
    (assumption 31) and for the same reason: docs/Phases.md's Phase 6 "done when"
    requires proving a message can be sent. Same 500-character cap.
33. **The webhook always answers 200 once a payload is verified**, even when
    processing hit an error. Meta retries anything that isn't a 200, and a retry
    storm would not fix a bug at our end. Failures go to the server log instead.
34. ~~**Inbound messages are counted, not read.**~~ **Superseded in Phase 7.**
    Message text is now stored, because there is finally somewhere for it to go:
    an agent cannot answer a question it may not read, and docs/PRD.md §6
    promises the owner an inbox. The rule became "keep it where the business
    that owns it can see it, and nowhere else" — not in the server logs, and not
    in the Redis payloads that pass through our own infrastructure.
35. **The webhook address is derived from the incoming request**, not hardcoded,
    so it is correct in development, on a preview deploy and in production
    without anyone remembering to change a setting.
36. **The setup guide describes where each value lives in Meta's console but
    does not state Meta's approval requirements as fact.** docs/PRD.md §10 leaves
    those unconfirmed and docs/Rules.md §8 forbids inventing them; the page says
    plainly that we can't speak for what Meta currently requires.
37. **The model provider is Google Gemini** (`gemini-3.8-flash`), chosen by
    the product owner on 2026-09-05, called over plain HTTPS rather than
    through an SDK — it is about forty lines of `fetch`, and every dependency is
    something the product owner has to trust (docs/Rules.md §1). The model id
    and the base URL are both environment-overridable, so switching provider or
    pointing at a gateway is a change to `lib/ai-client.ts` and nothing else.
38. **An agent signals a handover with a marker word** (`HANDOFF` on a line of
    its own) rather than us reading a reply and judging whether it "sounds
    unsure". Guessing would be wrong often enough to matter. The marker is
    stripped before the customer sees anything.
39. **A thread that has been handed over stays handed over** until the owner
    presses "My agent can carry on". The agent talking over a person mid-thread
    is the bot loop docs/Rules.md §5 forbids — but without a way back it would
    be a one-way door, so the button exists in Phase 7 even though proper human
    takeover is Phase 9.
40. **Anything that isn't text gets one sentence and a handover.** A photo or a
    voice note is recorded in the thread as a short description ("Sent a
    photo."), the customer is told plainly that we can only read text, and a
    person picks it up. Guessing at what was in it would be inventing the
    customer's message.
41. **An agent is shown the last 20 turns of a thread**, not all of it. A
    WhatsApp conversation can run for months; sending all of it would cost more
    on every reply without helping answer what was just asked.
42. **A business may keep up to 100 knowledge-base answers.** Every one of them
    is sent to the model on every message, so an unbounded list would quietly
    make each reply slower and dearer. Far more than the FAQs a small business
    actually has — say the word if that's wrong.
43. **The knowledge base replaces the whole list on save**, in one transaction.
    The editor hands back the complete list every time and the rows have no
    meaning apart from their order; a failure halfway leaves the old list
    intact rather than half a knowledge base.
44. **Conversations is read-only in Phase 7** apart from clearing a handover.
    The "done when" needs the exchange to be *visible*; watching it live and
    typing back is Phase 9 and the page says so.
45. **No agent has been given an integration it does not have.** docs/PRD.md §5
    lists a calendar for the Appointment agent, an orders system for Support, a
    catalogue and checkout for Sales and the Personal Shopper — none of which
    exists in ChatWise yet. Rather than pretend, each agent works from the setup
    answers and the knowledge base, and is told plainly in its own prompt what it
    cannot see. The Appointment agent takes a booking *request* and hands over;
    it never says a time is free. **This is the single biggest thing to confirm
    with the product owner**: it means the Appointment agent does not book, and
    the Support agent cannot look an order up, until those integrations are
    built.
46. **Every agent may read the knowledge base**, not only the Receptionist. It is
    the business's own answers in its own words, and docs/Rules.md §5 names it as
    the thing a bot answers from. Each agent still sees only *its own* setup
    questions, so the Receptionist never gets a checkout link.
47. **The CRM agent runs on every account and on every inbound text message** —
    including on a thread a person has taken over, because a record that stops
    keeping up the moment a human steps in is wrong exactly when it matters. It
    does not run on photos or voice notes, or before setup is finished. This is a
    second model call per message: real money, and the answer to the open
    question below about whether it should be bundled with every plan.
    **One exception:** accounts running the Internal agent, whose messages come
    from the business's own staff. A CRM record is a customer record, and a leads
    list full of colleagues scored out of a hundred would be worse than useless.
48. **A field a person edited by hand is the agent's business no longer.** The
    `Lead` table records which fields a human touched; the CRM agent's writes
    skip them (docs/Rules.md §5). Decided in `lib/leads.ts` rather than asked for
    in a prompt — an instruction a model is asked to follow is a request, not a
    protection. `letTheAgentUpdateThis` is the owner's explicit per-lead waiver.
    Phase 10's screens only have to record *which* fields a person edited.
49. **The `Lead` table arrived in Phase 8, not Phase 10.** The CRM agent had to
    write somewhere for Phase 8's "done when" to mean anything. Phase 10 builds
    the screens on top of it and may well add columns; nothing about the table is
    meant to be final.
50. **Photos and voice notes are still handed to a person**, unchanged from
    Phase 7 — including for the Personal Shopper, where someone sending a picture
    of what they want is an obvious thing to do. That was flagged as an open
    question to decide before this phase; it stays as it was.
51. **The Internal agent cannot tell who is messaging it.** It answers on the
    business's own WhatsApp number, and a phone number proves nothing, so its
    prompt refuses to share what the owner marked private no matter who appears
    to be asking, and hands anything that reads like a customer to a person. If
    an account really is running the Internal agent on a public number, that is
    worth the owner knowing.

52. **The inbox polls; it does not stream.** Ten seconds for the list, five for
    an open thread, and neither runs while the tab is in the background. A
    socket or a realtime service would be a new moving part in the stack
    (docs/Rules.md §1) and the app is serverless besides. Revisit with real
    traffic, as a proposal rather than a tweak.
53. **Typing a reply is taking over.** There is no way to send a message from
    the inbox and leave the agent answering as well. Two of them replying to the
    same customer is the bot loop docs/Rules.md §5 is about, and a person who
    has just answered somebody is the one who should carry on.
54. **A person's reply that failed to send is not recorded.** The router does
    record failed sends — by then there is nobody to tell. Here there is, so
    they get the reason instead of a thread that shows the customer a message
    they never received.
55. **Handing a thread back is always deliberate.** Nothing times out, and
    nothing re-enables the agent on its own. A customer being answered by a
    person and then, mid-sentence, by a bot again would be worse than a thread
    that sits waiting.
56. **The inbox shows the last 100 threads and no more.** No search, no paging.
    Both are worth having; neither is what Phase 9's "done when" asks for, and a
    screen that quietly loads thousands of rows is worse than one that says what
    it shows.
57. **Unread is per account, not per person.** `unreadCount` clears when anyone
    at the business opens the thread. Team members are a later feature
    (docs/PRD.md §6, Settings), and per-person read state is theirs to bring.

58. **A field becomes a person's only when they change its value.** Not when
    they open the form, and not when they save it unchanged. The alternative —
    claiming every field on screen — would switch the CRM agent off the first
    time anybody touched a lead, which is the opposite of what docs/Rules.md §5
    is protecting.
59. **The waiver is per lead, not per field.** `letTheAgentUpdateThis` hands the
    whole record back to the agent. Per-field waivers are conceivable and the
    schema would take them; nothing has asked for one, and a screen with a
    checkbox beside every box is worse than one with a single clear sentence.
60. **Leads cannot be created or deleted by hand.** They exist because a
    conversation happened, one per thread, and they go when the conversation
    goes. A lead with no conversation behind it would have nothing for the agent
    to keep up to date.
61. **The leads list shows 200 rows, filtered by status, with no search.**
    Phase 10's "done when" asks for a table that populates and can be managed;
    search and paging are worth having and are not that. The filter is
    server-rendered links, so it costs no JavaScript.
62. **The leads screen is not live.** Unlike the inbox, nothing here changes
    second by second, and a table that reshuffles under somebody's cursor while
    they read it is worse than one that waits to be reloaded.

63. **Analytics queries the real rows every time.** No metrics table, no
    counters, no nightly rollup. Right for this size of product and wrong at
    some larger one — the answer-time calculation pulls the most recent 5,000
    messages in the window into memory. When an account's numbers get slow,
    that is the signal to build a rollup, not before (docs/Architecture.md §5d).
64. **"Per-agent breakdown" means per *author*.** docs/PRD.md §6 asks for one,
    but an account runs exactly one agent (§3.1), so the useful split is who
    sent the reply: the agent, you by hand, or ChatWise apologising. That is
    what the screen shows.
65. **Handovers are shown as a snapshot, not a history.** "Waiting for you"
    counts threads paused *right now*. Nothing records that a thread was handed
    over and later resumed, so a count of handovers in a period would be wrong;
    the screen says "right now" rather than implying otherwise. A history table
    is the fix if anyone ever wants the trend.
66. **Conversion is customers ÷ all leads, not leads in the window.** Somebody
    who first wrote six weeks ago can buy today, and windowing the pipeline
    would hide exactly the slow conversions a business most wants to see.
67. **No charting library.** Three bars made of a div are the whole
    requirement, and a dependency the product owner has to trust
    (docs/Rules.md §1) should buy more than that.
68. **Busiest times of day, and usage against plan limits, are not built.** The
    Phase 11 placeholder screen had promised both. The first is not in
    docs/Phases.md; the second needs plan limits, which are Phase 13.

15. **Google and password sign-ins are not auto-linked.** If someone signs up
    with a password and later clicks "Continue with Google" using the same
    address, they are told to use their password instead, rather than the two
    being silently merged — silent linking is how account-takeover happens when a
    provider's email verification can't be trusted.

### Still open — please answer before the phase that needs them


These are docs/PRD.md §10's open questions. None blocked Phase 0.

| Question | Needed by |
|---|---|
| ~~Final pricing tiers and per-plan limits~~ - **ANSWERED 2026-09-05: two plans, one per connection tier — Small Business ₹999 and Enterprise ₹1,499, both paid.** The owner set the prices and delegated the limits behind them to this codebase; they are in `lib/plans.ts`. Later the same day the owner also settled the tier model: both connection tiers are paid, the QR tier costs the subscription alone, and the API tier adds Meta's per-conversation charges billed by Meta to the customer. There is no free plan. | ~~Phase 13~~ done |
| ~~Payment gateway~~ - **ANSWERED 2026-09-05: Razorpay.** Built. | ~~Phase 13~~ done |
| ~~Meta WhatsApp Business API onboarding steps~~ — **ANSWERED 2026-09-04: each customer brings their own Meta app; QR tier needs nothing from Meta.** Built. | ~~Phase 6~~ done |
| **Switching bot/connection type** — full re-onboarding on the same account (wiping the old config), an admin-assisted reset, or a new account? docs/Rules.md §6 leans toward "re-setup of the single slot", which is the working assumption. | Phase 4 |
| ~~Is the background CRM agent always included?~~ - **ANSWERED 2026-09-05: always, on every plan.** Making it a paid extra would leave the cheapest plan's leads screen silently empty, which reads as broken rather than as an upsell. | ~~Phase 13~~ done |
| **New:** which email service should send password resets and verification emails (Resend, Postmark, SendGrid, Amazon SES…)? Nothing can email anyone until this is picked. | Whenever "forgot password" is wanted — no later than Phase 14 |
| **New:** is NextAuth v5 **beta** acceptable, or should this drop back to the stable v4? See assumption 10. | Confirm before Phase 14 |
| **Answered 2026-09-05:** the agents run on Google Gemini, `gemini-3.8-flash`, the same model on every plan. `GEMINI_MODEL` overrides it without a code change. Whether a cheaper model belongs on Small Business is still open, and is a pricing question as much as a technical one. | Revisit once real token cost is known |
| **New:** should agents ever handle photos, voice notes or documents? Today they are recorded and handed to a person. **Phase 8 kept it that way** — the Personal Shopper cannot see a picture of what someone wants. | Not blocking; decide before launch |

## Decisions Log

- **Razorpay is called over plain HTTPS, with no SDK.** Their API is basic
  authentication and JSON, and the app already calls Meta's Graph API the same
  way. A dependency is something the non-technical owner has to trust, so it has
  to buy more than a hundred lines (docs/Rules.md §1). Everything Razorpay-shaped
  is in `lib/razorpay.ts`, which is what would be replaced if the provider ever
  changed again.
- **The prices are the owner's; the limits behind them were chosen here.** The
  owner set ₹999 and ₹1,499 on 2026-09-05 and said to decide the features.
  What each plan includes is therefore a decision made in this codebase rather
  than a business fact handed down - it is recorded in `lib/plans.ts` with a
  comment saying so, and changing any number there changes the product with no
  other edit anywhere.
- **A plan's price is display-only; Razorpay holds the real one.** Copying the
  amount into the code would create a second version of the price that can
  silently disagree with the one being charged. The plan file says so, and the
  checkout page shows Razorpay's own figure.
- **Only a signed webhook grants a paid plan.** Opening a payment page grants
  nothing, and neither does returning from one. The only trustworthy news that
  money arrived comes from the company that took it.
- **There are no usage counters.** Usage is counted from the real rows every time
  it is asked for, the same way Analytics works. A counter is a second copy of a
  fact the messages table already holds, and the two drifting apart would mean
  billing somebody for messages they did not send. This is why
  `jobs/usage-billing-sync.ts` was never built.
- **A message limit stops the automation, never the owner.** Hitting the cap
  makes the agent hand threads to a person; replying by hand in the inbox is
  deliberately unlimited. A business that has paid for a plan should never be
  unable to answer its own customer.
- **The out-of-messages sentence is ChatWise's, not the agent's.** Recorded as
  `SYSTEM`, so it cannot inflate the agent's reply counts or answer times with
  work the agent never did.
- **A failed payment does not switch anything off.** Razorpay retries a card for
  days; an expired card should produce a warning in the dashboard, not a silently
  disabled agent mid-conversation. Only an actual cancellation reverts the plan.
- **Nothing is limited when payments are switched off.** An installation with no
  Razorpay keys behaves exactly as it did before Phase 13. Enforcing a plan's
  limits when there is no way to pay for a bigger plan would be a bug wearing a
  business rule's clothes - and it would have made every earlier phase's checks
  start failing for a reason that has nothing to do with them.
- **Invoices are read from Razorpay, never copied.** A local copy could only be a
  second version of the same fact, and it would go stale the moment a refund or a
  correction happened. If Razorpay cannot be reached the list is simply empty,
  because a billing screen that fails to load over an invoice list would be worse.
- **Upgrades take effect now, downgrades at the end of the period.** Somebody who
  pays more expects the bigger limits immediately; taking capacity away from a
  month somebody already paid for would be taking something they own.
- **There is no ContactList table** (a deviation from Architecture §4 as first
  sketched). `CampaignRecipient` *is* the list, and it has to exist anyway for
  tracking - a separate list table would be a second place the same names live.
  Recipients come only from conversations the business already has, so you can
  only ever broadcast to somebody who messaged you first.
- **PostgreSQL is the campaign schedule, not BullMQ** (a deliberate deviation
  from Architecture §1). A queue holding "this person still needs messaging"
  would be a second copy of a fact the database owns, and the two disagreeing
  means somebody is messaged twice.
- **A campaign send interrupted half-way is FAILED, never retried.** When a row
  has been claimed for ten minutes with nothing to show for it, we do not know
  whether the message went out. "Possibly sent twice" is worse than "definitely
  not sent" when the cost is a customer's WhatsApp number.
- **The campaign throttle is our guess, not Meta's.** 45 seconds ± 15 is a
  conservative number chosen here; stating it as WhatsApp policy would be exactly
  the invented compliance claim docs/Rules.md §8 forbids. Flagged for the owner.

- **A number nobody can honestly work out is null, not zero.** No leads means no
  conversion rate, and the tile says "—" plus why. "0%" is a finding; the
  absence of data is not (docs/Rules.md §4). The same rule gives answer time a
  "based on only 2 replies" caveat rather than a confident figure.
- **Analytics reads the rows rather than a metrics store.** One less thing to
  keep in step, and nothing can drift from the truth because there is only one
  copy of it. The volume at which this stops being right is written down in
  docs/Architecture.md §5d so the decision can be revisited on evidence.
- **Both halves of "whose write wins" live in `lib/leads.ts`.** The agent's
  writes and the leads screen's are two sides of one rule (docs/Rules.md §5).
  Splitting them across two modules is how the two sides drift until neither is
  quite the truth. The cost is that the always-on worker host loads a little
  code it never calls; the cohesion is worth more.
- **The lead statuses are a database fact, not an agent fact.** They moved from
  `bots/crm-bot/prompt.ts` to `lib/validation/leads.ts` so the dashboard can
  name them without importing an agent's prompt into the browser
  (docs/Rules.md §2). The agent re-exports them, so nothing else changed.
- **One field decides whether the agent speaks, whoever silenced it.**
  `Conversation.escalatedAt` means "not the agent's thread right now" — the agent
  handed over, or a person took it. `escalatedBy` says which, and changes only
  what the screen says. The alternative, two conditions the router has to check
  before replying, is one forgotten `&&` away from a bot talking over somebody
  mid-conversation.
- **The inbox polls rather than streams.** The app is serverless and cannot hold
  a socket open, and a realtime service is a stack change (docs/Rules.md §1),
  not a detail of one feature. Ten seconds on the list, five on an open thread,
  nothing while the tab is in the background. Revisit against real traffic.
- **A person's failed reply is not written to the thread.** Opposite to what the
  router does with a failed agent reply, and deliberately: the router has nobody
  to tell, the inbox has somebody sitting in front of it.
- **Nothing outbound stores an `externalId`.** That column is UNIQUE so a
  re-delivered inbound webhook cannot become a second message; putting a send's
  id in it would mean a reply the customer already received could fail to be
  recorded. Delivery receipts can add their own column when they are built.
- **Two migrations were renamed to sort correctly.** Phase 8's leads migration
  was timestamped before the Phase 7 migration that creates the table it points
  at, so `migrate deploy` against an empty database would have failed at the
  first deploy. Renaming was the only fix that keeps history honest; the dev
  database's recorded names were updated to match.
- **The CRM agent writes through `lib/leads.ts`, never straight to the database.**
  It proposes an update; that file decides what is actually written, and drops
  anything a person has edited by hand. The protection docs/Rules.md §5 asks for
  had to be code — a rule inside a prompt is a request a model may or may not
  honour, and this one guards a customer's own corrections.
- **The CRM agent answers in JSON, and every field is checked before it lands.**
  An unknown status, a score of 5000, a fifth tag, an email that is not one: each
  is dropped on its own, and the record simply stays as it was. A model having a
  bad day should cost a business nothing.
- **An agent that lacks its integration says so rather than improvising.** The
  Appointment agent takes a booking request and hands over instead of confirming
  a time; Support collects what is needed to find an order instead of claiming to
  have found it. This is the honest version of each job until those integrations
  exist, and the alternative — an agent that sounds like it booked you in — is
  the worst failure this product could have.
- **The words an agent speaks first live with the agent, not with the job that
  sends them.** `composeFollowUpNudge` and `composeFeedbackRequest` sit in their
  own bot folders, so Phase 12's scheduler stays a timer and docs/Rules.md §2
  holds: no prompt text outside `/bots`.
- **The message router runs in a different process on each tier.** The API tier
  runs it in the web app inside `after()` (Meta gets its 200 immediately, before
  the agent starts thinking). The QR tier runs it in the always-on session
  manager, because the serverless app cannot reach a browser session on another
  machine. Consequence: **the worker host needs `GEMINI_API_KEY` too.**
- **Message text is now stored** (Phase 7), reversing the Phase 5/6 position that
  it never travels anywhere. See assumption 34 for why the rule changed and what
  replaced it.
- **`lib/ai-client.ts` calls the provider with plain `fetch`**, no SDK. Rules §1:
  don't add a dependency where a few lines will do.
- **`GEMINI_BASE_URL` exists so the whole pipeline can be tested offline**
  against a stub model. Without it the only way to exercise an agent end to end
  is to spend money on a live one.
- **Knowledge base holds FAQs only; hours stay on My bot.** Both feed the same
  prompt, but each fact has exactly one screen that owns it — two screens
  editing one field is how they quietly stop matching.

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
- **The webhook signature is checked against the raw request bytes**, read with
  `request.text()` before anything is parsed. Hashing a re-serialised copy of the
  parsed JSON would change whitespace or key order and reject payloads that were
  perfectly valid — a bug that only shows up in production, against real traffic.
- **A missing app secret means "reject everything", not "skip the check".**
  Accepting unsigned payloads because we can't verify them would let anyone on
  the internet write to a customer's account (docs/Rules.md §3). Since the
  2026-09-04 rework the secret is the customer's own, stored encrypted, rather
  than a platform environment variable — the rule is unchanged.
- **`phoneNumberId` is UNIQUE across every account, not just per connection.**
  Two accounts claiming one number would make it ambiguous whose message had
  arrived. The database enforces it and `saveCredentials()` turns the resulting
  `P2002` into a sentence a customer can act on.
- **Meta's errors are translated before a customer sees them.** `friendlyError()`
  maps the failures somebody can actually fix (expired token, wrong permissions,
  unknown number, rate limit) to plain English; the full response goes to the
  server log. It says what we observed and what to check, never what Meta's
  policy is (docs/Rules.md §8).
- **Everything above the connectors goes through `whatsapp-connectors/index.ts`.**
  The two tiers are identical everywhere above the connector and nothing alike
  below it, so the seam belongs there. The alternative — each feature asking
  "which tier is this?" — means the same branch in the router, the inbox,
  campaigns and analytics, all of which then have to be found and changed
  together every time a tier rule moves. One `if` in one file instead.
- **`SendOutcome` keeps "sent" and "queued" apart** rather than collapsing them
  into a success flag. The API tier calls Meta and knows; the QR tier hands a
  command to a worker and does not. Reporting "sent" for the second is the
  stale-status trap docs/Rules.md §4 exists to prevent. `failed` and
  `unavailable` are likewise separate because one is worth retrying and the
  other is not.
- **Tier rules live in `capabilities.ts` as data, not as branching.** The
  25-recipient cap has to be enforced in the API route *and* shown in the
  campaigns UI, so the file imports nothing server-only and both read the same
  value — the same split as `lib/onboarding-steps.ts`. Where Meta sets the limit
  rather than us, the value is `null` and says so, because inventing a number
  would be inventing a plan limit (docs/Rules.md §9).
- **The QR adapter checks the session is `CONNECTED` before queueing.** A queue
  accepts anything; an unlinked session would leave the command unanswered and
  the caller told "queued", which is true and useless.
- **The inbound half was deliberately left undone.** Neither connector carries
  message text today, so a normalised inbound shape would have no producer and
  would be invented rather than derived. Phase 7 defines it against a real one.
- **The Business API connector runs inside the web app** — no worker, no Redis,
  no Chromium. It is ordinary HTTPS to Meta, so the whole worker-hosting problem
  below simply doesn't apply to the API tier.
- **A failed send writes `lastError` on the connection.** The dashboard then
  reports the truth rather than a stale "connected" (docs/Rules.md §4), and
  traffic arriving on the webhook clears it back to `CONNECTED`.
- **Each customer brings their own Meta app** (product owner, 2026-09-04),
  which settled docs/PRD.md §10's Meta question. The rework: `META_APP_SECRET`
  and `WHATSAPP_WEBHOOK_VERIFY_TOKEN` were **removed as platform environment
  variables** and became per-connection encrypted columns, and the single
  webhook route was replaced by one address per customer.
- **The per-customer webhook address exists to solve an ordering problem**, not
  for tidiness. With per-customer signing secrets, you cannot verify a payload
  until you know whose it is — and Meta's verification handshake sends only a
  token and a challenge, with no phone number. Identifying the account from the
  URL path is the only thing that works for both the handshake and the payload,
  and it means nothing in an unverified body is ever parsed to decide identity.
- **ChatWise generates the customer's verify token** rather than asking them to
  invent one. Fewer things for a non-technical person to get wrong, and it is
  guaranteed strong. The webhook tokens are generated once and then kept, so
  updating credentials never silently breaks a webhook already configured in
  Meta.
- **Leaving a secret field blank on update means "keep the current one".** The
  customer was never shown either secret, so they cannot retype them.
- **The signature is checked over the raw request bytes**, not a re-serialised
  copy of the parsed JSON. Re-serialising can change whitespace or key order,
  which would break a valid signature — and, worse, tempt someone into relaxing
  the check. There is a test that a signature over even one extra byte is
  refused.
- **The webhook gives away nothing on failure** — a bad verify token or a bad
  signature both get a bare 403, so someone probing it learns nothing about how
  close they were.
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
| What an agent says, or how it behaves | `bots/<agent>-bot/prompt.ts` — never a page or a route |
| Rules every agent shares (no inventing, always a way out) | `bots/shared/prompt-shared.ts` |
| Which agents have actually been built | `bots/shared/handlers.ts` — all nine, since Phase 8 |
| Asking the model, and coping when it cannot answer | `bots/shared/run-agent.ts` (shared by all nine) |
| The always-on CRM agent | `bots/crm-bot/` — reads a transcript, answers in JSON, speaks to nobody |
| What the CRM agent is allowed to overwrite | `lib/leads.ts` — a field a person edited stays theirs |
| What a person may change about a lead | `lib/validation/leads.ts` (checks + the five statuses) |
| The leads screens | `app/dashboard/leads/`, `components/dashboard/lead-editor.tsx` |
| Where a number on a dashboard came from | `lib/analytics.ts` — it counts rows, nothing is stored |
| What happens to an inbound message | `message-router/router.ts` |
| Reading a thread, taking it over, replying by hand | `lib/conversations.ts` |
| The live inbox screens | `components/dashboard/inbox-list.tsx`, `components/dashboard/conversation-thread.tsx` |
| Which model is called, and how failures are worded | `lib/ai-client.ts` |
| **A price, or what a plan includes** | `lib/plans.ts` - the only file to edit. Safe for the browser; holds no secrets |
| Anything to do with Razorpay | `lib/razorpay.ts` - the only file that talks to it |
| Which plan an account is on, and how that changes | `lib/subscription.ts` |
| Whether an account may send/save/connect any more | `lib/usage.ts` - counted from real rows, never from a counter |
| Where a payment is recorded as having happened | `app/api/billing/webhook/route.ts` - the only path to a paid plan |
| The billing screen | `app/dashboard/billing/page.tsx`, `components/dashboard/plan-picker.tsx` |
| The rules a bulk send has to obey | `campaigns/send-campaign.ts` (`buildCampaign`) |
| How far apart bulk messages go out | `campaigns/throttle.ts` - our own number, not Meta's |
| STOP / unsubscribe handling | `campaigns/opt-out.ts` |
| What actually sends a campaign | `jobs/campaign-sender.ts`, on the always-on host |
| The FAQs an agent may answer from | `lib/knowledge-base.ts`, `/dashboard/knowledge-base` |
| Form/input rules and the open-redirect guard | `lib/validation/auth.ts` |
| The shape every API error takes | `lib/api-response.ts` |
| The log-in and sign-up screens | `app/(auth)/` and `components/auth/` |
| Public website copy and layout | `app/(marketing)/` and `components/marketing/` |
| The header/footer on public pages | `components/marketing/site-header.tsx`, `site-footer.tsx` |
| Plan contents and the pricing placeholder | `components/marketing/pricing-plans.tsx` |
| FAQ questions and answers | `components/marketing/faq-list.tsx` (`FAQ_GROUPS`) |
| The agent list shown to visitors | `components/marketing/agent-catalog.tsx` |
| Which agents exist, and their setup questions | `bots/<agent>-bot/config-schema.ts` + `bots/shared/bot-catalog.ts` |
| Adding a new agent | add its folder + one line in `bots/shared/bot-catalog.ts` + one in `bots/shared/handlers.ts` + a value in the `BotType` enum |
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
| Meta's webhook (signature checks, routing) | `whatsapp-connectors/business-api/webhook-handler.ts` |
| A customer's own webhook address | `app/api/whatsapp/business-api/webhook/[token]/route.ts` |
| Storing/verifying a customer's Meta credentials | `whatsapp-connectors/business-api/credentials.ts` |
| Sending over the Business API | `whatsapp-connectors/business-api/send-message.ts` |
| Meta's error messages in plain English | `whatsapp-connectors/business-api/graph-api.ts` |
| The Graph API version | `META_GRAPH_API_VERSION` in `.env` |
| Anything the app says to Meta | `whatsapp-connectors/business-api/graph-api.ts` |
| Storing / verifying API credentials | `whatsapp-connectors/business-api/credentials.ts` |
| Sending over the Business API | `whatsapp-connectors/business-api/send-message.ts` |
| What happens when Meta calls us | `whatsapp-connectors/business-api/webhook-handler.ts` + `app/api/whatsapp/business-api/route.ts` |
| The webhook address a customer is shown | `app/dashboard/connect-whatsapp/page.tsx` (`webhookUrl()`) |
| The API-tier credentials form and guide | `components/dashboard/api-connect.tsx` |
| Finding the signed-in customer's connection | `lib/whatsapp-connection.ts` |
| Which Graph API version is called | `META_GRAPH_API_VERSION` in `.env` |

## How to Run This

Three levels: the app alone, the app plus the QR WhatsApp tier, and the app
plus the Business API tier. **An account is one tier or the other, never both**
— which one it gets is chosen in setup Step B, and the Connect WhatsApp screen
shows only that tier.

### 1. The app on its own

Nothing here needs WhatsApp, Redis or Chrome. Node.js 24 (Node 20.19+ is enough
if you never run the QR worker — see step 2) and a PostgreSQL database.

```bash
npm install
cp .env.example .env
```

Fill in, in `.env`:

| Variable | Where it comes from |
|---|---|
| `DATABASE_URL` | Supabase's **pooled** URL (port 6543) |
| `DIRECT_URL` | Supabase's **direct** URL (port 5432) — migrations only |
| `AUTH_SECRET` | `openssl rand -base64 32` |

```bash
npm run db:migrate     # create the tables
npm run dev            # http://localhost:3000
```

Sign up at <http://localhost:3000/signup>, and check
<http://localhost:3000/api/health> says `"database": "connected"`. No local
Postgres? `npx prisma dev --name chatwise --detach`, then `npx prisma dev ls`
for its URL — note it picks a new port each time it is created.

### 2. Running the QR tier (QR code)

Needs a Redis, a Chrome/Chromium on the machine, and a second process. Pick
"Scan a QR code — for small businesses" in setup Step B.

```bash
docker run -p 6379:6379 redis        # or an Upstash / Railway free tier
```

Add to `.env`:

| Variable | Value |
|---|---|
| `REDIS_URL` | e.g. `redis://localhost:6379` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` — encrypts the saved session |
| `CHROME_PATH` | path to an installed Chrome/Chromium |

Then two terminals:

```bash
npm run dev
npm run whatsapp-worker
```

Dashboard → **Connect WhatsApp** → Connect → scan the code with the phone's
WhatsApp (Linked devices). Use the "send a test message" box to prove it works.

The worker runs TypeScript directly under plain Node, so **this half needs
Node 22.18+/24** (assumption 28). With Redis unreachable the page says so and
the routes return 503 rather than hanging — that is deliberate, not a bug.

### 3. Running the API tier (WhatsApp Business API)

No Redis, no Chrome, no second process — it is ordinary HTTPS to Meta from
inside the web app. Pick "Paid — WhatsApp Business API" in setup Step B.

**There are no per-customer Meta settings in `.env`.** Since the 2026-09-04
rework each customer brings their own Meta app and enters everything in the
dashboard. Only two variables matter here, and both are optional-ish:

| Variable | Value |
|---|---|
| `ENCRYPTION_KEY` | `openssl rand -base64 32` — encrypts the access token *and* the customer's app secret. Required. |
| `META_GRAPH_API_VERSION` | Optional; defaults to `v21.0` |

Meta has to be able to *reach* the webhook, so for local testing put a tunnel in
front of the app and tell the app its public address:

```bash
npm run dev
cloudflared tunnel --url http://localhost:3000    # or: ngrok http 3000
# then set AUTH_URL="https://<the tunnel address>" in .env and restart npm run dev
```

In Meta's developer console, collect four things — **WhatsApp → API Setup** has
the **phone number ID**, the **WhatsApp Business Account ID** and an **access
token** (the temporary one there is fine for a first test; a number you rely on
needs a permanent one), and **Settings → Basic** has the **app secret**.

Then in ChatWise: Dashboard → **Connect WhatsApp** → paste those in → Save.
Saving calls Meta straight away, so a wrong value fails there and then. The
screen then hands back **that account's own webhook address**
(`/api/whatsapp/business-api/webhook/<their token>`) and **its own verify
token** — take both back to Meta under **WhatsApp → Configuration → Webhook**,
and **subscribe to the `messages` field**. Meta calls `GET` once to check you
own the endpoint. Finish with the "send a test message" box.

**Sanity checks if it misbehaves:** a 403 from the webhook means the signature
or verify token didn't match *for that customer's app*; a rejected token is
almost always an expired temporary one; and nothing inbound at all usually means
the `messages` subscription was never ticked.

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
looks precisely like a mobile layout bug and is not one.

**Since Phase 14 the iframe trick below no longer works**, and that is correct
rather than broken: every page now sends `frame-ancestors 'none'`, which is
what stops somebody putting the dashboard in an invisible iframe on their own
site. To use the iframe method, comment that directive out of `next.config.ts`
for the duration and put it straight back. Otherwise 500px is below every
breakpoint the layout uses (`sm:` is 640px), so it exercises the narrow layout
perfectly well on its own.

Also note the screenshot path must be a **Windows** path with backslashes —
Chrome will not write to a path written the Git Bash way, and says only "Access
is denied".

The iframe method, for when it is needed:

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
- **In progress / left off at:** nothing mid-flight. Phase 5 (the QR
  WhatsApp connection) is next, once the product owner has tested Phase 4.
- **New assumptions or decisions:** the `my-bot` rename; re-setup means
  reopening the wizard on the same account with answers kept; the dashboard stays
  closed until a re-setup is finished. All expanded above.
- **Anything broken:** no. Two things to note: **placeholder screens currently
  name internal build phases** and should be softened before real customers see
  them, and after starting a re-setup a direct visit to `/dashboard` lands on
  Step D rather than Step A. Both are under Known Issues.

## Session Update — 2026-09-04 (Phase 5)

- **Worked on:** Phase 5 — the QR-tier WhatsApp connection.
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
#      ENCRYPTION_KEY     openssl rand -base64 32
#      CHROME_PATH        path to an installed Chrome/Chromium
#      ANTHROPIC_API_KEY  needed HERE too, not just by the web app — from
#                         Phase 7 the message router runs inside the manager

# 3. Two terminals:
npm run dev
npm run whatsapp-worker

# 4. Open the dashboard → Connect WhatsApp → Connect, and scan the code.
```

*(Superseded by "How to Run This" above, which covers both tiers.)*

## Session Update — 2026-09-04 (Phase 6)

- **Worked on:** Phase 6 — the API-tier WhatsApp connection (official Business
  API).
- **Completed:** The whole `business-api` connector — `graph-api.ts`,
  `credentials.ts`, `send-message.ts`, `webhook-handler.ts` — plus the public
  webhook route (`GET` ownership challenge, signature-checked `POST`), the
  credentials route (verify with Meta, store encrypted, disconnect), a
  send-test route, the `WhatsAppApiCredential` table and its migration,
  `lib/whatsapp-connection.ts` shared by both tiers, and the API-tier Connect
  WhatsApp screen with its setup guide and copyable webhook address.
- **Verified:** `npm run build` and `npm run lint` both clean with everything in
  place. Every route goes through `requireApiConnection()`, which finds the
  connection from the session rather than the request and refuses QR-tier
  accounts; no route returns an access token in any form.
- **NOT verified — needs the product owner:** a real exchange with Meta. There
  is no Meta app and no public URL on this machine, so nothing has ever been
  sent to or received from WhatsApp on this tier. Section 3 of "How to Run This"
  is the exact recipe; Known Issues says what is missing.
- **Superseded later the same day** by the per-customer Meta app rework — see
  the session entry below. This entry describes a platform-wide Meta app, which
  is no longer how it works.
- **New assumptions or decisions:** credentials pasted by hand rather than
  Meta's Embedded Signup (which needs app review that doesn't exist yet); the
  Graph API version made an environment variable; the signature checked over raw
  request bytes; a missing app secret means reject-everything; `phoneNumberId`
  unique across all accounts; the webhook address derived from the request. All
  expanded above.
- **Anything broken:** no. The gap is entirely outside accounts and a public
  address. Note that the **README's "Current status" section still says Phases
  0–4** and doesn't mention Phase 6 — worth a pass next session.

## Session Update — 2026-09-04 (Phase 6)

- **Worked on:** Phase 6 — the paid WhatsApp Business API tier.
- **Completed:** The whole `business-api` connector — Graph API client with
  plain-English error translation, encrypted credential storage that is verified
  against Meta before saving, message sending, and the public webhook with HMAC
  signature verification and multi-tenant routing. Plus the credentials form and
  setup guide on Connect WhatsApp, and three API routes.
- **Verified:** 25 webhook/security checks (verification handshake, unsigned and
  wrongly-signed payloads refused, signature over altered bytes refused,
  multi-tenant routing correct, tokens unreadable in the database, duplicate
  phone numbers refused) and 23 route checks — including a genuine call to
  Meta's live API that correctly rejected a bogus token. Build and lint clean.
- **NOT verified — needs the product owner:** a live round trip with a real Meta
  app and test number, which also needs a public HTTPS address since Meta will
  not call localhost.
- **New assumptions or decisions:** one ChatWise-owned Meta app rather than one
  per customer (this is the concrete form of docs/PRD.md §10's open question and
  changes how signatures would be verified); plain text only, no templates until
  Phase 12; the webhook always answers 200 once verified.
- **Anything broken:** no.

## Session Update — 2026-09-04 (Phase 6 rework)

- **Worked on:** reworking Phase 6 after the product owner answered
  docs/PRD.md §10 — **each customer brings their own Meta app and app secret;
  QR-tier customers need nothing from Meta.**
- **What changed:** `META_APP_SECRET` and `WHATSAPP_WEBHOOK_VERIFY_TOKEN` are no
  longer environment variables at all. The app secret is now a per-connection
  encrypted column, and each customer gets their own webhook address
  (`/api/whatsapp/business-api/webhook/<token>`) plus a verify token we generate
  for them. The single platform webhook route was deleted and replaced.
- **Why the address had to become per-customer:** with per-customer signing
  secrets, a payload can't be verified until you know whose it is — and Meta's
  verification handshake carries no phone number. The path is the only
  identifier available at that moment.
- **Verified:** 23 isolation checks — including that **one customer's app secret
  cannot sign another customer's webhook** — plus 17 tier-separation and
  validation checks, all with **no platform Meta variables set**. The QR tier's
  Connect screen was confirmed to mention no app secret, no phone number ID and
  no webhook. Build and lint clean.
- **Anything broken:** no. The migration adding the required columns was written
  by hand and applied with `migrate deploy`, because `migrate dev` needs an
  interactive prompt this environment can't provide; the table was empty, so no
  backfill was needed.

## Session Update — 2026-09-04 (shared connector interface)

- **Worked on:** the seam between the two tiers, before Phase 7 starts leaning
  on the connectors directly.
- **Completed:** `whatsapp-connectors/index.ts` — `connectorFor("QR" | "API")`
  returning something with `sendText()` — and `whatsapp-connectors/capabilities.ts`,
  which holds the rules that genuinely differ (the 25-recipient cap, throttling,
  template approval, delivery receipts) as **data**. Both send-test routes were
  rewired through it, so it has real callers rather than being scaffolding.
  `whatsapp-connectors/README.md` and docs/Architecture.md §3 updated to match.
- **Why now:** the two tiers are the same everywhere above the connector and
  completely different below it. Without a seam, Phase 7's router would open
  with `if (type === "QR")`, and that branch would then be repeated in the
  inbox, campaigns and analytics. This is a refactor of code that already
  exists, with callers today — not Phase 7 work brought forward
  (docs/Rules.md §9).
- **Deliberately not done:** the inbound half. Neither connector carries message
  text yet, by design (docs/Rules.md §4), so a normalised inbound shape would
  have no producer. Define it in Phase 7, when the router needs it.
- **New assumptions or decisions:** `SendOutcome` keeps `sent` and `queued`
  apart rather than flattening them to a boolean; capabilities are browser-safe
  data; the QR adapter checks the connection is `CONNECTED` before queueing.
  All expanded in the Decisions Log.
- **Anything broken:** no — `tsc --noEmit`, lint and build all clean. **Note for
  whoever is next:** this session and the per-customer Meta app rework above ran
  in parallel, and the earlier Phase 6 entries in this file were written before
  that rework landed. Stale references to `META_APP_SECRET` /
  `WHATSAPP_WEBHOOK_VERIFY_TOKEN` as platform variables have been corrected, but
  **README.md is still out of date** on both counts.

---

## Session Update — 2026-09-04 (Phase 7)

**Built:** the Receptionist end to end, the message router, a minimal knowledge
base, and a read-only Conversations view.

- `bots/receptionist-bot/prompt.ts` + `handler.ts`; shared agent rules in
  `bots/shared/prompt-shared.ts`; a registry in `bots/shared/handlers.ts` that is
  deliberately a `Partial` record, so TypeScript makes every caller handle "that
  agent isn't built yet".
- `message-router/router.ts` — one entry point, called by both connectors, which
  pass in their own way of delivering the reply. It never throws at its caller.
- `lib/ai-client.ts` — plain `fetch`, no SDK; logs status codes and never
  message contents.
- Migration `20260904190000_conversations_messages_knowledge_base`.
- Knowledge base page and `/api/knowledge-base`; Conversations list, thread and
  `/api/conversations/[id]`.

**Verified:** 94 automated checks, all passing — 60 against the router with a
stub model, 34 over real HTTP against a running app. The interesting ones:

- a repeat webhook delivery is answered **once** (unique `externalId`, and the
  insert is skipped rather than raised, so a busy day doesn't fill the logs)
- one account's knowledge base never appears in another account's prompt
- a customer writing "ignore your instructions" arrives as a user turn, never
  as system text, and the agent was warned about exactly that
- an agent that hasn't been built yet produces a holding reply credited to
  nobody — no invented Sales answer
- when the model is unreachable the customer still gets a sentence, it is stored
  as `SYSTEM` rather than passed off as the agent, and the thread is flagged
- a signed webhook reaches the router and lands in the inbox word for word; an
  unsigned one is refused and records nothing

**One test assertion of mine was wrong, not the code:** I asserted the newest
message would be the last turn sent to the model verbatim. It is merged with the
customer's previous unanswered message, which is correct — people send three
messages in a row on WhatsApp and a model needs the sides to alternate.

**Still needs the product owner:** an `ANTHROPIC_API_KEY` (the worker host needs
it too), and a connected number. Nothing has proven how *good* the Receptionist's
answers are — every check used a stub model, so what is verified is the plumbing
and the guard rails.

## Session Update — 2026-09-04 (Phase 8)

**Built:** the eight remaining agents, the always-on CRM agent, and the lead
record it writes to.

- `bots/<each>/prompt.ts` + `handler.ts` for Lead Qualifier, Appointment, Sales,
  Support, Follow-up, Personal Shopper, Feedback and Internal. Registered in
  `bots/shared/handlers.ts`. **The message router did not change to gain them** —
  only to call the CRM agent.
- `bots/shared/run-agent.ts` — the ask-the-model-and-cope half that all nine
  share, so each agent's folder holds only what makes it that agent. The
  Receptionist's handler was moved onto it and is now six lines.
- `bots/shared/prompt-shared.ts` gained `describeNow` (every agent is told the
  date in the business's own timezone — an agent asked "are you open tomorrow?"
  needs to know what tomorrow is) and labelled setup answers, so a prompt reads
  "How much notice the business needs: At least a day" rather than
  "noticeRequired: 24h".
- `bots/crm-bot/` — reads a transcript, answers in JSON, never speaks to anyone.
  `lib/leads.ts` decides what of that actually gets written.
- Migration `20260904180048_add_leads_for_crm_agent` — the `Lead` table, which
  Phase 10's screens will sit on top of.

**Verified:** 159 automated checks against a stub model, all passing. The ones
worth knowing about:

- each of the nine agents is asked *its own* instructions, and every account's
  setup answer appears in exactly one agent's prompt across the whole run
- the customer's message is always a user turn, never system text
- a thread waiting for a person gets no reply — and its CRM record still keeps up
- a CRM answer of `{"status": "SOMETHING_ELSE", "score": 5000, "email": "not-an-email"}`
  changes nothing at all
- a name a person typed into a lead survives the agent; setting
  `letTheAgentUpdateThis` lets the agent have it back
- with the model unreachable the customer still gets a sentence, stored as
  `SYSTEM` rather than passed off as the agent

**Deliberately not built:** the scheduler that makes the Follow-up and Feedback
agents speak first. That is Phase 12 (`jobs/follow-up-scheduler.ts`), and
building it now would be skipping ahead (docs/Rules.md §9). What those two
agents would *say* is written and tested — `composeFollowUpNudge` and
`composeFeedbackRequest` — so the job, when it comes, is a timer and nothing
more.

**Still needs the product owner:** the same `ANTHROPIC_API_KEY` and connected
number as Phase 7, plus a decision on whether the always-on CRM agent belongs in
every plan now that it is a second model call per message. And nobody has read a
real reply from any of these agents yet.

### Template for each new session's update (copy/paste and fill in):

```
## Session Update — 2026-09-05 (Phase 9)

**Built:** the live Conversations inbox, and everything needed for a person to
step into a conversation the agent is having.

- `lib/conversations.ts` — the whole of it in one place: read a thread, take it
  over, hand it back, mark it read, reply by hand. Every function takes the
  signed-in account's `businessId` and puts it in the WHERE clause next to the
  conversation id, so another account's thread is not "refused", it simply
  isn't there (docs/Rules.md §3).
- `app/api/conversations/` — three thin routes over that: the list, the
  take-over/hand-back/mark-read PATCH, and messages (GET to poll, POST to send).
- `components/dashboard/inbox-list.tsx` and `conversation-thread.tsx` — the two
  screens, both watching. The empty "nothing yet" state lives inside the list
  rather than the page, so an account waiting for its very first message watches
  for it too.
- `message-router/router.ts` — two small changes: count a genuinely new message
  as unread, and record that a handover came from the agent.
- Schema: `HandoverSource`, `Conversation.escalatedBy`, `Conversation.unreadCount`
  (migration `20260904190200_conversations_human_takeover`). Noted here per
  docs/Rules.md §9.

**Two things found on the way, both worth knowing:**

1. **The migration chain could not build a database from empty.** Phase 8's
   leads migration was named `20260904180048`, earlier than the Phase 7
   migration `20260904190000` that creates the `conversations` table it
   references — so Prisma's replay failed, and `migrate deploy` on a fresh
   database would have failed the same way on the first real deploy. Both that
   migration and the new one were renamed to sort after their dependency, and
   the dev database's recorded names updated to match. The chain now replays
   from empty.
2. **Nothing outbound should carry an `externalId`.** The first version stored
   the id a send returned; the checks caught that the column is UNIQUE across
   the whole table, which means an outbound id can collide and a reply the
   customer has already received would fail to be recorded. Removed, matching
   what the router already did.

**Verified:** 64 automated checks (stub model, stub connector, real dev
database), Phase 8's 159 re-run and still passing, `tsc --noEmit` clean, lint
clean, `next build` clean, `migrate status` up to date.

**Not done, on purpose:** search and paging in the inbox, per-person read state,
attachments, and anything that would re-enable the agent on a timer. See
assumptions 52–57.

**Still blocked on the owner:** an `ANTHROPIC_API_KEY` and a connected WhatsApp
number. Taking over, replying and handing back work without a key; sending has
never touched real WhatsApp.

## Session Update — 2026-09-05 (Phase 10)

**Built:** the Leads / CRM screens, on top of the `Lead` table Phase 8 already
writes to. No schema change was needed — Phase 8 built the table with
`fieldsEditedByHuman` and `letTheAgentUpdateThis` precisely so this phase would
only have to fill them in.

- `lib/validation/leads.ts` — the five statuses, their plain-English labels, and
  every check on what a person types. Browser-safe and free of "@/" shortcuts,
  because both the dashboard bundle and the plain-Node worker host read it.
- `lib/leads.ts` — gained `listLeads`, `countLeadsByStatus`, `readLead` and
  `applyHumanEdit`, next to the agent's `applyAgentUpdate` they have to agree
  with.
- `app/api/leads/[id]/route.ts` — one PATCH, thin over that.
- `app/dashboard/leads/` — the list (status filter, server-rendered, no
  JavaScript) and one lead's own page with the editor.
- `components/dashboard/lead-editor.tsx` — the form, and the thing that makes
  the phase worth having: every field says who owns it.

**The round trip that had to work, and is the thing the checks prove:** the
agent writes a lead on its own; a person corrects the name and the status; the
agent writes again and leaves exactly those two alone while still keeping the
summary, next step and score current; the owner waives the protection and the
agent takes the whole record back; the waiver comes off and the same two fields
are protected again, because waiving never erased the list.

**One thing moved:** `LEAD_STATUSES` lived in the CRM agent's prompt file. The
leads screen needs the same five names, and a dashboard importing an agent's
prompt into the browser to find out what "QUALIFIED" is called is exactly what
docs/Rules.md §2 rules out. They now live in `lib/validation/leads.ts` and the
prompt re-exports them, so every existing importer is untouched.

**Verified:** 48 automated checks (stub model, real dev database), plus Phase
9's 64 and Phase 8's 159 re-run and still passing. `tsc --noEmit`, lint and
`next build` all clean.

**Not done, on purpose:** search, paging, bulk actions, creating or deleting a
lead by hand, and per-field waivers. See assumptions 58–62.

## Session Update — 2026-09-05 (Phase 11)

**Built:** Analytics, and the Overview figures that had been placeholders since
Phase 3.

- `lib/analytics.ts` — one function, `readBusinessNumbers(businessId, period)`,
  answering everything both screens need. It counts Conversation, Message and
  Lead rows directly; there is no metrics store to keep in step.
- `app/dashboard/analytics/page.tsx` — how much came through, who did the
  replying, how long people waited, and what came of it. Period in the address,
  no client JavaScript.
- `app/dashboard/page.tsx` — real headline numbers, and the connection's **real**
  status. It had said "Not connected yet" unconditionally since Phase 3, which
  became a lie the moment Phase 5 could connect a number.
- `components/dashboard/stat.tsx` — the number tile and a bar made of a div,
  shared by both screens.
- `lib/format-when.ts` — gained `formatDuration`, so an answer time reads
  "4 minutes" rather than a millisecond count.

**The judgement calls, all of them about honesty rather than code:**

- Answer time is a **median**, measured from the first message of a run, and
  the tile says how many replies it came from. An average would be ruined by one
  overnight reply, and a median over two data points deserves a caveat rather
  than a bold figure.
- The period governs activity but **not** the lead pipeline — somebody who first
  wrote six weeks ago can buy today.
- "Waiting for you" is a **snapshot**, and says so. Nothing records that a
  thread was handed over and later resumed, so a count of handovers *during* a
  period would be wrong.
- A rate with nothing to divide by comes back **null**, and the screen shows
  "—" with the reason.

**Also updated:** `README.md`, which still described the project as stopping at
Phase 6. It now lists what the dashboard actually does, and is straight about
the gap between "built and checked" and "proven against a real model and a real
WhatsApp number".

**Verified:** 44 new checks against threads with known timings — every window's
counts, the author split, the median including the two-messages-then-one-reply
case, an empty account returning nulls rather than zeroes, and another account's
traffic never appearing in these numbers. Phases 8, 9 and 10's 271 checks re-run
and still passing. `tsc --noEmit`, lint and `next build` clean.

**Not done, on purpose:** busiest times of day, usage against plan limits (needs
Phase 13), CSV export, and any charting library. See assumptions 63–68.

## Session Update - 2026-09-05 (Phases 12 and 13)

**Built:** Campaigns (Phase 12) and Billing (Phase 13), in that order, in one
session.

**Phase 12 - campaigns.** Bulk outreach with every safety rule from
docs/Rules.md §8 enforced in `campaigns/send-campaign.ts` rather than in the
screens: the 25-recipient cap on the QR connection, the mandatory ban-risk
warning, opt-outs checked when the campaign is written *and* again at the moment
each message goes out, an opt-out line appended, approved templates required on
the API tier, and one campaign at a time. Sending happens on the always-on host
(`jobs/campaign-sender.ts`, ticking every 15 seconds), with each message claimed
atomically so two ticks can never both send it. 106 checks.

**Phase 13 - billing.** Mid-session the product owner settled two of the
longest-standing open questions: **Razorpay rather than Stripe**, and prices of
**₹999 and ₹1,499 a month**, with the features behind each tier
delegated to this codebase. So:

- `lib/plans.ts` - two paid plans (Small Business, Enterprise) as plain data, plus
  `NO_SUBSCRIPTION_PLAN` for an account that has not paid. The prices are the
  owner's; every limit is a decision made here, and the file says so. It is the
  single file to edit to change the product's shape.
- `lib/razorpay.ts` - the only file that talks to Razorpay, over plain HTTPS with
  no SDK.
- `lib/subscription.ts` - which plan an account is on; `lib/usage.ts` - what it
  has used, counted from real rows, and whether it may use more.
- `/api/billing/subscription` (start, change, cancel) and `/api/billing/webhook`
  (public, signature-checked, and the only way an account becomes entitled to
  anything).
- Limits enforced where the spending happens: the router, `buildCampaign`, the
  templates and knowledge-base routes, the Business API credentials route, and
  the analytics page.
- 119 checks. All five earlier suites still pass: **540 in total.**

**Schema changes (docs/Rules.md §9).** Phase 12 added `Campaign`,
`CampaignRecipient`, `MessageTemplate`, `OptOut`, their enums and
`MessageAuthor.CAMPAIGN` (`20260905022920_campaigns_templates_optouts`). Phase 13
added `PlanId`, `SubscriptionStatus`, `Subscription` and `BillingEvent`
(`20260905031834_billing_subscriptions`).

**One thing worth knowing about that Phase 13 migration.** A first version was
written against the earlier Stripe assumption (a `BUSINESS` plan, `stripe*`
columns) and applied locally before the owner's message arrived. Rather than
stack a second migration on top of one that had never been committed or
deployed, the folder was deleted and its objects dropped from the local
development database - which had zero rows in it, verified first - so the
committed history contains one correct migration instead of two contradictory
ones.

**Deliberate deviations from docs/Architecture.md, both recorded in the
Decisions Log and now written into §5e and §5f:**

1. **No `ContactList` table.** `CampaignRecipient` is the list.
2. **PostgreSQL is the campaign schedule, not BullMQ.**
3. **No `jobs/usage-billing-sync.ts`.** Usage is counted from the rows on demand,
   so there is nothing to sync.

**Still not proven, and it is the same gap as before:** every check uses a stub
model, a stub WhatsApp connection and a hand-built payment webhook. Nothing has
ever replied to a real customer, gone out to a real number, or taken a real
rupee.

**To finish the sign-off, three non-code things are needed:** an
`ANTHROPIC_API_KEY` (on the worker host too), a connected WhatsApp number, and a
Razorpay account with one monthly Razorpay plan per ChatWise plan — all three
are paid — whose ids go in `RAZORPAY_PLAN_ID_SMALL_BUSINESS` and `_ENTERPRISE`.

**One thing to verify against Razorpay's live documentation** before the first
real plan change: `changeSubscriptionPlan` in `lib/razorpay.ts` is the single
call whose exact shape has moved between their API versions. It fails loudly
rather than silently if it is wrong.

---

## Session Update - 2026-09-05 (Phase 14)

**Built:** the hardening pass. Four additions and one real bug.

**Rate limiting** (`lib/rate-limit.ts`), on signing up, signing in, starting a QR
session, verifying Meta credentials, buying a plan, writing a campaign and
replying by hand. Redis-backed because the web app is serverless; **fails open**
because a Redis blip turning into "nobody can log in" is worse than a window
with no limiting in it. `RATE_LIMITED` had been in the error vocabulary since
Phase 1 and had never once been used.

**Security headers** in `next.config.ts` - CSP, `frame-ancestors 'none'`,
`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS, and
`poweredByHeader: false`. Verified live against the running app.

**`app/global-error.tsx`** and **`app/dashboard/loading.tsx`** - the two gaps in
what a customer sees when something is slow or badly broken.

**The bug:** `bg-surface-raised` was used in nine files and defined in none.
Tailwind v4 generates classes from the `@theme` block, so it produced no CSS at
all, silently. Worth remembering as a *class* of bug: a mistyped design token
does not warn, does not error, and does not show up in a build - it just quietly
does nothing. The checks now compare every colour used against the theme.

**Also fixed:** an invoice's raw Razorpay status (`issued`, `partially_paid`)
was being printed at customers, and `app/`, `lib/` and `prisma/` had no
README.md although docs/Architecture.md §3 says every folder carries one.

**118 checks**, most of them standing audits over the source rather than tests of
behaviour - "every API route checks who is asking" cannot be proved by
exercising the routes you happened to think of. All six earlier suites still
pass: **658 in total.**

**What was checked by eye:** the pricing page at 1440px and at 500px (Chrome on
this machine will not go narrower - see the screenshot note above). Both fine.
**The billing screen has not been screenshotted with a live signed-in account** -
it reuses the same header, card, `Stat` and `Bar` components as Analytics, and
its plan cards are the same shape as the pricing ones that were checked, but
that is an argument rather than a look.

**Left deliberately undone, and worth knowing:**

- The Content-Security-Policy still permits `'unsafe-inline'` and `'unsafe-eval'`
  for scripts, which Next's hydration needs. Removing them means issuing a nonce
  from `proxy.ts` - a real change, not a header tweak, so it is written down
  here rather than half-done.
- Rate limiting does nothing without Redis. That is by design, but it means the
  brake is only on once `REDIS_URL` points at something reachable.
- There is still no email service picked, so there is still no "forgot
  password". That is the oldest open question in this file and the only one that
  blocks something a real customer will want on day one.

---

## Session Update - 2026-09-05 (Gemini swap + deployment docs)

- **Worked on:** switching the model provider from Anthropic to Google Gemini,
  and writing down how to actually run and deploy the two processes.
- **Completed:**
  - `lib/ai-client.ts` now calls Gemini
    (`POST {base}/v1beta/models/{model}:generateContent`, `x-goog-api-key`
    header, `systemInstruction` + `contents`). Default model
    `gemini-3.8-flash`. **Nothing else changed** - no agent, no prompt, no
    router line - which is the whole point of that file existing. The
    `AiMessage`/`AiResult` shape callers depend on is unchanged; the
    assistant->`model` role rename happens inside the client.
  - Two things Gemini needs that Anthropic did not: `thinkingLevel: "low"`,
    and a **thinking headroom** of 2,000 tokens added on top of the caller's
    reply budget. Gemini spends reasoning tokens out of `maxOutputTokens`, so
    sending only the caller's 500 would let a thinking model use the whole
    budget thinking and return an empty reply. The empty-text branch now logs
    `blockReason`/`finishReason` so a refused prompt and a truncated reply are
    distinguishable - still without quoting the conversation.
  - `ANTHROPIC_API_KEY`/`_MODEL`/`_BASE_URL` -> `GEMINI_*` in
    `.env.example`, README.md, docs/Phases.md and the living sections of this
    file. Historical session entries left as they were written.
  - README.md gained a **"What runs where"** table (there is no separate
    backend - Next.js serves the site, the dashboard and every API route in one
    process; the WhatsApp worker is the second process and talks over Redis) and
    a **"Deploying"** section covering Supabase migrations, the app on Vercel,
    why the worker cannot go on Vercel, and the persistent disk its session
    folder needs.
- **New decisions:** decision 37 rewritten (provider is Gemini); assumption 9
  superseded; the "which model" open question answered - same model on every
  plan, revisit when real token cost is known.
- **Anything broken:** no. `npx tsc --noEmit`, `npm run lint` and
  `npm run build` are all clean.
- **Still not proven:** the same thing as before, one provider later. No Gemini
  key has been used against the live API from this codebase, so no agent in this
  repo has produced a real reply from a real model - only from the stub.

---

## Session Update — [DATE]
- Worked on:
- Completed:
- In progress / left off at:
- New assumptions or decisions:
- Anything broken:
```

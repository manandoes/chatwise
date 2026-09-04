# PRD.md — Project Requirements Document

> Product name used throughout these docs: **[SaaS_NAME]** (placeholder — find & replace once you pick a name).

## 1. What This Product Is

[SaaS_NAME] is a subscription SaaS that lets a business set up one or more pre-built **WhatsApp AI agents** (bots) — a Receptionist, a Lead Qualifier, a Sales agent, etc. — connect them to their own WhatsApp number, and manage every conversation, lead, and setting from a single dashboard.

The customer doesn't build a bot from scratch. They **pick which agents they want**, answer a short setup questionnaire about their business, and the agent goes live on their WhatsApp — either through the official **WhatsApp Business API** (paid, per-message, for larger businesses) or through a **WhatsApp Web QR-code connection** (free tier, for small businesses with lower volume).

## 2. Who This Is For

| User type | Description | What they care about |
|---|---|---|
| Small business owner | Runs a shop/service, low message volume, price-sensitive | Free tier, easy QR setup, doesn't want to pay per message |
| Growing/mid-size business | Higher volume, wants reliability | Official API, analytics, uptime (runs additional accounts if they need more than one bot) |
| Agency / reseller (future) | Manages [SaaS_NAME] for multiple clients | Multi-account/workspace management (Phase 5+, not MVP) |

All three are non-technical. They should never need to see code, JSON, or a terminal.

## 3. Core User Journey (High Level)

1. **Landing page** — explains the product, features, pricing, FAQ. CTAs: "Login" and "Try it / Get Started."
2. **Sign up / Log in** — email+password or Google OAuth.
3. **Onboarding wizard** (slide-by-slide, one question per screen):
   - Step A — *Which bot do you want?* (grid of the agents listed in §5 — **single-select, exactly one bot per account**; see §3.1)
   - Step B — *How do you want to run it?* — **WhatsApp Business API** (paid, per-message) **OR** **Free QR connection** (whatsapp-web.js) — **single-select, exactly one connection type per account**; see §3.1)
   - Step C — *Tell us about your business/product* — questions vary depending on which bot was picked in Step A (e.g. Sales agent asks for catalog/pricing info; Support agent asks about order system; Appointment agent asks about calendar/booking hours)
   - Step D — *How should the bot act?* — tone/personality, language, escalation rules (when to hand off to a human)
4. **Main Dashboard** — the app proper (see §6).
5. **WhatsApp connection screen** — inside the dashboard:
   - If API tier: form to enter WhatsApp Business API credentials (Meta App ID, phone number ID, access token) with a step-by-step guide.
   - If Free tier: QR code shown on screen, user scans with their phone's WhatsApp, session persists per user.
6. **Billing** — subscription checkout (plan selection, payment), managed via a billing provider (e.g. Stripe).

### 3.1 Account Constraints (hard rules)

Each account is limited to a **single setup**. This is a firm product rule, not a default that can be changed later in Settings:

- **One connection type per account** — an account is either **paid (WhatsApp Business API)** *or* **free (QR / whatsapp-web.js)**, never both. The choice is made in Onboarding Step B and cannot be mixed.
- **One bot type per account** — an account runs exactly **one** of the agents from §5, chosen in Onboarding Step A. No multiple bots on one account.
- **The CRM agent is the one exception** — it is a background agent that runs on top of the chosen bot to keep CRM data fresh (see §5). It is *not* a second selectable bot and does not count against the one-bot rule; whether it is always-on or bundled only with certain plans is a plan/business decision (flag in §10).
- Changing the bot type or connection type after setup means **re-onboarding / a new setup**, not adding a second one alongside the first. (Whether that requires a fresh account, a plan change, or an admin-assisted reset is an open question — see §10.)
- A business wanting a second bot or a second connection type would need a **separate account/subscription**.

These constraints must be enforced in the data model and UI (see Architecture.md §4 and Rules.md), not just suggested in copy — the bot picker and connection picker are single-select, and the schema stores one bot + one connection per account.

## 4. Business Model

- Subscription tiers (monthly/annual), gated by:
  - Message volume / conversation volume
  - Free tier (QR/whatsapp-web.js) vs Paid tier (official WhatsApp Business API, which itself has Meta's own per-message cost passed through or marked up)
  - Possibly *which* bot type is available on which plan (business decision — flag in §10)
  - Note: since each account runs exactly one bot on one connection type (see §3.1), plans are **not** gated by "number of agents" — a business needing more runs additional accounts/subscriptions.
- Exact pricing numbers are a business decision, not covered here — Design/PRD only need placeholders on the pricing page until finalized.

## 5. The Agents (Bots) — MVP Catalog

Each agent is a pre-built, configurable conversation flow. This table is the source of truth for onboarding questions, agent folder structure (see Architecture.md), and dashboard agent cards.

| # | Agent | Triggered by | Primary tools/integrations it needs |
|---|---|---|---|
| 1 | **Receptionist** | Any inbound question | Knowledge base (business hours, FAQs) |
| 2 | **Lead Qualifier** | New enquiry | CRM — score and store the lead |
| 3 | **Appointment** | "Can I come at 4?" type messages | Calendar — read + write |
| 4 | **Sales** | "Which plan?" / pricing questions | Product catalog, pricing, checkout link |
| 5 | **Support** | Order or issue message | Orders / ticketing system |
| 6 | **Follow-up** | Silence after a quote was sent | Approved message templates + scheduler |
| 7 | **Personal Shopper** | "Gift under ₹5,000" type requests | Catalog + checkout |
| 8 | **Feedback** | Post-purchase reply | CRM + tag/alert |
| 9 | **Internal** | Employee question (internal use, not customer-facing) | Internal docs + dashboards |
| 10 | **CRM** | Every conversation (runs alongside other agents) | CRM write — updates fields + status on every message |

Notes:
- **CRM** agent is effectively a background agent that runs on top of every conversation alongside whichever single customer-facing bot the account chose — it's the one that keeps the CRM data fresh. It is not a selectable second bot (see §3.1).
- Because each account runs **exactly one** customer-facing bot (§3.1), there is **no multi-bot routing** — every inbound message goes to that account's chosen bot, with the CRM agent running in parallel. (A lightweight router still exists as a single entry point, but it always routes to the one configured bot; it's built to *allow* multi-bot in a future version, but MVP is one-bot-per-account.)
- The chosen bot's exact prompt/behavior is configured by the answers collected in Onboarding Step C/D.

## 6. Main Dashboard — Feature List (MVP)

- **Overview** — key numbers at a glance: active conversations, messages this month, leads captured, uptime/connection status of the WhatsApp account.
- **My Bot** — the single agent this account runs: view/edit its configuration, personality, knowledge base, and escalation rules. (Not a multi-agent list — one bot per account, per §3.1. Switching bot type here triggers a re-setup, not an addition.)
- **Conversations / Inbox** — live view of WhatsApp chats the bots are handling, with ability for a human to jump in and take over a conversation.
- **Leads / CRM** — table of captured leads/contacts with status, score, tags (fed by Lead Qualifier + CRM agents).
- **Connect WhatsApp** — the API-credentials form (paid tier) or QR scanner (free tier), connection health/status indicator, reconnect button.
- **Knowledge Base** — where the business's FAQs, product catalog, policies, etc. are uploaded/edited (feeds Receptionist, Sales, Personal Shopper).
- **Campaigns / Outreach** — send a message template to a list of contacts, schedule sends, and track delivery/read/reply. Tier-limited (see §7). Includes a template library (see §7.1), contact-list segmentation, and opt-out/consent tracking.
- **Analytics** — messages handled, response time, conversion (lead → sale), agent-by-agent breakdown.
- **Billing** — current plan, usage against plan limits, upgrade/downgrade, invoices.
- **Settings** — account/profile, team members (future), notification preferences.

## 7. Bulk Messaging / Outreach

Broadcast/outreach lets a business send one message (personalized per recipient) to many contacts. It's a core expected WhatsApp-CRM feature, but the rules differ sharply by tier because of Meta's policies and ban-risk.

### 7.1 Tier limits (hard rules)

| | **Free tier (QR / whatsapp-web.js)** | **Paid tier (WhatsApp Business API)** |
|---|---|---|
| Max recipients per send | **25 numbers at a time** (hard cap) | Large lists (subject to Meta messaging tier/quality rating) |
| Method | Sent through the user's own QR session | Official API with **pre-approved templates** |
| Throttling | Sends spaced out with a delay between each message (not fired instantly) | API + Meta rate limits apply |
| Warning shown | **Yes — mandatory** (see §7.2) | Standard opt-out/compliance notice |
| Risk | High — unofficial channel, can get the number banned | Low — officially sanctioned channel |

- The **25-number cap on the free tier is enforced in code**, not just suggested — the send button disables past 25 selected recipients, and the API route rejects any free-tier send with more than 25 recipients.
- Sends on the free tier are **throttled** (a delay between each of the 25 messages) to reduce ban risk — never fired as an instant blast.

### 7.2 Mandatory free-tier warning

Before a free-tier user sends any bulk message, show a clear warning they must acknowledge, e.g.:
> ⚠️ You're sending from a WhatsApp Web connection. Sending to people who haven't opted in, or sending too often, can get your WhatsApp number **banned by WhatsApp**. Only message contacts who expect to hear from you. For safe, large-scale outreach, upgrade to the WhatsApp Business API.

This doubles as an upsell path to the paid tier.

### 7.3 Predefined message templates (starter library)

Ship the app with a starter library of ready-to-use templates so non-technical users aren't staring at a blank box. Users can edit them or write their own. On the paid tier, templates must be submitted to Meta for approval before use; on the free tier they send as-is (covered by the warning). Placeholders like `{name}` are auto-filled per recipient.

Suggested starter templates (grouped):

**Promotions / offers**
- "Hi {name}! 🎉 We've got a special offer just for you — {offer}. Valid till {date}. Reply *YES* to grab it!"
- "{name}, our biggest sale of the season is live! Up to {discount}% off. Shop now: {link}"

**Follow-up / re-engagement**
- "Hi {name}, just following up on your enquiry about {product}. Still interested? Happy to help!"
- "We miss you, {name}! Here's {incentive} to welcome you back. 😊"

**Appointment / booking**
- "Hi {name}, this is a reminder for your appointment on {date} at {time}. Reply *CONFIRM* or *RESCHEDULE*."
- "Thanks for booking with us, {name}! Your slot on {date} is confirmed. See you then. 📅"

**Order / delivery updates**
- "Good news {name}! Your order #{order_id} has shipped and will arrive by {date}. 📦"
- "Hi {name}, your order #{order_id} is out for delivery today. Please keep your phone handy."

**Feedback / post-purchase**
- "Hi {name}, thanks for your recent purchase! How did we do? Reply 1–5 (5 = loved it) ⭐"
- "{name}, we'd love your feedback on {product}. It takes 30 seconds and really helps us. 🙏"

**Payment / reminders**
- "Hi {name}, a friendly reminder that your payment of {amount} for {item} is due on {date}. Pay here: {link}"

Every outbound bulk template must include (or the system must append) an **opt-out line** for compliance, e.g. "Reply STOP to unsubscribe."

## 8. Non-Functional Requirements

- **Non-technical friendliness**: every screen should be understandable without any coding knowledge — this also drives the folder-naming requirement in Architecture.md (bot folders named after the bot, not generic code terms).
- **Multi-tenant & isolated**: one customer's WhatsApp session/data must never be visible to or interfere with another's — especially important for the free-tier QR sessions, which must run as isolated per-user processes/sessions.
- **Reliability**: WhatsApp connections (both API and QR/web) should auto-reconnect and alert the user if disconnected.
- **Scalability**: architecture should allow adding new agent types without restructuring the whole app.
- **Security**: WhatsApp Business API tokens and QR session data are sensitive — encrypted at rest, never exposed to the frontend.

## 9. Out of Scope for MVP

- Multi-user/team accounts per workspace
- Agency/reseller multi-client management
- Voice notes / voice-based agents
- Channels beyond WhatsApp (Instagram, SMS, etc.)
- Custom/no-code agent builder (MVP ships with the fixed catalog in §5 only)

## 10. Open Questions (flag to product owner before/while building)

- Final pricing tiers and limits per plan
- Which payment gateway (Stripe vs regional provider — relevant given a lot of the free tier audience may be in India per the ₹ pricing example)
- Exact Meta WhatsApp Business API onboarding requirements (Meta approval process, business verification) — user-facing copy for the "Connect WhatsApp" screen should be written once this is confirmed
- **Switching setup:** when a user wants to change their bot type or connection type (§3.1), what exactly happens — a full re-onboarding on the same account (wiping the old bot's config), an admin-assisted reset, or requiring a new account/subscription? Pick one before building the "My Bot" settings screen.
- **CRM agent availability:** is the background CRM agent always included, or bundled only with certain plans?

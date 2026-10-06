# ChatWise

**Put a ready-made AI agent on your own WhatsApp number — and manage every conversation from one dashboard.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-336791?style=flat-square&logo=postgresql)](https://postgresql.org)
[![Prisma](https://img.shields.io/badge/Prisma-7-2961f2?style=flat-square&logo=prisma)](https://prisma.io)
[![License](https://img.shields.io/badge/License-All%20rights%20reserved-gray?style=flat-square)](#)

---

## Overview

ChatWise is a subscription SaaS that lets small and mid-size businesses put a pre-built AI agent on their own WhatsApp number — no coding required. A business picks an agent (Receptionist, Lead Qualifier, Sales Assistant, Support Agent, etc.), answers a few questions about their company, connects their WhatsApp, and the agent starts answering customers automatically. Every conversation, lead, and campaign is managed from a single web dashboard.

The product solves a simple problem: **businesses want to use WhatsApp for customer communication, but building and managing an AI agent from scratch is out of reach.** ChatWise removes the technical barrier entirely.

**Designed and built by [Manan Agarwal](https://github.com/mananagarwal).**

---

## Key Features

### 🤖 AI-Powered Agents

- **9 pre-built agent types** — Receptionist, Lead Qualifier, Appointment, Sales, Support, Follow-up, Personal Shopper, Feedback, and Internal
- Each agent has its own configurable personality, tone, and escalation rules
- **CRM Agent** runs silently in the background, keeping contact records up to date alongside the chosen agent
- AI responses powered by Google Gemini

### 💬 WhatsApp Integration

- **Two connection tiers** — QR-code connection for small businesses, Official WhatsApp Business API for larger operations
- **Live inbox** with real-time conversation updates — watch chats as they happen
- **Human handover** — take over any conversation with one click; the agent pauses while you reply
- Escalation detection — urgent or angry messages are flagged and routed to a person automatically

### 👥 CRM & Lead Management

- Leads are captured automatically from conversations — no manual entry required
- **Field-level ownership** — when a human corrects a lead field, the agent learns to respect that edit
- Contacts, tags, segments, and deal tracking
- Bulk contact lists for campaigns

### 📣 Campaigns & Outreach

- Bulk messaging with safety limits (recipient caps, throttling, opt-out enforcement)
- Template library with variable substitution
- Meta template approval workflow for API-tier accounts
- Delivery, read, and reply tracking per message

### 📊 Analytics & Insights

- Messages handled, answer times (median), and conversation volume over 7-day, 30-day, or all-time windows
- Lead-to-customer conversion rates
- Campaign performance metrics
- Distinction between agent-handled and human-sent messages in all metrics

### 💳 Billing & Subscriptions

- Two paid plans — **Small Business** (₹999/mo) and **Enterprise** (₹1,499/mo); no free tier
- Payments processed through Razorpay hosted checkout — card details never touch the application
- Usage tracking against plan limits (messages, campaigns, knowledge entries, analytics history)
- Invoice history read live from the payment provider

### 🔌 Integrations

- **Google Sheets** — export and import contact data
- **Calendly** — appointment booking with confirmations and reminders
- **Shopify** — product catalog sync for personal shopper agents
- **Google Drive** — optional conversation backup with media support
- **Razorpay & Stripe** — merchant payment links so businesses can collect payments on WhatsApp

---

## Product Modules

| Module | What it does |
|---|---|
| **Marketing Site** | Public landing page, features, pricing, FAQ — designed to convert visitors into sign-ups |
| **Onboarding Wizard** | Guided 4-step setup: pick an agent, choose a connection type, describe your business, configure behaviour |
| **Dashboard** | Central hub — overview, conversations, leads, analytics, campaigns, billing, settings |
| **Agent Engine** | Loads the chosen agent's instructions, knowledge base, and conversation history to generate replies |
| **Message Router** | Single entry point for all incoming WhatsApp messages; routes to the correct account's agent |
| **WhatsApp Connectors** | QR-tier driver (whatsapp-web.js) and official Business API webhook handler |
| **Campaign Sender** | Background scheduler that sends bulk messages one at a time with throttling and opt-out checks |
| **Billing System** | Subscription management via Razorpay, usage tracking, plan limit enforcement |

---

## Available Agents

| Agent | Best for |
|---|---|
| Receptionist | General inquiries, hours, directions, FAQs |
| Lead Qualifier | Screening inbound prospects, collecting intent signals |
| Appointment | Scheduling, calendar integration, reminder sends |
| Sales | Product recommendations, pricing, closing conversations |
| Support | Order tracking, troubleshooting, returns |
| Follow-up | Post-purchase check-ins, review requests, re-engagement |
| Personal Shopper | Catalog browsing, product discovery, recommendations |
| Feedback | Satisfaction surveys, rating collection |
| Internal | Staff-only communication, HR, internal tools |

---

## Screenshots

> The production site is live at **[chatwise.automovalabs.tech](https://chatwise.automovalabs.tech)**. Screenshots below are placeholders — add them by dropping PNG files into `public/screenshots/` and updating the paths.

**Marketing Landing Page**

<!-- Add screenshot: public/screenshots/landing.png -->
<!-- ![ChatWise Landing Page](/screenshots/landing.png) -->

**Onboarding Wizard**

<!-- Add screenshot: public/screenshots/onboarding.png -->
<!-- ![Onboarding Flow](/screenshots/onboarding.png) -->

**Dashboard Overview**

<!-- Add screenshot: public/screenshots/dashboard.png -->
<!-- ![Dashboard](/screenshots/dashboard.png) -->

**Live Inbox with Human Handover**

<!-- Add screenshot: public/screenshots/inbox.png -->
<!-- ![Conversation Inbox](/screenshots/inbox.png) -->

**Analytics**

<!-- Add screenshot: public/screenshots/analytics.png -->
<!-- ![Analytics Dashboard](/screenshots/analytics.png) -->

---

## Technology Stack

### Frontend

- **Next.js 16** (App Router) — full-stack framework serving pages, API routes, and marketing content from a single codebase
- **React 19** — component-based UI
- **Tailwind CSS v4** — utility-first styling with custom design tokens
- **shadcn/ui** — accessible, customizable component primitives
- **Lucide React** — icon library

### Backend

- **Next.js API Routes** — server-side logic, authentication guards, and webhook handlers all in the same project
- **BullMQ** — job queue for background tasks (historical; migrated to direct PostgreSQL scheduling in single-host deployment)
- **TypeScript** — full type safety across the stack

### Database

- **PostgreSQL** — relational data model via Prisma ORM
- **Prisma 7** — schema-driven migrations, type-safe queries, adapter-based driver

### Authentication

- **NextAuth.js v5** (Auth.js) — email/password and Google OAuth
- Sessions stored in signed cookies
- Password hashing via Node.js built-in `scrypt`

### AI

- **Google Gemini** — agent response generation and embedding models
- Configurable model selection via environment variables

### Payments

- **Razorpay** — subscription billing with hosted checkout pages
- **Stripe** (optional) — merchant payment links for businesses to collect customer payments

### Infrastructure

- **Docker** — single-container deployment (Next.js app + WhatsApp worker)
- **Supabase** — managed PostgreSQL hosting
- **Redis** — rate limiting counters and session coordination (optional in single-host mode)

---

## Architecture

```
Visitor
  ↓
Next.js App (Vercel / GCP VM)
  ├── Marketing Pages & Landing
  ├── Dashboard UI
  ├── API Routes (auth, data, webhooks)
  └── WhatsApp Worker (QR tier — drives Chromium session)
        ↓
PostgreSQL (Supabase)
  ├── Users, Businesses, Subscriptions
  ├── Conversations, Messages, Leads
  ├── Campaigns, Templates, Knowledge Base
  └── WhatsApp session data (encrypted at rest)
        ↓
External Services
  ├── Google Gemini (AI responses)
  ├── Razorpay (billing)
  ├── Meta WhatsApp Business API (webhooks)
  ├── Google Sheets / Drive
  ├── Calendly
  └── Shopify
```

---

## High-Level Architecture

```
User Browser
    ↓
Next.js App (Pages + API Routes)
    ↓
Message Router (incoming WhatsApp messages)
    ↓
Agent Engine (loads prompt + knowledge base + history)
    ↓
Google Gemini (generates reply)
    ↓
WhatsApp Connector (sends via QR or Business API)
    ↓
PostgreSQL (persisted conversation, lead, campaign data)
```

---

## Use Cases

**A local restaurant** — installs the Receptionist agent to handle table availability, menu questions, and reservation requests on WhatsApp, freeing the front desk for in-person guests.

**A D2C brand** — uses the Personal Shopper agent to help customers browse the catalog, compare products, and place orders directly through WhatsApp, with payment links sent in-chat.

**A consulting firm** — deploys the Lead Qualifier agent to screen inbound messages, collect contact details and budget range, and hand off hot prospects to the sales team with a fully populated lead record.

**A service business** — runs the Appointment agent to let customers book, reschedule, and receive reminders for slots, with Calendly integration keeping the calendar in sync.

**An e-commerce store** — uses the Support agent to answer order status questions, process returns, and collect feedback post-delivery, with Shopify catalog data keeping answers accurate.

---

## My Role

**Designed and developed by Manan Agarwal**

Responsible for end-to-end product development including:

- Product architecture and system design
- Frontend and dashboard development
- Backend API routes and webhook handlers
- Database schema design and migrations
- AI agent engine and prompt engineering
- WhatsApp connector implementation (both QR and Business API tiers)
- Payment integration and subscription logic
- Deployment infrastructure and Docker packaging
- Security hardening and automated test suite

---

## Product Highlights

- **Full-stack SaaS** — marketing site, auth, dashboard, billing, and background workers in a single codebase
- **Multi-tenant architecture** — every route enforces account ownership; cross-account data leakage is impossible by design
- **Real-time conversation inbox** — polling-based live updates without WebSockets, compatible with serverless hosting
- **AI-powered agents** — configurable personalities, knowledge bases, and escalation rules per agent type
- **Dual WhatsApp integration** — unofficial QR connection and official Business API, each with distinct capabilities and safety constraints
- **Payment integration** — Razorpay-hosted checkout, subscription lifecycle management, usage-based plan limits
- **Campaign system** — bulk messaging with recipient throttling, opt-out enforcement, and per-plan caps
- **Field-level data ownership** — human edits to CRM records are preserved and respected by the AI agent
- **Security-first design** — encrypted session data, rate limiting on all public endpoints, strict content security policies, HMAC webhook signature verification
- **Automated validation** — 658+ automated checks covering routing, ownership guards, plan limits, analytics accuracy, and security invariants

---

## Security & Privacy

> The production source code is private. This repository is a public product showcase and does not contain proprietary source code, credentials, or sensitive configuration.

Key security measures implemented in the application:

- All secrets read from environment variables — nothing hardcoded
- WhatsApp session data and API credentials encrypted at rest
- Every API route verifies the requesting user owns the resource
- Rate limiting on authentication, payment, and messaging endpoints
- Content Security Policy, frame-ancestors protection, and HSTS headers
- Webhook endpoints verify HMAC signatures before processing
- Card details never touch the application — payments handled on Razorpay's hosted pages

---

## Live Product

**Live Demo:** [chatwise.automovalabs.tech](https://chatwise.automovalabs.tech)

---

## Contact

Built by **Manan Agarwal**

- GitHub: [@mananagarwal](https://github.com/mananagarwal)
- Website: [automovalabs.tech](https://automovalabs.tech)

---

## About This Repository

This repository serves as a public-facing showcase of the ChatWise product. The production source code is maintained privately because the application is a commercial SaaS product.

All fourteen development phases are complete — the codebase is type-safe, lint-clean, and passes 658+ automated checks. What remains unverified are the live integrations (a real Gemini API key, a connected WhatsApp number, active Razorpay plans, and an email service), which require external accounts not stored in this repository.

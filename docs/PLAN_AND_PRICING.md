# ChatWise — Plan, Pricing & Add-ons

*Date: 2026-10-01 | Based on current feature set*

---

## Plans

| | Small Business | Enterprise |
|---|---|---|
| **Price** | ₹999/mo | ₹1,499/mo |
| **Connection** | QR (scan phone) | Official WhatsApp API |
| **Messages/mo** | 2,000 | 10,000 |
| **Campaigns/mo** | 4 | Unlimited |
| **Saved templates** | 10 | Unlimited |
| **Knowledge base** | 50 entries | 100 entries |
| **Analytics** | 30 days | All history |
| **Team members** | 1 owner + 5 agents | 1 owner + 20 agents |
| **Support** | Email | Priority |

---

## Add-ons

### Integrations Bundle — **₹299/mo**

Combines all three integration features:

- **Shopify** — Sync orders, customers, and products. Automated abandoned-cart WhatsApp messages and order updates.
- **Google Sheets** — Import contacts from spreadsheets, export contact lists, scheduled auto-syncs.
- **Calendly** — Let customers book meetings directly. Automatic WhatsApp confirmations and reminders.

### AI Product Search — **₹299/mo**

- Vector search over your product catalog (pgvector embeddings)
- Agent can answer "do you have X in stock?" and recommend products by meaning, not just keywords
- Controlled by `FEATURE_CATALOG_SEARCH` env flag
- One time: index your products; then runs automatically on sync

### AI Insights — **₹199/mo**

- AI-powered conversation summaries (auto-generated thread summaries for long chats)
- Sentiment detection on inbound messages (flags angry/urgent conversations)
- Lead scoring intelligence improvements
- Controlled by `FEATURE_AI_INSIGHTS` env flag
- *Currently in development — flag-enabled when ready*

---

## Pricing Logic

| Scenario | Price |
|---|---|
| Small Business only | ₹999/mo |
| Enterprise only | ₹1,499/mo |
| Small Business + Integrations Bundle | ₹1,298/mo |
| Enterprise + Integrations Bundle | ₹1,798/mo |
| Any plan + AI Product Search | +₹299/mo |
| Any plan + AI Insights | +₹199/mo |
| Small Business + All Add-ons | ₹1,796/mo |
| Enterprise + All Add-ons | ₹2,096/mo |

Annual billing: 2 months free (pay for 10, get 12).

---

## What's Already in the Code

| Add-on | Env Flag | Currently Used In Code |
|---|---|---|
| Shopify | `FEATURE_SHOPIFY` | Yes — install/callback/webhooks |
| Google Sheets | `FEATURE_GOOGLE_SHEETS` | Yes — connect/sheet import/export |
| Calendly | `FEATURE_CALENDLY` | Yes — connect/webhook/bookings |
| AI Product Search | `FEATURE_CATALOG_SEARCH` | Yes — catalog.ts vector search |
| AI Insights | `FEATURE_AI_INSIGHTS` | Flag exists but not yet wired to any route |

All five are soft-gated: if the env flag is off, the feature returns a "not enabled" message rather than crashing. The middleware/paywall gates are separate — they control *whether you can access the dashboard at all*.

---

## Implementation Checklist (Completed)

- [x] `middleware.ts` — subscription gate on all dashboard routes
- [x] `app/(auth)/paywall/page.tsx` — paywall page
- [x] Signup → redirects to `/paywall`
- [x] Login → blocks unsubscribed users with paywall link
- [x] Pricing plans component supports `paywall` prop
- [x] Demo seed script (`scripts/seed-demo.ts`)
- [ ] **Run seed** — needs your authorization (mass DB delete)

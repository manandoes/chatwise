# Shared logic

Anything used by more than one screen, route or job. If a rule matters in two
places, it lives here once rather than being written twice — a rule enforced in
two places is a rule that will eventually be enforced two different ways.

Most of these are server-only and say so. The exceptions are deliberate: a few
files hold plain data that both the browser and the server need to agree on, and
those carry no secrets and import nothing that does.

## The database and the basics

- `db.ts` — the Prisma client, and the one connection to PostgreSQL
- `api-response.ts` — the single error shape every API route returns
- `utils.ts` — the shadcn/ui class-name helper (`cn`)
- `encryption.ts` — AES-256-GCM, for anything secret stored at rest
- `redis.ts` — the Redis connection, and "is it actually reachable?"
- `password.ts` — password hashing and checking, using Node's built-in `scrypt`
- `format-when.ts` — "Yesterday", "2:14 pm", "4 minutes", "4 October 2026"

## Who is signed in, and what they may do

- `auth.ts` — signing in, plus `requireUser()`, `getApiUser()` and
  `requireApiBusiness()`. Every route that touches an account's data starts at
  one of those (docs/Rules.md §3)
- `rate-limit.ts` — how often one person may do one thing. Counters live in
  Redis; it fails open if Redis is down, on purpose
- `onboarding.ts` — where an account is up to in setup (server-side)
- `onboarding-steps.ts` — the steps as plain data, safe for the browser

## What the app is actually about

- `whatsapp-connection.ts` — finds the signed-in customer's connection, safely
- `conversations.ts` — the inbox: reading a thread, taking it over, replying
- `leads.ts` — the CRM record, and who may change what. A field a person edited
  by hand stays theirs (docs/Rules.md §5)
- `knowledge-base.ts` — the questions and answers an agent may answer from
- `analytics.ts` — the numbers on Overview and Analytics, counted from real rows
- `ai-client.ts` — calling the model, and coping when it cannot be reached

## Money

- `plans.ts` — **the one file to edit when a plan changes.** The two plans —
  one per connection tier, both paid — their prices and every limit, as plain
  data. No secrets; safe in the browser
- `razorpay.ts` — the only file that talks to the payment provider
- `subscription.ts` — which plan an account is on, and how that changes
- `usage.ts` — what has been used this period, counted from the real rows, and
  whether any more is allowed

## `validation/`

Checks that run in the browser for quick feedback and again on the server, which
never trusts the browser's verdict.

## `generated/prisma/`

Written by `prisma generate`. Git-ignored, and never edited by hand.

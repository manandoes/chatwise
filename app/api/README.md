# Backend API routes

Server-side endpoints the dashboard calls. Nothing here ever runs in the
browser, so this is where anything secret (WhatsApp tokens, the Razorpay key
secret, database access) belongs.

- `auth/`                  Login/session handling (NextAuth)
- `whatsapp/business-api/`  Webhook + send endpoints for the API tier
- `whatsapp/qr-session/`    Start/stop/status endpoints for the QR tier
- `billing/`               `subscription/` starts, changes and cancels a plan;
                           `webhook/` is where Razorpay tells us a payment
                           happened. The webhook is PUBLIC — Razorpay calls it,
                           so it cannot require a login and defends itself with
                           a signature instead. It is also the only path by
                           which an account becomes entitled to a paid plan
- `agents/`                Read and update the account's bot configuration
- `conversations/`         The inbox: the thread list, taking a conversation
                           over or handing it back, and replying by hand
- `leads/`                 Saving a lead somebody corrected by hand — and
                           recording that it is theirs now (docs/Rules.md §5)
- `campaigns/`             Start and stop bulk campaigns. The rules live in
                           /campaigns, not here — a rule enforced only at the
                           door stops existing when somebody adds a second door
- `templates/`             The messages a business saves to reuse

Every route must check that the logged-in user actually owns the thing they are
asking about (docs/Rules.md §3).

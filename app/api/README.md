# Backend API routes

Server-side endpoints the dashboard calls. Nothing here ever runs in the
browser, so this is where anything secret (WhatsApp tokens, Stripe keys,
database access) belongs.

- `auth/`                  Login/session handling (NextAuth)
- `whatsapp/business-api/`  Webhook + send endpoints for the paid tier
- `whatsapp/qr-session/`    Start/stop/status endpoints for the free QR tier
- `billing/`               Stripe checkout and webhooks
- `agents/`                Read and update the account's bot configuration
- `campaigns/`             Create and send bulk campaigns; enforces the tier caps

Every route must check that the logged-in user actually owns the thing they are
asking about (docs/Rules.md §3).

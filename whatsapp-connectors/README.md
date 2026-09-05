# WhatsApp connectors

Everything to do with actually talking to WhatsApp. Two ways in:

- `business-api/`  The official WhatsApp Business Cloud API from Meta. Paid tier,
                   charged per message, reliable, no ban risk. (**Phase 6**)
- `web-qr/`        The free tier: the customer scans a QR code with their phone,
                   the way WhatsApp Web works. Each customer's session runs in its
                   own separate worker process so one customer's problem can never
                   affect anyone else's (docs/Architecture.md §5). (**Phase 5**)

An account uses one of them, never both (docs/PRD.md §3.1).

## Use these two files, not the folders

Anything outside this directory that wants to send a message or know what a tier
allows should go through:

- `index.ts`         `connectorFor("QR" | "API")` gives you something with a
                     `sendText()` on it. The router, the inbox and campaigns use
                     this so that none of them has to know which tier it is on —
                     the moment a feature writes `if (type === "QR")`, that
                     branch has to be repeated in every feature that sends.
- `capabilities.ts`  The rules that genuinely differ — the 25-recipient free-tier
                     cap, throttling, whether templates need Meta's approval,
                     whether delivery receipts exist — as **data** rather than
                     behaviour, so a screen reads a value instead of branching.
                     It has no server-only imports, so the campaigns UI can read
                     the same cap the API route enforces.

The one difference the interface does *not* hide is that the paid tier knows a
message was sent and the free tier only knows it was accepted for sending. See
`SendOutcome` in `index.ts` — telling a customer "sent" when nobody knows yet
would be exactly the stale status docs/Rules.md §4 forbids.

Inbound is not unified yet. Neither connector carries message text today (that
is deliberate — docs/Rules.md §4), so there is nothing to normalise until the
message router needs it in **Phase 7**.

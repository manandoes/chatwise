# Onboarding wizard

The slide-by-slide setup a new customer walks through the first time they log in:

- `choose-bots/`        Step A — pick the one agent this account will run
- `connection-type/`    Step B — official WhatsApp Business API, or the QR connection
- `business-details/`   Step C — questions about the business (these vary by the bot picked in Step A)
- `bot-behavior/`       Step D — tone, language, and when to hand a chat to a human

Each account picks **exactly one** bot and **exactly one** connection type
(docs/PRD.md §3.1). Both pickers are single-select.

Built in **Phase 3**. See docs/Phases.md.

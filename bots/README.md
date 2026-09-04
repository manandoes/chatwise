# The bots (AI agent "brains")

One folder per agent, named after what the agent actually does. If you want to
change how the Receptionist talks to customers, open `receptionist-bot/` — that
is the only place its instructions live.

Each bot folder holds:

- `prompt.ts`         The agent's instructions, in plain language
- `config-schema.ts`  Which onboarding questions this bot needs answered
- `handler.ts`        How it decides what to reply

Rules that matter here (docs/Rules.md §2 and §5):

- Bot instructions live **only** in these folders — never copy-pasted into a
  dashboard page or an API route.
- Anything shared by several bots goes in `shared/`, so it is written once.
- A bot only gets the tools listed for it in docs/PRD.md §5.

An account runs exactly one of these customer-facing bots. `crm-bot/` is the one
exception — it runs quietly alongside whichever bot was chosen, keeping the CRM
records up to date.

The Receptionist is built in **Phase 7**; the rest in **Phase 8**.

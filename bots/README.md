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

## The nine an account can choose from

All of them are built (Phase 7 for the Receptionist, Phase 8 for the rest).

| Folder | What it does |
|---|---|
| `receptionist-bot/` | Answers the everyday questions from the knowledge base |
| `lead-qualifier-bot/` | Finds out whether a new enquiry is worth following up |
| `appointment-bot/` | Takes down what someone wants to book |
| `sales-bot/` | Answers pricing questions and points people at checkout |
| `support-bot/` | Picks up order problems and raises what it cannot fix |
| `follow-up-bot/` | Chases a quote that went quiet |
| `personal-shopper-bot/` | Turns a vague brief into real suggestions |
| `feedback-bot/` | Asks how it went, and flags the unhappy replies |
| `internal-bot/` | Answers the business's own staff, not its customers |

## Two things worth knowing before you read one

**No agent has an integration yet.** docs/PRD.md §5 gives several of them a
calendar, a catalogue, an orders system or a checkout, and none of those exist
in ChatWise today. So every agent works from two things only: the answers the
owner gave during setup, and the knowledge base. Where an agent would need a
system it does not have — to see whether 4pm is free, to look an order up — its
prompt says so plainly and it hands the conversation to a person. An agent that
believes it has a calendar will happily double-book a salon.

**Two of them sometimes speak first.** The Follow-up and Feedback agents are
triggered by time rather than by a message, so their handlers export a second
function — `composeFollowUpNudge` and `composeFeedbackRequest` — for the
background job that watches the clock (docs/Phases.md, Phase 12). Nothing calls
those yet. They live here rather than in `/jobs` so that job stays a timer and
the words stay with the agent.

## The CRM agent

`crm-bot/` is the odd one out and never appears in the picker. It reads a
conversation somebody else is having and keeps one record per contact up to
date — name, status, score, a sentence on what they want. Its answer is JSON
rather than a sentence, so `handler.ts` checks every field before it goes
anywhere near the database, and what it is finally allowed to change is decided
in `lib/leads.ts`: **a field a person edited by hand stays theirs**
(docs/Rules.md §5). Those records are what the Leads screen shows, and where
somebody corrects them (Phase 10).

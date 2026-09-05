# The database

## `schema.prisma`

The structure of every table, and the source of truth for the data model. It is
written to be read: each table and most columns carry a comment saying what the
thing is and, where it matters, why it is shaped that way.

Change this file, then run `npm run db:migrate` to create a migration and apply
it. **Note the change and the reason in `docs/Memory.md`** — that is not a
nicety, it is docs/Rules.md §9.

## `migrations/`

One folder per change, applied in order. A few things worth knowing:

- **The folder names sort into the order they run in**, because that is exactly
  how Prisma decides the order — not by when they were written. A migration that
  references a table created by a later-sorting one can never be replayed from
  an empty database. That has happened here once and was repaired by renaming.
- **A migration that has been applied anywhere is never edited**, not even its
  comments: Prisma stores a checksum of the file and will demand a database
  reset if it changes.
- Migrations are additive history. Fixing a mistake means a new migration, not a
  correction to an old one.

## Enums live here, and are mirrored in code

Several enums (`BotType`, `LeadStatus`, `PlanId`, `MessageAuthor`…) have a
matching TypeScript type somewhere the browser can read — `lib/plans.ts`,
`lib/validation/leads.ts`, `whatsapp-connectors/capabilities.ts`. Those files say
which enum they mirror. When one changes, the other has to.

## What is never in here

Connection strings. The database URL is read from `DATABASE_URL` through
`prisma7.config.ts` and never written into the schema (docs/Rules.md §3).

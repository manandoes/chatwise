// Settings the Prisma command-line tools use (creating and applying migrations).
//
// Note this is NOT how the running app connects to the database — that is
// lib/db.ts, which uses the pooled DATABASE_URL.
//
// Migrations must use a *direct* database connection. Supabase gives you two
// connection strings: a pooled one (port 6543) for the app, and a direct one
// (port 5432) for schema changes. A pooler cannot run migrations, so DIRECT_URL
// is used here, falling back to DATABASE_URL for local databases that have no
// pooler in front of them.

import "dotenv/config";
import { defineConfig } from "prisma/config";

// An unset variable and one set to "" mean the same thing here: not provided.
// `.env.example` documents leaving DIRECT_URL blank (local PostgreSQL, no
// pooler) and SHADOW_DATABASE_URL blank (Supabase, which won't grant the
// permission to create one). Prisma rejects an empty string outright rather
// than reading it as absent, so collapse blanks to undefined here.
function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: optionalEnv("DIRECT_URL") ?? optionalEnv("DATABASE_URL"),

    // `prisma migrate dev` rehearses migrations on a scratch "shadow" database
    // before touching the real one. Normally it creates and drops that scratch
    // database itself, which needs permission to create databases — something
    // hosted providers often don't grant. Point SHADOW_DATABASE_URL at an empty
    // database and it uses that instead. Optional: leave it unset if creating
    // databases works on your setup.
    shadowDatabaseUrl: optionalEnv("SHADOW_DATABASE_URL"),
  },
});

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

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],

    // `prisma migrate dev` rehearses migrations on a scratch "shadow" database
    // before touching the real one. Normally it creates and drops that scratch
    // database itself, which needs permission to create databases — something
    // hosted providers often don't grant. Point SHADOW_DATABASE_URL at an empty
    // database and it uses that instead. Optional: leave it unset if creating
    // databases works on your setup.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});

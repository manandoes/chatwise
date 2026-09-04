// The database connection, shared across the whole app.
//
// Import `db` anywhere on the server to read or write data. This file is
// server-only — it must never be imported into a component that runs in the
// browser, because it holds the database credentials (docs/Rules.md §3).

import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

// Relative, with the extension: the WhatsApp worker loads this file under
// plain Node, which doesn't read the "@/..." shortcuts the app uses.
import { PrismaClient } from "./generated/prisma/client.ts";

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });
}

// Next.js reloads server code on every edit in development. Without this, each
// reload would open a brand new pool of database connections until the database
// refused any more. Reusing one client off `globalThis` avoids that.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

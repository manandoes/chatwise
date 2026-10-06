// Quick-insert a company with an active subscription.
//
// Run with Node 24+:
//   node --env-file-if-exists=.env scripts/insert-company.ts
//
// Usage:
//   node --env-file-if-exists=.env scripts/insert-company.ts \
//     --name "Acme Corp" --email "admin@acme.com" --password "secret123" \
//     --plan SMALL_BUSINESS

import { PrismaClient } from "../lib/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await promisify(scrypt)(
    password.normalize("NFKC"),
    salt,
    64,
    { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
  );
  return ["scrypt", salt.toString("base64"), derivedKey.toString("base64")].join("$");
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const name = get("--name");
  const email = get("--email");
  const password = get("--password");
  const plan = get("--plan") ?? "SMALL_BUSINESS";

  if (!name || !email || !password) {
    console.error("Usage:");
    console.error(
      '  node --env-file-if-exists=.env scripts/insert-company.ts --name "Company" --email "a@b.com" --password "pass" [--plan SMALL_BUSINESS|ENTERPRISE]',
    );
    process.exit(1);
  }

  if (plan !== "SMALL_BUSINESS" && plan !== "ENTERPRISE") {
    console.error('Plan must be SMALL_BUSINESS or ENTERPRISE');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const user = await db.user.create({
    data: { email, name: name, passwordHash },
    select: { id: true, email: true },
  });
  console.log(`✓ User: ${user.email} (${user.id})`);

  const business = await db.business.create({
    data: {
      userId: user.id,
      name,
      timezone: "Asia/Kolkata",
      members: { create: { userId: user.id, role: "OWNER" } },
      agent: { create: { botType: "RECEPTIONIST" } },
      connection: { create: { type: plan === "ENTERPRISE" ? "API" : "QR" } },
      subscription: {
        create: {
          plan: plan as "SMALL_BUSINESS" | "ENTERPRISE",
          status: "ACTIVE",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
    },
    include: { subscription: true, agent: true, connection: true, members: true },
  });
  console.log(`✓ Business: ${business.name} (${business.id})`);
  console.log(`  Plan:     ${business.subscription?.plan}`);
  console.log(`  Status:   ${business.subscription?.status}`);
  console.log(`  Agent:    ${business.agent?.botType}`);
  console.log(`  Connection: ${business.connection?.type}`);
  console.log(`  Member:   ${business.members[0]?.role}`);
  console.log("");
  console.log("Login:");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
}

main()
  .then(() => db.$disconnect().then(() => process.exit(0)))
  .catch((e) => {
    console.error(e);
    db.$disconnect().then(() => process.exit(1));
  });

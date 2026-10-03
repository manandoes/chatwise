// Verify seed data using generated Prisma client
require('dotenv').config({ path: '.env' });
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  console.log('=== Connection ===');
  const conn = await db.whatsAppConnection.findFirst();
  console.log('Type:', conn?.type, '| Status:', conn?.status, '| Phone:', conn?.phoneNumber);

  console.log('\n=== Business ===');
  const business = await db.business.findFirst();
  console.log('Name:', business?.name);
  console.log('Phone:', business?.connection?.phoneNumber);

  console.log('\n=== Subscription ===');
  const subscription = await db.subscription.findFirst();
  console.log('Plan:', subscription?.plan, '| Status:', subscription?.status);
  console.log('Add-ons:', JSON.stringify(subscription?.addons));

  await db.$disconnect();
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
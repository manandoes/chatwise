// Demo account seeding for ChatWise.
//
// Runs directly with Node 24+:
//   node --env-file-if-exists=.env scripts/seed-demo.ts
//
// What it does:
//   1. Deletes every User (cascades to Business, Members, and all related data)
//   2. Creates a demo user: demo@chatwise.app / demo1234
//   3. Creates a demo business with QR connection, Sales agent, member
//   4. Seeds contacts, conversations, knowledge base entries, templates
//   5. Prints credentials for login

import { PrismaClient } from "../lib/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function hashPassword(password: string): Promise<string> {
  const { randomBytes, scrypt } = await import("node:crypto");
  const { promisify } = await import("node:util");
  const scryptAsync = promisify(scrypt);
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(
    password.normalize("NFKC"),
    salt,
    64,
    { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
  );
  return ["scrypt", salt.toString("base64"), derivedKey.toString("base64")].join("$");
}

async function clearAll() {
  await db.contactTag.deleteMany();
  await db.tagRule.deleteMany();
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  await db.lead.deleteMany();
  await db.knowledgeEntry.deleteMany();
  await db.messageTemplate.deleteMany();
  await db.campaign.deleteMany();
  await db.contact.deleteMany();
  await db.tag.deleteMany();
  await db.segment.deleteMany();
  await db.deal.deleteMany();
  await db.dealActivity.deleteMany();
  await db.conversationNote.deleteMany();
  await db.booking.deleteMany();
  await db.product.deleteMany();
  await db.quickReply.deleteMany();
  await db.businessHours.deleteMany();
  await db.agentInstance.deleteMany();
  await db.whatsAppConnection.deleteMany();
  await db.businessMember.deleteMany();
  await db.teamInvite.deleteMany();
  await db.business.deleteMany();
  await db.user.deleteMany();
  await db.subscription.deleteMany();
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🧹 Clearing all data…");
  await clearAll();

  const passwordHash = await hashPassword("demo1234");

  // ── Step 1: Create demo user ──────────────────────────────────────────────
  console.log("👤 Creating demo user…");

  const ownerUser = await db.user.create({
    data: {
      email: "demo@chatwise.app",
      name: "Demo Owner",
      passwordHash,
    },
  });

  // ── Step 2: Create business with agent and connection ─────────────────────
  console.log("🏢 Creating demo business…");

  const business = await db.business.create({
    data: {
      userId: ownerUser.id,
      name: "TechBloom Studio",
      industry: "Digital Marketing",
      about:
        "We help small businesses grow their online presence through WhatsApp marketing, social media management, and customer support automation.",
      timezone: "Asia/Kolkata",
      onboardingCompletedAt: new Date(),
      maskContactPhone: false,
      escalateUrgentToHuman: true,
      agent: {
        create: {
          botType: "SALES",
          tone: "friendly",
          language: "en",
          escalationRules:
            "Hand over when the prospect asks for a custom quote, wants a live demo, mentions enterprise features, or talks about switching from another tool.",
          escalateTo: "Demo Owner",
          config: {
            productsAndPrices:
              "Starter — ₹499/month (up to 1,000 messages, QR connection)\nProfessional — ₹999/month (up to 5,000 messages, QR connection)\nEnterprise — ₹1,999/month (API connection, unlimited messages)",
            whatToAsk:
              "How many team members will use ChatWise?\nWhat's your biggest messaging challenge right now?\nAre you currently using any other chat or marketing tool?",
            checkoutLink: "https://chatwise.in/signup",
            discountPolicy:
              "15% off for annual plans. Custom pricing for teams of 10+.",
            commonObjections:
              '"Too expensive" — ChatWise replaces separate chat, CRM, and marketing tools.\n"Already using another tool" — ChatWise integrates with Google Sheets, Calendly, and common platforms.\n"Hard to set up" — We offer guided onboarding and template-based setup.',
            addOns:
              "Annual plan customers get priority support. Teams of 10+ qualify for a free migration.",
          },
        },
      },
      connection: {
        create: {
          type: "QR",
          status: "CONNECTED",
          phoneNumber: "919876543210",
          messagesReceived: 342,
          messagesSent: 187,
          lastMessageAt: new Date(),
        },
      },
      members: {
        create: [
          { userId: ownerUser.id, role: "OWNER" },
        ],
      },
    },
    include: { agent: true, connection: true, members: true },
  });

  const businessId = business.id;
  const memberId = business.members[0].id;

  // ── Step 3: Subscription ───────────────────────────────────────────────────
  console.log("💳 Creating active subscription…");
  await db.subscription.create({
    data: {
      businessId,
      plan: "SMALL_BUSINESS",
      status: "ACTIVE",
      currentPeriodStart: new Date(Date.UTC(2026, 9, 1)),
      currentPeriodEnd: new Date(Date.UTC(2026, 11, 1)),
      addons: {},
    },
  });

  // ── Step 4: Contacts ───────────────────────────────────────────────────────
  console.log("📇 Seeding contacts…");
  const contacts = [
    { name: "Priya Malhotra", phone: "919876543201", email: "priya@example.com" },
    { name: "Rahul Sharma", phone: "919876543202", email: "rahul@example.com" },
    { name: "Ananya Gupta", phone: "919876543203", email: "ananya@example.com" },
    { name: "Vikram Singh", phone: "919876543204", email: "vikram@example.com" },
    { name: "Meera Joshi", phone: "919876543205", email: "meera@example.com" },
  ];
  await db.contact.createMany({
    data: contacts.map((c) => ({ businessId, ...c })),
  });
  const contactIds = await db.contact.findMany({
    where: { businessId },
    select: { id: true, phone: true, name: true, email: true },
  });

  // ── Step 5: Conversations ──────────────────────────────────────────────────
  console.log("💬 Seeding conversations…");
  const conversations = await Promise.all(
    contactIds.map((contact, i) =>
      db.conversation.create({
        data: {
          businessId,
          contactPhone: contact.phone,
          contactName: contact.name,
          contactId: contact.id,
          lastMessageAt: new Date(Date.now() - i * 1_800_000),
          unreadCount: i % 3 === 0 ? Math.floor(Math.random() * 4) + 1 : 0,
          priority: i === 0 ? "HIGH" : "NORMAL",
          tags: i === 0 ? ["urgent"] : i === 2 ? ["follow-up"] : [],
          messages: {
            createMany: {
              data: [
                {
                  direction: "INBOUND",
                  author: "CONTACT",
                  body: `Hi! I'd like to know more about ChatWise for my business.`,
                  createdAt: new Date(Date.now() - i * 1_800_000 - 3_600_000),
                },
                {
                  direction: "OUTBOUND",
                  author: "AGENT",
                  botType: "SALES",
                  body: `Hi ${contact.name}! 👋 Great to hear from you! I'd love to help you get started with ChatWise. Could you tell me a bit about your business?`,
                  createdAt: new Date(Date.now() - i * 1_800_000 - 1_800_000),
                },
                ...(i % 3 !== 0
                  ? [
                      {
                        direction: "INBOUND",
                        author: "CONTACT",
                        body: "Yes! We have about 20 team members and use WhatsApp for customer support.",
                        createdAt: new Date(Date.now() - i * 1_800_000),
                      },
                    ]
                  : []),
              ],
            },
          },
        },
        select: { id: true },
      }),
    ),
  );
  const conversationIds = conversations.map((c) => c.id);

  // ── Step 6: Leads ───────────────────────────────────────────────────────────
  console.log("🎯 Seeding leads…");
  for (let i = 0; i < conversationIds.length; i++) {
    const status = ["NEW", "INTERESTED", "QUALIFIED", "CUSTOMER"][Math.min(i, 3)];
    await db.lead.create({
      data: {
        businessId,
        conversationId: conversationIds[i],
        contactId: contactIds[i].id,
        contactPhone: contactIds[i].phone,
        name: contactIds[i].name,
        email: contactIds[i].email,
        status,
        score: ["QUALIFIED", "CUSTOMER"].includes(status) ? 70 + i * 5 : 30 + i * 10,
        tags: status === "CUSTOMER" ? ["repeat-customer"] : [],
        summary:
          status === "CUSTOMER"
            ? "Active ChatWise customer — exploring upgrade to Professional plan."
            : status === "QUALIFIED"
              ? "Referred by existing customer, needs team of 20+ seats."
              : "Inquired about ChatWise pricing and features.",
        nextStep:
          status === "NEW"
            ? "Send product brochure and schedule a demo"
            : status === "INTERESTED"
              ? "Follow up with feature deep-dive"
              : "Prepare custom quote",
      },
    });
  }

  // ── Step 7: Knowledge base entries ─────────────────────────────────────────
  console.log("🧠 Seeding knowledge base entries…");
  const knowledgeEntries = [
    { question: "How do I connect my WhatsApp?", answer: "Go to Settings → WhatsApp Connection and scan the QR code with your WhatsApp mobile app. You'll be connected within seconds." },
    { question: "What is included in the free trial?", answer: "The 14-day free trial includes unlimited conversations, one agent, and up to 100 messages. No credit card required to start." },
    { question: "Can I use ChatWise with my existing phone number?", answer: "Yes! On the QR tier, you can use your existing WhatsApp number. On the API tier, you'll need a dedicated business phone number." },
    { question: "How do I create a message template?", answer: "Go to Templates → New Template. Choose a category, write your message, add variables like {name}, and save. Templates can be used in campaigns or automation." },
    { question: "What happens if I exceed my message limit?", answer: "You'll receive a notification when you're at 80% usage. If you exceed the limit, the agent will still reply but you'll need to upgrade your plan." },
    { question: "How do I export my conversations?", answer: "Go to Settings → Export Data. You can export as CSV or Excel. All conversation history and contact information is included." },
  ];
  for (let i = 0; i < knowledgeEntries.length; i++) {
    await db.knowledgeEntry.create({
      data: { businessId, question: knowledgeEntries[i].question, answer: knowledgeEntries[i].answer, position: i },
    });
  }

  // ── Step 8: Templates ───────────────────────────────────────────────────────
  console.log("📝 Seeding message templates…");
  const templates = [
    { name: "Welcome message", body: "Hi {name}! Welcome to TechBloom Studio 🎉 We're excited to help you grow your business." },
    { name: "Follow-up reminder", body: "Hi {name}, just checking in! Have you had a chance to review our proposal? Let us know if you have any questions." },
    { name: "Support response", body: "Thanks for reaching out, {name}! We're looking into your question and will get back to you within 24 hours. 😊" },
    { name: "Appointment confirmation", body: "Hi {name}, your appointment is confirmed for {date} at {time}. We look forward to speaking with you!" },
    { name: "Payment reminder", body: "Hi {name}, this is a friendly reminder that your payment of {amount} is due on {date}. Thank you!" },
  ];
  for (const t of templates) {
    await db.messageTemplate.create({
      data: {
        businessId,
        name: t.name,
        body: t.body,
        variables: t.body.match(/\{[a-z0-9_]+\}/gi)?.map((v) => v.replace(/[{}]/g, "")) ?? [],
      },
    });
  }

  // ── Step 9: Tags ────────────────────────────────────────────────────────────
  console.log("🏷️  Seeding tags…");
  const tagNames = ["Urgent", "Follow-up", "VIP", "repeat-customer"];
  await db.tag.createMany({ data: tagNames.map((n) => ({ businessId, name: n })) });
  const vipTag = await db.tag.findFirst({ where: { businessId, name: "VIP" } });
  if (vipTag && contactIds[0]) {
    await db.contactTag.create({
      data: { businessId, contactId: contactIds[0].id, tagId: vipTag.id, source: "MANUAL" },
    });
  }

  // ── Step 10: Quick replies ──────────────────────────────────────────────────
  console.log("🔁 Seeding quick replies…");
  await db.quickReply.createMany({
    data: [
      { businessId, title: "Office hours", body: "Our office hours are Mon–Fri 9am–6pm, Sat 9am–1pm (IST). 🕘", position: 0 },
      { businessId, title: "Free trial", body: "ChatWise offers a 14-day free trial — no credit card required! Visit chatwise.in to get started. 🚀", position: 1 },
      { businessId, title: "Thank you", body: "Thank you for your interest, {name}! 😊 Our team will reach out within 24 hours.", position: 2 },
    ],
  });

  // ── Step 11: Deals ──────────────────────────────────────────────────────────
  console.log("💰 Seeding deals…");
  for (let i = 0; i < 2; i++) {
    await db.deal.create({
      data: {
        businessId,
        contactId: contactIds[i + 1].id,
        title: ["Website Redesign", "Social Media Management"][i],
        stage: ["PROPOSAL", "WON"][i],
        value: (50000 + i * 25000).toString(),
        currency: "INR",
        ownerId: memberId,
      },
    });
  }

  // ── Done ────────────────────────────────────────────────────────────────────
  console.log("\n✅ Demo data seeded successfully!\n");
  console.log("─────────────────────────────────────");
  console.log(`User:            demo@chatwise.app`);
  console.log(`Password:        demo1234`);
  console.log(`Business:        TechBloom Studio`);
  console.log(`Industry:        Digital Marketing`);
  console.log(`Plan:            Small Business (ACTIVE)`);
  console.log(`Connection:      QR (Connected, +91 ${business.connection.phoneNumber})`);
  console.log(`Agent:           Sales`);
  console.log(`Members:         ${business.members.length}`);
  console.log(`Contacts:        ${contactIds.length}`);
  console.log(`Conversations:   ${conversationIds.length}`);
  console.log(`Leads:           ${conversationIds.length}`);
  console.log(`Templates:       ${templates.length}`);
  console.log(`Knowledge:       ${knowledgeEntries.length} entries`);
  console.log(`Quick replies:   3`);
  console.log("─────────────────────────────────────");
}

main()
  .then(() => db.$disconnect().then(() => process.exit(0)))
  .catch((e) => {
    console.error(e);
    db.$disconnect().then(() => process.exit(1));
  });

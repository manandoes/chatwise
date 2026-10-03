// Demo account for WorkPulse — an all-in-one HRMS and project management system
// by Automova Labs.
//
// This file is a standalone ESM seed script. It runs directly with Node 24+:
//   node --env-file-if-exists=.env scripts/seed-demo.ts
//
// What it does:
//   1. Deletes every User (cascades to Business, Members, and all related data)
//   2. Creates a demo user: demo@workpulse.in / demo1234
//   3. Creates a demo business "Automova Labs" with product "WorkPulse"
//      (QR connection, Small Business plan, all 3 add-ons active)
//   4. Creates an active Sales agent configured for WorkPulse
//   5. Seeds company members with realistic HR data
//   6. Seeds contacts, conversations, leads, knowledge base entries, templates
//   7. Creates a sample campaign and some analytics-relevant messages

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

  // ── Step 1: Create demo users ──────────────────────────────────────────────
  console.log("👤 Creating demo users…");

  const ownerUser = await db.user.create({
    data: { email: "demo@workpulse.in", name: "Arjun Mehta", passwordHash },
  });
  const hrUser = await db.user.create({
    data: { email: "hr@automova.com", name: "Priya Sharma", passwordHash },
  });
  const managerUser = await db.user.create({
    data: { email: "manan@automova.com", name: "Manan Agarwal", passwordHash },
  });
  const employeeUser = await db.user.create({
    data: { email: "rahul@automova.com", name: "Rahul Verma", passwordHash },
  });

  // ── Step 2: Create business ────────────────────────────────────────────────
  console.log("🏢 Creating business…");

  const business = await db.business.create({
    data: {
      userId: ownerUser.id,
      name: "Automova Labs",
      industry: "Software / HRMS",
      about:
        "WorkPulse — an all-in-one HRMS and project management system. We run attendance, payroll, hiring, performance, projects, clients, and tasks from one login. One toggle in the sidebar switches the HR view and the Projects view, so every team works in the same place with the same data.",
      timezone: "Asia/Kolkata",
      onboardingCompletedAt: new Date(),
      maskContactPhone: false,
      escalateUrgentToHuman: true,
      agent: {
        create: {
          botType: "SALES",
          tone: "professional",
          language: "en",
          escalationRules:
            "Hand over when the prospect asks for a custom enterprise quote, wants a live demo, mentions a compliance requirement, or talks about migrating from another platform.",
          escalateTo: "Arjun Mehta (Founder)",
          config: {
            productsAndPrices:
              "Small Business — ₹999/month (up to 2,000 messages, QR connection)\nEnterprise — ₹1,499/month (up to 10,000 messages, API connection)\nAdd-ons:\n  Integrations Bundle — ₹299/month\n  AI Product Search — ₹299/month\n  AI Insights — ₹199/month",
            whatToAsk:
              "How many employees will use the system?\nWhich features are most important: HR, Projects, or both?\nAre you currently using any other HRMS or project tool?",
            checkoutLink: "https://workpulse.in/signup",
            discountPolicy:
              "15% off for annual plans. 20% off for teams of 50+. Custom enterprise pricing for 100+ seats.",
            commonObjections:
              '"Too expensive" — WorkPulse replaces separate HRMS, project, and chat tools, saving 2-3 subscriptions.\n"Already using another tool" — WorkPulse integrates with Google Calendar, Slack, and common accounting tools.\n"Hard to switch" — We handle data migration and offer guided onboarding for your team.',
            addOns:
              "Annual plan customers get a free 30-minute onboarding call. Team size 50+ qualifies for dedicated account management.",
          },
        },
      },
      connection: {
        create: {
          type: "QR",
          status: "CONNECTED",
          phoneNumber: "9876543210",
          messagesReceived: 1247,
          messagesSent: 893,
          lastMessageAt: new Date(),
        },
      },
      members: {
        create: [
          { userId: ownerUser.id, role: "OWNER" },
          { userId: hrUser.id, role: "AGENT" },
          { userId: managerUser.id, role: "AGENT" },
          { userId: employeeUser.id, role: "AGENT" },
        ],
      },
    },
    include: { agent: true, connection: true, members: true },
  });

  const businessId = business.id;
  const memberId = business.members[0].id;

  // ── Step 3: Subscription ───────────────────────────────────────────────────
  console.log("💳 Creating active subscription (Small Business + all addons)…");
  await db.subscription.create({
    data: {
      businessId,
      plan: "SMALL_BUSINESS",
      status: "ACTIVE",
      currentPeriodStart: new Date(Date.UTC(2026, 9, 1)),
      currentPeriodEnd: new Date(Date.UTC(2026, 11, 1)),
      addons: { integrations: true, aiProductSearch: true, aiInsights: true },
    },
  });

  // ── Step 4: Knowledge base entries ─────────────────────────────────────────
  console.log("🧠 Seeding knowledge base entries…");
  const knowledgeEntries = [
    { question: "How do I clock in and out?", answer: "Open the WorkPulse app, tap 'My Work' and press the Clock In button. Your current location is logged automatically. When you finish work, press Clock Out. Breaks are tracked separately." },
    { question: "What are the working hours?", answer: "Automova Labs follows a 9-to-6 schedule with a 30-minute break, Monday through Friday. Saturday is a half-day (9am–1pm). The system alerts you if you forget to clock out by 8 PM." },
    { question: "How do I apply for leave?", answer: "Go to My Requests → Leave Request. Select the type (Casual, Sick, or Earned), pick your dates, and submit. Your manager will be notified and can approve or reject within 24 hours." },
    { question: "When is payroll processed?", answer: "Salaries are calculated on the 25th of every month and disbursed by the 1st of the following month. Payslips are published on the 1st and are visible in My Growth → Payslips." },
    { question: "How is performance scored?", answer: "Performance scores are calculated monthly from task completion rate, on-time delivery, peer feedback, and goal achievement. You can view your score in My Growth at any time." },
    { question: "How do I view my projects?", answer: "Toggle the sidebar to the Projects view. You'll see all projects with their status (Planning, Active, On Hold, Completed, Cancelled), team members, deadlines, and profit margins." },
    { question: "How do I log time on a task?", answer: "Open any task in the Projects view and click the Timer button. It starts a built-in timer. Stop it when you're done, and the hours are automatically added to the task's total." },
    { question: "What's the client vault?", answer: "The Client Vault stores sensitive client passwords, API keys, and shared files securely. It's accessible only to people you grant access to." },
    { question: "How do I see the team workload?", answer: "In the Projects view, open the Workload Heatmap. It shows who's at capacity and who has room, based on the weekly hours you set as full-time (default: 40 hours/week)." },
    { question: "How long are chat messages stored?", answer: "Direct and group messages are automatically cleared after 31 days to keep conversations fresh. Important files can be pinned to tasks or saved to the Client Vault." },
    { question: "Can I connect my Google Calendar?", answer: "Yes! Go to Settings → Integrations → Google Calendar. Once connected, meetings and task deadlines will appear together in your calendar view." },
    { question: "How do I post an announcement?", answer: "Go to Announcements and click 'New Post'. You can include text, images, and optional polls. Everyone in the company will see it, and poll results are anonymous." },
    { question: "How does the hiring pipeline work?", answer: "Candidates move through stages: New → Shortlisted → Interview → Offer → Hired. You can build custom application forms and publish a public careers page." },
    { question: "What request types can I submit?", answer: "Leave, Reimbursement, Equipment, Work From Home, HR Complaint, Document Request, and Suggestion. Each goes to one chosen approver and supports file attachments." },
    { question: "How do I customize notifications?", answer: "Go to Settings → Notifications. You can choose between in-app, browser push, or WhatsApp for each notification type." },
  ];
  for (let i = 0; i < knowledgeEntries.length; i++) {
    await db.knowledgeEntry.create({
      data: { businessId, question: knowledgeEntries[i].question, answer: knowledgeEntries[i].answer, position: i },
    });
  }

  // ── Step 5: Contacts ────────────────────────────────────────────────────────
  console.log("📇 Seeding contacts…");
  const employeeContacts = [
    { name: "Neha Kapoor", phone: "919876543220", email: "neha@automova.com" },
    { name: "Vikram Singh", phone: "919876543221", email: "vikram@automova.com" },
    { name: "Ananya Reddy", phone: "919876543222", email: "ananya@automova.com" },
    { name: "Karan Malhotra", phone: "919876543223", email: "karan@automova.com" },
    { name: "Meera Joshi", phone: "919876543224", email: "meera@automova.com" },
    { name: "Rohan Das", phone: "919876543225", email: "rohan@automova.com" },
    { name: "Shreya Nair", phone: "919876543226", email: "shreya@automova.com" },
    { name: "Aditya Patil", phone: "919876543227", email: "aditya@automova.com" },
  ];
  await db.contact.createMany({
    data: employeeContacts.map((e) => ({ businessId, ...e })),
  });
  const contactIds = await db.contact.findMany({
    where: { businessId },
    select: { id: true, phone: true, name: true, email: true },
  });

  // ── Step 6: Conversations ───────────────────────────────────────────────────
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
                  body: `Hi! I have a question about WorkPulse onboarding for new hires.`,
                  createdAt: new Date(Date.now() - i * 1_800_000 - 3_600_000),
                },
                {
                  direction: "OUTBOUND",
                  author: "AGENT",
                  botType: "SALES",
                  body: `Hi ${contact.name}! 👋 New hires get invited via a link and assigned to the Employee role by default. You can then promote them to Manager or HR.`,
                  createdAt: new Date(Date.now() - i * 1_800_000 - 1_800_000),
                },
                ...(i % 3 !== 0
                  ? [
                      {
                        direction: "INBOUND",
                        author: "CONTACT",
                        body: "That sounds perfect! Can I set up a demo for my team?",
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

  // ── Step 7: Leads ───────────────────────────────────────────────────────────
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
            ? "Active WorkPulse customer — exploring upgrade to Enterprise."
            : status === "QUALIFIED"
              ? "Referred by existing customer, needs team of 50+ seats."
              : "Inquired about WorkPulse HR module.",
        nextStep:
          status === "NEW"
            ? "Send product brochure and schedule a demo"
            : status === "INTERESTED"
              ? "Follow up with HR module deep-dive"
              : "Prepare custom enterprise quote",
      },
    });
  }

  // ── Step 8: Templates ───────────────────────────────────────────────────────
  console.log("📝 Seeding message templates…");
  const templates = [
    { name: "Welcome to WorkPulse", body: "Hi {name}! Welcome to WorkPulse 🎉 Your account is ready. Toggle between HR and Projects views using the sidebar switch." },
    { name: "Onboarding reminder", body: "Hi {name}, your WorkPulse onboarding session is scheduled for {date} at {time}. Please ensure all team members have their login credentials ready." },
    { name: "Payslip available", body: "Hi {name}, your payslip for {month} is now available 📄 Log in to My Growth → Payslips to view and download it." },
    { name: "Leave approved", body: "Hi {name}, your leave request from {start_date} to {end_date} has been approved ✅ Enjoy your time off!" },
    { name: "Task assignment", body: "Hi {name}, a new task has been assigned: {task_name}. Due by {due_date}. Priority: {priority}." },
    { name: "Performance review invite", body: "Hi {name}, it's time for your mid-quarter performance review 📊 Please complete your self-assessment by {deadline}." },
    { name: "Meeting reminder", body: "Hi {name}, reminder: you have a meeting with {attendee} at {time} today regarding {topic}." },
    { name: "Company announcement", body: "Hi everyone! 📢 {announcement_title}: {announcement_body}. Please review and reach out to {contact_person} with questions." },
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

  // ── Step 9: Campaign ────────────────────────────────────────────────────────
  console.log("📣 Seeding a campaign…");
  const segment = await db.segment.create({
    data: {
      businessId,
      name: "All Employees",
      filter: { field: "leadStatus", operator: "eq", value: "CUSTOMER" },
    },
  });
  await db.campaign.create({
    data: {
      businessId,
      name: "Q4 Performance Reviews Launch",
      body: "Hi {name}! Q4 performance reviews are now open. Please complete your self-assessment by {deadline} in your My Growth dashboard.",
      tier: "QR",
      status: "SENT",
      throttleMs: 2000,
      warningAcknowledgedAt: new Date(),
      scheduledFor: new Date(Date.now() - 172_800_000),
      startedAt: new Date(Date.now() - 169_200_000),
      finishedAt: new Date(Date.now() - 158_400_000),
      segmentId: segment.id,
      onlyOptedIn: true,
      variableValues: {},
      recipients: {
        createMany: {
          data: contactIds.slice(0, 5).map((c, i) => ({
            contactPhone: c.phone,
            contactName: c.name,
            conversationId: conversationIds[i] ?? "",
            body: `Hi ${c.name}! Q4 performance reviews are now open. Please complete your self-assessment by Oct 15th.`,
            status: "DELIVERED",
            sendAfter: new Date(Date.now() - 168_000_000 + i * 3000),
            sentAt: new Date(Date.now() - 167_400_000 + i * 3000),
            deliveredAt: new Date(Date.now() - 166_800_000 + i * 3000),
          })),
        },
      },
    },
  });

  // ── Step 10: Tags ───────────────────────────────────────────────────────────
  console.log("🏷️  Seeding tags…");
  const tagNames = ["Urgent", "Follow-up", "VIP", "repeat-customer", "enterprise-lead"];
  await db.tag.createMany({ data: tagNames.map((n) => ({ businessId, name: n })) });
  const vipTag = await db.tag.findFirst({ where: { businessId, name: "VIP" } });
  if (vipTag && contactIds[0]) {
    await db.contactTag.create({
      data: { businessId, contactId: contactIds[0].id, tagId: vipTag.id, source: "MANUAL" },
    });
  }

  // ── Step 11: Deals ──────────────────────────────────────────────────────────
  console.log("💰 Seeding deals…");
  for (let i = 0; i < 3; i++) {
    await db.deal.create({
      data: {
        businessId,
        contactId: contactIds[i + 2].id,
        title: ["Enterprise Upgrade", "Team Expansion", "Annual Renewal"][i],
        stage: ["PROPOSAL", "WON", "LEAD"][i],
        value: (5000 + i * 3000).toString(),
        currency: "INR",
        ownerId: memberId,
      },
    });
  }

  // ── Step 12: Booking ────────────────────────────────────────────────────────
  console.log("📅 Seeding a booking…");
  await db.booking.create({
    data: {
      businessId,
      contactId: contactIds[1].id,
      provider: "CALENDLY",
      providerEventId: "evt_workpulse_demo_001",
      eventName: "WorkPulse Enterprise Demo",
      startTime: new Date(Date.now() + 86_400_000),
      status: "BOOKED",
      inviteeName: contactIds[1].name ?? "Vikram Singh",
      inviteeEmail: contactIds[1].email ?? null,
      inviteePhone: contactIds[1].phone,
    },
  });

  // ── Step 13: Quick replies ──────────────────────────────────────────────────
  console.log("🔁 Seeding quick replies…");
  await db.quickReply.createMany({
    data: [
      { businessId, title: "Office hours", body: "Our office hours are Mon–Fri 9am–6pm, Sat 9am–1pm (IST). 🕘", position: 0 },
      { businessId, title: "Free trial", body: "WorkPulse offers a 14-day free trial — no credit card required! Visit workpulse.in to get started. 🚀", position: 1 },
      { businessId, title: "Thank you", body: "Thank you for your interest in WorkPulse, {name}! 😊 Our team will reach out within 24 hours.", position: 2 },
    ],
  });

  // ── Step 14: Additional messages for analytics ──────────────────────────────
  console.log("📊 Seeding additional messages…");
  for (let i = 0; i < 20; i++) {
    const conv = conversations[i % conversations.length];
    if (!conv) continue;
    await db.message.create({
      data: {
        conversationId: conv.id,
        direction: i % 2 === 0 ? "INBOUND" : "OUTBOUND",
        author: i % 2 === 0 ? "CONTACT" : "AGENT",
        botType: i % 2 === 0 ? null : "SALES",
        body:
          i % 2 === 0
            ? "Hi! I'd like to know more about WorkPulse's HR module features."
            : "Great question! Our HR module handles attendance, payroll, hiring, and performance — all in one place. Would you like a demo? 😊",
        createdAt: new Date(Date.now() - (i + 1) * 7_200_000),
      },
    });
  }

  // ── Done ────────────────────────────────────────────────────────────────────
  console.log("\n✅ Demo data seeded successfully!\n");
  console.log("─────────────────────────────────────");
  console.log(`User:            demo@workpulse.in`);
  console.log(`Password:        demo1234`);
  console.log(`Business:        Automova Labs`);
  console.log(`Product:         WorkPulse — HR & Projects`);
  console.log(`Plan:            Small Business (ACTIVE)`);
  console.log(`Add-ons:         Integrations, AI Product Search, AI Insights`);
  console.log(`Connection:      QR (Connected, +91 ${business.connection.phoneNumber})`);
  console.log(`Agent:           Sales`);
  console.log(`Members:         ${business.members.length} (Owner + 3)`);
  console.log(`Contacts:        ${contactIds.length}`);
  console.log(`Conversations:   ${conversationIds.length}`);
  console.log(`Leads:           ${conversationIds.length}`);
  console.log(`Templates:       ${templates.length}`);
  console.log(`Knowledge:       ${knowledgeEntries.length} entries`);
  console.log(`Campaigns:       1 (sent)`);
  console.log(`Deals:           3`);
  console.log(`Bookings:        1`);
  console.log(`Quick replies:   3`);
  console.log("─────────────────────────────────────");
}

main()
  .then(() => db.$disconnect().then(() => process.exit(0)))
  .catch((e) => {
    console.error(e);
    db.$disconnect().then(() => process.exit(1));
  });
// Demo seed script — wipes all existing data and creates a fully populated
// demo account so you can preview the entire product flow.
//
// Run with:
//   node --env-file-if-exists=.env scripts/seed-demo.ts
//
// What it does:
//   1. Deletes every User (cascades to Business, Members, and all related data)
//   2. Creates a demo user: demo@chatwise.in / demo1234
//   3. Creates a demo business "FreshBites Cafe" (QR connection, Small Business plan)
//   4. Fills in all onboarding data (agent, connection, business details, behavior)
//   5. Seeds contacts, conversations, leads, knowledge base entries, templates
//   6. Creates a sample campaign and some analytics-relevant messages
//   7. Creates a Subscription row with ACTIVE status and SMALL_BUSINESS plan
//
// The subscription row is created directly in the DB (not via Razorpay API)
// so the demo account is immediately usable without any payment setup.

import "server-only";

import { db } from "../lib/db";
import { hashPassword } from "../lib/password";
import { randomBytes } from "node:crypto";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function clearAll() {
  // Delete in reverse cascade order to avoid FK issues.
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

  console.log("👤 Creating demo user…");
  const user = await db.user.create({
    data: {
      email: "demo@chatwise.in",
      name: "Ananya Sharma",
      passwordHash,
    },
  });

  console.log("🏢 Creating business…");
  const business = await db.business.create({
    data: {
      userId: user.id,
      name: "FreshBites Cafe",
      industry: "Food & Beverage",
      about:
        "A popular South Indian cafe in Indiranagar, Bengaluru. Known for filter coffee, dosas, and fresh idlis. We deliver within 5 km and take walk-in orders.",
      timezone: "Asia/Kolkata",
      onboardingCompletedAt: new Date(),
      maskContactPhone: false,
      escalateUrgentToHuman: true,
      agent: {
        create: {
          botType: "RECEPTIONIST" as const,
          tone: "friendly",
          language: "hi-en",
          escalationRules:
            "Hand over when the customer asks about refunds, complaints, or anything involving money they already paid.",
          escalateTo: "Ananya (owner)",
        },
      },
      connection: {
        create: {
          type: "QR",
          status: "CONNECTED",
          phoneNumber: "9876543210",
          messagesReceived: 342,
          messagesSent: 187,
          lastMessageAt: new Date(),
        },
      },
      members: {
        create: { userId: user.id, role: "OWNER" },
      },
    },
    include: { agent: true, connection: true, members: true },
  });

  const businessId = business.id;
  const memberId = business.members[0].id;
  const agentId = business.agent!.id;
  const connectionId = business.connection!.id;

  console.log("💳 Creating active subscription (Small Business)…");
  await db.subscription.create({
    data: {
      businessId,
      plan: "SMALL_BUSINESS",
      status: "ACTIVE",
      currentPeriodStart: new Date(Date.UTC(2026, 9, 1)),
      currentPeriodEnd: new Date(Date.UTC(2026, 10, 1)),
      addons: { integrations: true, aiProductSearch: true },
    },
  });

  console.log("📇 Seeding contacts…");
  const contacts = await db.contact.createMany({
    data: [
      { businessId, phone: "919876543210", name: "Rohit Mehta", email: "rohit@example.com" },
      { businessId, phone: "919876543211", name: "Priya Nair", email: "priya@example.com" },
      { businessId, phone: "919876543212", name: "Arjun Reddy" },
      { businessId, phone: "919876543213", name: "Sneha Patel" },
      { businessId, phone: "919876543214", name: "Vikram Singh" },
      { businessId, phone: "919876543215", name: "Deepa Krishnan" },
      { businessId, phone: "919876543216", name: "Karan Malhotra" },
      { businessId, phone: "919876543217", name: "Meera Joshi" },
    ],
  });

  const contactIds = await db.contact.findMany({
    where: { businessId },
    select: { id: true, phone: true, name: true, email: true },
  });

  console.log("💬 Seeding conversations…");
  const conversations = await Promise.all(
    contactIds.map((contact: any, i: number) =>
      db.conversation.create({
        data: {
          businessId,
          contactPhone: contact.phone,
          contactName: contact.name,
          contactId: contact.id,
          lastMessageAt: new Date(Date.now() - i * 3600_000),
          unreadCount: i % 3 === 0 ? Math.floor(Math.random() * 5) + 1 : 0,
          priority: i === 0 ? "HIGH" : "NORMAL",
          tags: i % 2 === 0 ? ["vip"] : [],
          messages: {
            createMany: {
              data: [
                {
                  direction: "INBOUND" as const,
                  author: "CONTACT" as const,
                  body: `Hi! I'd like to know your today's special.`,
                  createdAt: new Date(Date.now() - i * 3600_000 - 7200_000),
                },
                {
                  direction: "OUTBOUND",
                  author: "AGENT" as const,
                  botType: "RECEPTIONIST" as const,
                  body: `Hey ${contact.name ?? "there"}! 🎉 Today's special is our masala dosa with coconut chutney — only ₹60! Want me to reserve one for you?`,
                  createdAt: new Date(Date.now() - i * 3600_000 - 3600_000),
                },
                ...(i % 3 !== 0
                  ? [
                      {
                        direction: "INBOUND" as const,
                        author: "CONTACT" as const,
                        body: `Yes please! Can I get it for delivery?`,
                        createdAt: new Date(Date.now() - i * 3600_000),
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

  console.log("🎯 Seeding leads…");
  for (let i = 0; i < conversationIds.length; i++) {
    const statusOptions = ["NEW", "INTERESTED", "QUALIFIED", "CUSTOMER"] as const;
    const status = statusOptions[Math.min(i, statusOptions.length - 1)];
    await db.lead.create({
      data: {
        businessId,
        conversationId: conversationIds[i],
        contactId: contactIds[i].id,
        contactPhone: contactIds[i].phone,
        name: contactIds[i].name,
        email: contactIds[i].email,
        status,
        score: status === "QUALIFIED" || status === "CUSTOMER" ? 70 + i * 5 : 30 + i * 10,
        tags: status === "CUSTOMER" ? ["repeat-customer"] : [],
        summary: `Customer interested in ${status === "CUSTOMER" ? "ordering food" : status === "QUALIFIED" ? "catering for an event" : "today's menu"}.`,
        nextStep:
          status === "NEW"
            ? "Send menu and special of the day"
            : status === "INTERESTED"
              ? "Confirm order details"
              : status === "QUALIFIED"
                ? "Arrange catering quote"
                : "Thank them and ask for review",
      },
    });
  }

  console.log("🧠 Seeding knowledge base entries…");
  const knowledgeEntries = [
    {
      question: "What are your opening hours?",
      answer:
        "We're open Monday to Saturday, 8am–10pm, and Sunday 9am–9pm. We close 30 minutes before closing time for orders.",
    },
    {
      question: "Do you deliver?",
      answer:
        "Yes! We deliver within a 5 km radius of Indiranagar. Delivery is free for orders above ₹300. Otherwise, there's a flat ₹40 delivery fee.",
    },
    {
      question: "What payment methods do you accept?",
      answer:
        "We accept UPI (GPay, PhonePe, Paytm), credit/debit cards, and cash on delivery. You can also pay via the payment link we send on WhatsApp.",
    },
    {
      question: "Do you have vegetarian options?",
      answer:
        "Absolutely! About 70% of our menu is vegetarian. We also have a separate vegan section — just ask for the vegan menu.",
    },
    {
      question: "Can I book a table for a party?",
      answer:
        "Yes, we take reservations for groups of 4 or more. Please call us at 080-4567-8900 or message us here with your preferred date and time.",
    },
    {
      question: "Do you offer catering?",
      answer:
        "We do! We cater for office lunches, birthday parties, and small events. Minimum order is 20 people. Contact us at catering@freshbites.in for a custom quote.",
    },
    {
      question: "Is there parking available?",
      answer:
        "Yes, we have a small parking area behind the cafe that can fit 4–5 cars. Street parking is also available on MG Road.",
    },
    {
      question: "What is your refund policy?",
      answer:
        "If you're not happy with your order, please let us know within 30 minutes of delivery and we'll replace it or refund you in full. Contact us here or call 080-4567-8900.",
    },
    {
      question: "Do you have gluten-free options?",
      answer:
        "Yes! Our idli, appam, and many of our curries are naturally gluten-free. Please let us know about any allergies when you order.",
    },
    {
      question: "What are your best-selling items?",
      answer:
        "Our top 5 are: Masala Dosa (₹60), Mysore Pak Idli (₹50), Filter Coffee (₹30), Uttapam (₹70), and the FreshBites Thali (₹180).",
    },
    {
      question: "Can I customize my order?",
      answer:
        "Of course! You can ask for extra spicy, less oil, or add/remove any ingredient. Just let us know when you place your order.",
    },
    {
      question: "Do you serve breakfast all day?",
      answer:
        "Yes! Our breakfast menu (dosas, idlis, uttapams) is available all day, every day.",
    },
  ];

  for (let i = 0; i < knowledgeEntries.length; i++) {
    await db.knowledgeEntry.create({
      data: {
        businessId,
        question: knowledgeEntries[i].question,
        answer: knowledgeEntries[i].answer,
        position: i,
      },
    });
  }

  console.log("📝 Seeding saved templates…");
  const templateNames = [
    "Welcome message",
    "Order confirmed",
    "Out for delivery",
    "Follow-up thank you",
    "Feedback request",
    "Festival offer",
    "Reservation reminder",
    "Catering inquiry reply",
  ];
  const templateBodies = [
    "Hi {name}! Welcome to FreshBites Cafe 😊 We're so glad you reached out. How can we help you today?",
    "Hi {name}, your order #{order_id} is confirmed! 🎉 It will be ready in about 20 minutes. Track your delivery here: {link}",
    "Hi {name}, your order is out for delivery! 📦 It should reach you shortly. Please keep your phone handy.",
    "Hi {name}, thanks for visiting FreshBites! 🙏 We'd love to hear about your experience. Reply with a rating from 1–5.",
    "Hey {name}! Hope you loved your meal at FreshBites 💛 Would you mind leaving us a review? It helps us a lot!",
    "Hi {name}! 🎊 Diwali special — 20% off on all thalis this week! Use code DIWALI20 at checkout. Valid till 7 Nov.",
    "Hi {name}, this is a friendly reminder about your reservation today at 7pm. We've saved a table for {party_size} people. See you soon!",
    "Hi {name}, thanks for your catering inquiry! 🎉 Our team will reach out within 2 hours with a custom quote. In the meantime, check out our catering menu: {link}",
  ];

  for (let i = 0; i < templateNames.length; i++) {
    await db.messageTemplate.create({
      data: {
        businessId,
        name: templateNames[i],
        body: templateBodies[i],
        variables: templateBodies[i]
          .match(/\{[a-z0-9_]+\}/gi)
          ?.map((v) => v.replace(/[{}]/g, "")) ?? [],
      },
    });
  }

  console.log("📣 Seeding a campaign…");
  const segment = await db.segment.create({
    data: {
      businessId,
      name: "All Customers",
      filter: { field: "leadStatus", operator: "eq", value: "CUSTOMER" },
    },
  });

  const campaign = await db.campaign.create({
    data: {
      businessId,
      name: "Diwali Special Offer",
      body: "Hi {name}! 🎊 Diwali special — 20% off on all thalis this week! Use code DIWALI20 at checkout. Valid till 7 Nov. Reply STOP to opt out.",
      tier: "QR",
      status: "SENT",
      throttleMs: 2000,
      warningAcknowledgedAt: new Date(),
      scheduledFor: new Date(Date.now() - 86400_000),
      startedAt: new Date(Date.now() - 82000_000),
      finishedAt: new Date(Date.now() - 72000_000),
      segmentId: segment.id,
      onlyOptedIn: true,
      variableValues: {},
      recipients: {
        createMany: {
          data: contactIds.slice(0, 5).map((c: any, i: number) => ({
            contactPhone: c.phone,
            contactName: c.name,
            conversationId: conversationIds[i] ?? "",
            body: `Hi ${c.name ?? "there"}! 🎊 Diwali special — 20% off on all thalis this week! Use code DIWALI20 at checkout. Valid till 7 Nov. Reply STOP to opt out.`,
            status: "DELIVERED",
            sendAfter: new Date(Date.now() - 80000_000 + i * 3000),
            sentAt: new Date(Date.now() - 79000_000 + i * 3000),
            deliveredAt: new Date(Date.now() - 78000_000 + i * 3000),
          })),
        },
      },
    },
  });

  console.log("🏷️  Seeding tags…");
  await db.tag.createMany({
    data: [
      { businessId, name: "VIP" },
      { businessId, name: "repeat-customer" },
      { businessId, name: "catering-lead" },
      { businessId, name: "festival-offer" },
    ],
  });
  // Attach VIP tag to the first contact
  await db.contactTag.create({
    data: { businessId, contactId: contactIds[0].id, tagId: (await db.tag.findFirst({ where: { businessId, name: "VIP" } }))!.id, source: "MANUAL" },
  });

  console.log("💰 Seeding deals…");
  for (let i = 0; i < 3; i++) {
    await db.deal.create({
      data: {
        businessId,
        contactId: contactIds[i + 2].id,
        title: ["Office catering", "Birthday party", "Weekend brunch"].at(i)!,
        stage: (["PROPOSAL", "WON", "LEAD"].at(i) as any)!,
        value: (5000 + i * 3000).toString(),
        currency: "INR",
        ownerId: memberId,
      },
    });
  }

  console.log("📅 Seeding a booking…");
  await db.booking.create({
    data: {
      businessId,
      contactId: contactIds[1].id,
      provider: "CALENDLY",
      providerEventId: "evt_demo_booking_001",
      eventName: "Catering Consultation",
      startTime: new Date(Date.now() + 86400_000),
      status: "BOOKED",
      inviteeName: contactIds[1].name ?? "Priya Nair",
      inviteeEmail: contactIds[1].email ?? null,
      inviteePhone: contactIds[1].phone,
    },
  });

  console.log("🔁 Seeding quick replies…");
  await db.quickReply.createMany({
    data: [
      {
        businessId,
        title: "Opening hours",
        body: "We're open Mon–Sat 8am–10pm, Sun 9am–9pm. 🕘",
        position: 0,
      },
      {
        businessId,
        title: "Delivery info",
        body: "We deliver within 5 km of Indiranagar. Free delivery on orders above ₹300! 🚗",
        position: 1,
      },
      {
        businessId,
        title: "Thank you",
        body: "Thank you for your order, {name}! 😊 We'll get back to you shortly.",
        position: 2,
      },
    ],
  });

  console.log("📊 Seeding additional messages for analytics…");
  for (let i = 0; i < 20; i++) {
    const conversation = conversations[i % conversations.length];
    if (!conversation) continue;
    await db.message.create({
      data: {
        conversationId: conversation.id,
        direction: i % 2 === 0 ? ("INBOUND" as const) : ("OUTBOUND" as const),
        author: (i % 2 === 0 ? "CONTACT" : "AGENT") as "CONTACT" | "AGENT",
        botType: i % 2 === 0 ? null : "RECEPTIONIST",
        body:
          i % 2 === 0
            ? `Hi! I have a question about your menu.`
            : `Thanks for reaching out! Let me help you with that. 😊`,
        createdAt: new Date(Date.now() - (i + 1) * 7200_000),
      },
    });
  }

  console.log("✅ Demo data seeded successfully!\n");
  console.log("─────────────────────────────────────");
  console.log(`User:       demo@chatwise.in`);
  console.log(`Password:   demo1234`);
  console.log(`Business:   FreshBites Cafe`);
  console.log(`Plan:       Small Business (ACTIVE)`);
  console.log(`Connection: QR (Connected, +91 ${business.connection!.phoneNumber})`);
  console.log(`Agent:      Receptionist`);
  console.log(`Contacts:   ${contactIds.length}`);
  console.log(`Conversations: ${conversationIds.length}`);
  console.log(`Leads:      ${conversationIds.length}`);
  console.log(`Templates:  ${templateNames.length}`);
  console.log(`Knowledge entries: ${knowledgeEntries.length}`);
  console.log(`Campaigns:  1 (sent)`);
  console.log(`Deals:      3`);
  console.log(`Bookings:   1`);
  console.log(`Quick replies: 3`);
  console.log("─────────────────────────────────────");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  });

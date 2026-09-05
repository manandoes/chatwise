// The ready-made messages a customer starts from (docs/PRD.md §7.3).
//
// These ship as code rather than as database rows, for two reasons: nobody has
// to run a seed script for a new account to have them, and improving the
// wording later improves it for everybody without a migration. Picking one
// copies its words into the campaign being written; from that moment the
// campaign owns them, and editing this file never changes what somebody
// already sent.
//
// Placeholders are written {like_this}. Only {name} is filled in per recipient
// — everything else is for the owner to replace before the campaign will send,
// and campaigns/send-campaign.ts refuses to schedule one that still has any
// left. "Up to {discount}% off" going out to twenty-five people is the exact
// mistake that check exists to prevent.
//
// No imports on purpose: the campaign builder runs in the browser and reads
// this list directly.

export type StarterTemplate = {
  id: string;
  /** The group it appears under in the picker. */
  category: string;
  /** What the owner sees in the list. */
  name: string;
  body: string;
};

/** The placeholder ChatWise fills in itself, per recipient. */
export const NAME_PLACEHOLDER = "{name}";

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "special-offer",
    category: "Promotions and offers",
    name: "A special offer",
    body: "Hi {name}! 🎉 We've got a special offer just for you — {offer}. Valid till {date}. Reply YES to grab it!",
  },
  {
    id: "seasonal-sale",
    category: "Promotions and offers",
    name: "Seasonal sale",
    body: "{name}, our biggest sale of the season is live! Up to {discount}% off. Shop now: {link}",
  },
  {
    id: "enquiry-follow-up",
    category: "Following up",
    name: "Following up on an enquiry",
    body: "Hi {name}, just following up on your enquiry about {product}. Still interested? Happy to help!",
  },
  {
    id: "we-miss-you",
    category: "Following up",
    name: "Welcoming somebody back",
    body: "We miss you, {name}! Here's {incentive} to welcome you back. 😊",
  },
  {
    id: "appointment-reminder",
    category: "Appointments",
    name: "Appointment reminder",
    body: "Hi {name}, this is a reminder for your appointment on {date} at {time}. Reply CONFIRM or RESCHEDULE.",
  },
  {
    id: "booking-confirmed",
    category: "Appointments",
    name: "Booking confirmed",
    body: "Thanks for booking with us, {name}! Your slot on {date} is confirmed. See you then. 📅",
  },
  {
    id: "order-shipped",
    category: "Orders and delivery",
    name: "Order shipped",
    body: "Good news {name}! Your order #{order_id} has shipped and will arrive by {date}. 📦",
  },
  {
    id: "out-for-delivery",
    category: "Orders and delivery",
    name: "Out for delivery",
    body: "Hi {name}, your order #{order_id} is out for delivery today. Please keep your phone handy.",
  },
  {
    id: "how-did-we-do",
    category: "Feedback",
    name: "How did we do?",
    body: "Hi {name}, thanks for your recent purchase! How did we do? Reply 1–5 (5 = loved it) ⭐",
  },
  {
    id: "feedback-on-product",
    category: "Feedback",
    name: "Feedback on something they bought",
    body: "{name}, we'd love your feedback on {product}. It takes 30 seconds and really helps us. 🙏",
  },
  {
    id: "payment-reminder",
    category: "Payments",
    name: "Payment reminder",
    body: "Hi {name}, a friendly reminder that your payment of {amount} for {item} is due on {date}. Pay here: {link}",
  },
];

/** The groups, in the order the picker shows them. */
export const STARTER_CATEGORIES: string[] = [
  ...new Set(STARTER_TEMPLATES.map((template) => template.category)),
];

export function starterTemplate(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((template) => template.id === id);
}

/**
 * Fills in this one person's copy.
 *
 * Only {name} is substituted, and an unknown name becomes "there" so nobody
 * receives a message addressed to an empty space. Every other placeholder is
 * left exactly as it is, which is what lets the scheduling check notice that
 * one was never filled in.
 */
export function personalise(body: string, name: string | null): string {
  const who = name?.trim() || "there";

  return body.split(NAME_PLACEHOLDER).join(who);
}

/**
 * Placeholders still sitting in a message, other than {name}.
 *
 * Returned rather than thrown so the screen can name them: "you still need to
 * fill in {offer} and {date}" is actionable, "invalid template" is not.
 */
export function unfilledPlaceholders(body: string): string[] {
  const found = body.match(/\{[a-z0-9_]+\}/gi) ?? [];

  return [...new Set(found.filter((one) => one !== NAME_PLACEHOLDER))];
}

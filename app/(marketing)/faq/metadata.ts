import type { Metadata } from "next";

export const metadata: Metadata = {
  title:
    "FAQ — WhatsApp AI Agent Questions | Connection, Limits & Data | ChatWise",
  description:
    "Frequently asked questions about ChatWise: how WhatsApp AI agents connect, what they can do, bulk messaging limits, data separation, and privacy.",
  keywords: [
    "WhatsApp AI FAQ",
    "WhatsApp chatbot questions",
    "WhatsApp Business API FAQ",
    "AI agent limits",
  ],
  alternates: {
    canonical: "https://chatwise.automovalabs.tech/faq",
  },
  openGraph: {
    url: "https://chatwise.automovalabs.tech/faq",
    title: "FAQ — WhatsApp AI Agent Questions",
    description:
      "Frequently asked questions about ChatWise: connections, agent capabilities, limits, and data privacy.",
    images: [
      {
        url: "https://chatwise.automovalabs.tech/api/og?title=ChatWise+FAQ&description=WhatsApp+AI+agent+questions+and+answers",
        width: 1200,
        height: 630,
        alt: "ChatWise FAQ",
      },
    ],
  },
  twitter: {
    title: "FAQ — WhatsApp AI Agent Questions | ChatWise",
    description:
      "Frequently asked questions about ChatWise: connections, agent capabilities, limits, and data privacy.",
    images: [
      "https://chatwise.automovalabs.tech/api/og?title=ChatWise+FAQ&description=WhatsApp+AI+FAQ",
    ],
  },
};

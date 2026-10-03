import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Design.md §3 — Geist for headings and body, JetBrains Mono only for
// genuinely code-like values (IDs, tokens), used sparingly.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#22c55e",
};

export const metadata: Metadata = {
  title: {
    default:
      "ChatWise — WhatsApp AI Agents for Your Business | Automate Conversations",
    template: "%s · ChatWise",
  },
  description:
    "Set up a pre-built WhatsApp AI agent, connect your own number, and manage every conversation and lead from one dashboard. No coding required.",
  keywords: [
    "WhatsApp AI",
    "WhatsApp chatbot",
    "WhatsApp business",
    "AI agent",
    "customer support automation",
    "WhatsApp marketing",
    "lead qualification",
    "automovalabs",
  ],
  authors: [{ name: "Automovalabs" }],
  creator: "Automovalabs",
  publisher: "Automovalabs",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://chatwise.automovalabs.tech",
    types: {
      "application/rss+xml": [
        { title: "ChatWise Blog", url: "https://chatwise.automovalabs.tech/blog/rss.xml" },
      ],
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://chatwise.automovalabs.tech",
    siteName: "ChatWise",
    title: "ChatWise — WhatsApp AI Agents for Your Business",
    description:
      "Set up a pre-built WhatsApp AI agent, connect your own number, and manage every conversation and lead from one dashboard.",
    images: [
      {
        url: "https://chatwise.automovalabs.tech/api/og?title=ChatWise&description=WhatsApp+AI+agents+for+your+business",
        width: 1200,
        height: 630,
        alt: "ChatWise — WhatsApp AI Agents for Your Business",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ChatWise — WhatsApp AI Agents for Your Business",
    description:
      "Set up a pre-built WhatsApp AI agent, connect your own number, and manage every conversation and lead from one dashboard.",
    images: [
      "https://chatwise.automovalabs.tech/api/og?title=ChatWise&description=WhatsApp+AI+agents+for+your+business",
    ],
    creator: "@automovalabs",
    site: "@automovalabs",
  },
  metadataBase: new URL("https://chatwise.automovalabs.tech"),
  verification: {
    google: "YOUR_GOOGLE_SEARCH_CONSOLE_CODE",
    yandex: "",
    yahoo: "",
    other: {
      "msvalidate-01": "",
      "pdomain-verification": "",
    },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
      dir="ltr"
    >
      <head>
        {/* Preconnect to external resources for performance */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <meta name="color-scheme" content="dark" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

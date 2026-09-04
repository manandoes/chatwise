import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: {
    default: "ChatWise — WhatsApp AI agents for your business",
    template: "%s · ChatWise",
  },
  description:
    "Set up a pre-built WhatsApp AI agent, connect your own number, and manage every conversation and lead from one dashboard.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

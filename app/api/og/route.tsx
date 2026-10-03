import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title") || "ChatWise";
  const description =
    searchParams.get("description") ||
    "WhatsApp AI agents for your business. Connect your number and automate conversations.";

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f172a"/>
      <stop offset="100%" style="stop-color:#1e293b"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#22c55e"/>
      <stop offset="100%" style="stop-color:#16a34a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="950" cy="100" r="300" fill="#22c55e" opacity="0.08"/>
  <circle cx="200" cy="550" r="250" fill="#22c55e" opacity="0.05"/>
  <text x="80" y="220" font-family="system-ui,-apple-system,sans-serif" font-size="72" font-weight="800" fill="white">ChatWise</text>
  <text x="80" y="300" font-family="system-ui,-apple-system,sans-serif" font-size="32" fill="#94a3b8">${description.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>
  <rect x="80" y="360" width="180" height="56" rx="8" fill="url(#accent)"/>
  <text x="170" y="395" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="20" font-weight="600" fill="white">Get Started</text>
  <text x="80" y="580" font-family="system-ui,-apple-system,sans-serif" font-size="18" fill="#64748b">chatwise.automovalabs.tech</text>
</svg>`;

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}

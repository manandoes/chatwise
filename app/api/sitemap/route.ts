import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = "https://chatwise.automovalabs.tech";

  const routes = [
    { path: "/", lastmod: "2026-10-01", changefreq: "daily", priority: "1.0" },
    {
      path: "/features",
      lastmod: "2026-10-01",
      changefreq: "weekly",
      priority: "0.9",
    },
    {
      path: "/pricing",
      lastmod: "2026-10-01",
      changefreq: "weekly",
      priority: "0.9",
    },
    {
      path: "/faq",
      lastmod: "2026-10-01",
      changefreq: "weekly",
      priority: "0.8",
    },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    ({ path, lastmod, changefreq, priority }) =>
      `  <url>
    <loc>${baseUrl}${path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

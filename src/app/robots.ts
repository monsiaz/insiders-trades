import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://insiders-trades-sigma.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          // EN (default)
          "/",
          "/fonctionnement",
          "/methodologie",
          "/performance",
          "/strategie",
          "/pitch",
          "/docs",
          "/docs/mcp",
          "/company/",
          "/insider/",
          "/companies",
          "/insiders",
          "/backtest",
          // FR
          "/fr/",
          "/fr/fonctionnement",
          "/fr/methodologie",
          "/fr/performance",
          "/fr/strategie",
          "/fr/pitch",
          "/fr/docs",
          "/fr/docs/mcp",
          "/fr/company/",
          "/fr/insider/",
          "/fr/companies",
          "/fr/insiders",
          "/fr/backtest",
        ],
        disallow: [
          "/admin/",
          "/api/",
          "/auth/",
          "/account/",
          "/portfolio",
          "/recommendations",
          "/companies/add",
          "/_next/",
          "/en/",
        ],
      },
      {
        userAgent: "GPTBot",
        disallow: ["/"],
      },
      {
        userAgent: "CCBot",
        disallow: ["/"],
      },
      {
        userAgent: "anthropic-ai",
        disallow: ["/"],
      },
      {
        userAgent: "Google-Extended",
        disallow: ["/"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}

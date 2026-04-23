import type { Metadata } from "next";
import { DM_Serif_Display, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AppNav } from "@/components/AppNav";
import { AppFooter } from "@/components/AppFooter";
import { DataTicker } from "@/components/DataTicker";
import { PageTransition } from "@/components/PageTransition";
import { headers } from "next/headers";
import type { Locale } from "@/lib/i18n";

// Self-hosted, preloaded, non-blocking Google Fonts via next/font
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
  preload: true,
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-serif",
  weight: ["400"],
  style: ["normal", "italic"],
  preload: true,
});

export const metadata: Metadata = {
  title: "Insiders Trades Sigma · Insider Transaction Intelligence",
  description: "Track French insider transactions published by the AMF. Detect accumulation signals, backtest historical performance. MAR regulation · AMF France.",
  keywords: ["insider trading", "AMF", "insider declarations", "insider transactions", "financial signal", "Sigma"],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "Insiders Trades Sigma · Insider Transaction Intelligence",
    description: "Track French insider transactions published by the AMF. Accumulation signals + historical backtesting.",
    type: "website",
    locale: "en_US",
    alternateLocale: ["fr_FR"],
    siteName: "Insiders Trades Sigma",
    images: [{ url: "/logo-mark.png", width: 512, height: 323, alt: "Insiders Trades Sigma" }],
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FDFBF7" },
    { media: "(prefers-color-scheme: dark)",  color: "#112A46" },
  ],
};

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://insiders-trades-sigma.vercel.app";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const locale = (headersList.get("x-locale") ?? "en") as Locale;
  const originalPath = headersList.get("x-original-path") ?? "/";

  // Strip locale prefix to get the canonical path for hreflang
  const canonicalPath = originalPath.startsWith("/fr")
    ? (originalPath.slice(3) || "/")
    : originalPath;
  const canonicalPathNoQuery = canonicalPath.split("?")[0];

  const hreflangEn = `${BASE_URL}${canonicalPathNoQuery === "/" ? "" : canonicalPathNoQuery}`;
  const hreflangFr = `${BASE_URL}/fr${canonicalPathNoQuery === "/" ? "" : canonicalPathNoQuery}`;

  return (
    <html
      lang={locale}
      className={`dark ${inter.variable} ${dmSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Hreflang — cross-link sister pages for SEO */}
        <link rel="alternate" hrefLang="en" href={hreflangEn} />
        <link rel="alternate" hrefLang="fr" href={hreflangFr} />
        <link rel="alternate" hrefLang="x-default" href={hreflangEn} />
        {/* Canonical */}
        <link rel="canonical" href={locale === "fr" ? hreflangFr : hreflangEn} />

        {/* Pre-connect to image CDN for faster logo loading */}
        <link rel="preconnect" href="https://public.blob.vercel-storage.com" />
        <link rel="dns-prefetch" href="https://public.blob.vercel-storage.com" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('it-theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=s||(d?'dark':'light');document.documentElement.classList.remove('dark','light');document.documentElement.classList.add(t);}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          {/* Background texture */}
          <div className="bg-scene" aria-hidden>
            <div className="bg-orb-3" />
          </div>

          {/* Top navigation */}
          <AppNav />

          {/* Page transition overlay — shows on every internal navigation */}
          <PageTransition />

          {/* Page content */}
          <main className="page-main">
            {children}
          </main>

          {/* Data freshness ticker — strip just above footer */}
          <DataTicker />

          {/* Footer */}
          <AppFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}

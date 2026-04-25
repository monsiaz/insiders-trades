import type { Metadata } from "next";
import { DM_Serif_Display, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AppNav } from "@/components/AppNav";
import { AppFooter } from "@/components/AppFooter";
import { DataTicker } from "@/components/DataTicker";
import { headers } from "next/headers";
import type { Locale } from "@/lib/i18n";

// Self-hosted, preloaded, non-blocking Google Fonts via next/font
// Only load 400 + 600 — 500 and 700 are approximated by the browser from these two,
// saving ~40 KB of font data on the critical path.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  weight: ["400", "600"],
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
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
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
  // x-original-path = the URL the browser actually requested (set by middleware).
  // Fallback chain: x-original-path → x-locale + "/" → "/".
  // Note: page-level generateMetadata() sets a more precise self-canonical that
  // overrides this layout canonical for pages that define it explicitly.
  const originalPath = headersList.get("x-original-path") ?? "";
  const xLocale      = headersList.get("x-locale") ?? "en";

  // If x-original-path is missing or stale (e.g., "/" from a previous layout render),
  // fall back to x-locale for at least the language detection.
  const isFrPath = originalPath
    ? (originalPath === "/fr" || originalPath.startsWith("/fr/"))
    : xLocale === "fr";
  const locale: Locale = isFrPath ? "fr" : "en";

  // Strip /fr prefix to get the language-neutral path
  // If originalPath is empty/stale ("/"), the canonical falls back to home ("/" or "/fr/")
  // which is harmless for non-home pages since their own generateMetadata() overrides it.
  const basePath = originalPath
    ? (isFrPath ? (originalPath.slice(3) || "/") : originalPath)
    : "/";
  // Strip query string, ensure trailing slash on every path except root
  let canonicalPathClean = basePath.split("?")[0];
  if (canonicalPathClean !== "/" && !canonicalPathClean.endsWith("/")) {
    canonicalPathClean = canonicalPathClean + "/";
  }

  const hreflangEn = canonicalPathClean === "/"
    ? `${BASE_URL}/`
    : `${BASE_URL}${canonicalPathClean}`;
  const hreflangFr = canonicalPathClean === "/"
    ? `${BASE_URL}/fr/`
    : `${BASE_URL}/fr${canonicalPathClean}`;

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${dmSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Theme-detection script — MUST be first in <head>, runs synchronously
          before any CSS is applied, so no flash of wrong theme ever occurs.
          Reads localStorage → applies .dark or .light to <html> immediately.
          The @media (prefers-color-scheme: light) rule in globals.css handles
          the no-JS / before-script case for system-light users.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
  var s=localStorage.getItem('it-theme');
  var sys=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
  var t=s&&s!=='system'?s:sys;
  document.documentElement.classList.remove('dark','light');
  document.documentElement.classList.add(t);
  document.documentElement.dataset.themeMode=s||'system';
}catch(e){}})();`,
          }}
        />

        {/* Robots: index, follow on all public pages */}
        <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />

        {/*
          Hreflang — layout-level fallback for pages without explicit alternates.
          Each page's generateMetadata() sets a more precise canonical + languages.
          NOTE: do NOT add <link rel="canonical"> here — it would not update on
          client-side navigation (layout doesn't re-render), causing stale canonicals.
        */}
        <link rel="alternate" hrefLang="en" href={hreflangEn} />
        <link rel="alternate" hrefLang="fr" href={hreflangFr} />
        <link rel="alternate" hrefLang="x-default" href={hreflangEn} />

        {/* Pre-connect to image CDN for faster logo loading */}
        <link rel="preconnect" href="https://public.blob.vercel-storage.com" />
        <link rel="dns-prefetch" href="https://public.blob.vercel-storage.com" />
      </head>
      <body>
        <ThemeProvider>
          {/* Background texture */}
          <div className="bg-scene" aria-hidden>
            <div className="bg-orb-3" />
          </div>

          {/* Top navigation */}
          <AppNav />

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

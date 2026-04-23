import type { Metadata } from "next";
import { DM_Serif_Display, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AppNav } from "@/components/AppNav";
import { AppFooter } from "@/components/AppFooter";
import { DataTicker } from "@/components/DataTicker";
import { PageProgress } from "@/components/PageProgress";

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
  title: "Insiders Trades Sigma · Intelligence des transactions dirigeants",
  description: "Suivez les déclarations AMF des dirigeants français. Détectez les signaux d'accumulation, backtestez les performances historiques. Réglementation MAR · AMF France.",
  keywords: ["insider trading", "AMF", "déclarations dirigeants", "transactions initiés", "signal financier", "Sigma"],
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
    title: "Insiders Trades Sigma · Intelligence des transactions dirigeants",
    description: "Suivez les déclarations AMF des dirigeants français. Signaux d'accumulation + backtesting historique.",
    type: "website",
    locale: "fr_FR",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`dark ${inter.variable} ${dmSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
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

          {/* Gold progress bar — shows on every internal navigation */}
          <PageProgress />

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

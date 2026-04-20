import type { Metadata } from "next";
import { DM_Serif_Display, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AppNav } from "@/components/AppNav";
import { AppFooter } from "@/components/AppFooter";

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
  title: "InsiderTrades · Intelligence des transactions dirigeants",
  description: "Suivez les déclarations AMF des dirigeants français. Détectez les signaux d'accumulation, backtestez les performances historiques. Réglementation MAR · AMF France.",
  keywords: ["insider trading", "AMF", "déclarations dirigeants", "transactions initiés", "signal financier"],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
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

          {/* Page content */}
          <main className="page-main">
            {children}
          </main>

          {/* Footer */}
          <AppFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}

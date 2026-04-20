import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AppNav } from "@/components/AppNav";
import { AppFooter } from "@/components/AppFooter";

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
    <html lang="fr" className="dark" suppressHydrationWarning>
      <head>
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

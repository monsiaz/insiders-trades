import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AppSidebar, AppTopBar, MobileTabBar } from "@/components/AppSidebar";
import { AppFooter } from "@/components/AppFooter";

export const metadata: Metadata = {
  title: "InsiderTrades · AMF France",
  description: "Surveillance des déclarations d'initiés · Réglementation MAR · AMF France",
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
        {/* Inline script: set theme class before React hydrates → zero flash */}
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

          <div className="app-layout">
            {/* Left sidebar (desktop) */}
            <AppSidebar />

            {/* Main area */}
            <div className="app-main">
              {/* Top bar */}
              <AppTopBar />

              {/* Page content */}
              <main className="page-container">
                {children}
              </main>

              {/* Footer */}
              <AppFooter />
            </div>
          </div>

          {/* Mobile bottom tab bar */}
          <MobileTabBar />
        </ThemeProvider>
      </body>
    </html>
  );
}

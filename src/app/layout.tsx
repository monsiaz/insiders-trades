import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { NavSearch } from "@/components/NavSearch";

export const metadata: Metadata = {
  title: "Insider Trades · AMF France",
  description: "Déclarations des dirigeants · Réglementation MAR · AMF France",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        {/* Animated background */}
        <div className="bg-scene" aria-hidden>
          <div className="bg-orb-3" />
        </div>

        {/* Navigation */}
        <header className="glass-nav sticky top-0 z-50">
          <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-6">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 flex-shrink-0 group">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/30 transition-shadow">
                <svg viewBox="0 0 24 24" fill="none" className="w-4.5 h-4.5">
                  <path d="M3 17l4-8 4 4 4-6 4 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-sm font-bold text-white tracking-tight">InsiderTrades</span>
                <span className="text-[10px] text-indigo-400/70 font-medium tracking-wider uppercase">AMF · France</span>
              </div>
            </Link>

            {/* Nav links */}
            <div className="hidden sm:flex items-center gap-1 ml-2">
              <Link
                href="/"
                className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all"
              >
                Accueil
              </Link>
              <Link
                href="/companies"
                className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all"
              >
                Sociétés
              </Link>
              <Link
                href="/insiders"
                className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all"
              >
                Dirigeants
              </Link>
              <Link
                href="/backtest"
                className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all"
              >
                Backtesting
              </Link>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Right side */}
            <NavSearch />

            <a
              href="https://bdif.amf-france.org"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg btn-glass text-xs font-medium"
            >
              AMF ↗
            </a>
          </nav>
        </header>

        {/* Main content */}
        <main className="page-container">
          {children}
        </main>

        {/* Footer */}
        <footer className="relative z-10 mt-20 py-8 border-t border-white/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-gray-600">
              InsiderTrades · Données issues de{" "}
              <a href="https://bdif.amf-france.org" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-400">
                BDIF AMF
              </a>
            </p>
            <p className="text-xs text-gray-700">
              Déclarations des dirigeants · Réglementation MAR
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

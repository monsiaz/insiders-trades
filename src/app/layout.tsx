import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AMF Insider Trades | Déclarations des dirigeants",
  description:
    "Suivez en temps réel les déclarations de transactions des dirigeants publiées par l'AMF (Autorité des marchés financiers).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="h-full">
      <body className={`${inter.className} h-full bg-gray-950 text-gray-100`}>
        <div className="min-h-full flex flex-col">
          <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16">
                <Link href="/" className="flex items-center gap-3 group">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center font-bold text-gray-900 text-sm">
                    IT
                  </div>
                  <div>
                    <span className="font-semibold text-white group-hover:text-emerald-400 transition-colors">
                      Insider Trades
                    </span>
                    <span className="hidden sm:inline text-gray-500 text-sm ml-2">
                      AMF · France
                    </span>
                  </div>
                </Link>

                <nav className="flex items-center gap-1">
                  <Link
                    href="/"
                    className="px-3 py-2 rounded-md text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                  >
                    Accueil
                  </Link>
                  <Link
                    href="/companies"
                    className="px-3 py-2 rounded-md text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                  >
                    Sociétés
                  </Link>
                  <Link
                    href="/insiders"
                    className="px-3 py-2 rounded-md text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                  >
                    Dirigeants
                  </Link>
                  <a
                    href="https://bdif.amf-france.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 px-3 py-1.5 rounded-md text-xs border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                  >
                    AMF ↗
                  </a>
                </nav>
              </div>
            </div>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="border-t border-gray-800 py-8 mt-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
                <div>
                  <span className="font-medium text-gray-400">AMF Insider Trades</span>
                  <span className="mx-2">·</span>
                  Données issues de{" "}
                  <a
                    href="https://bdif.amf-france.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-500 hover:text-emerald-400"
                  >
                    BDIF AMF
                  </a>
                </div>
                <div>
                  Déclarations des dirigeants · Réglementation MAR
                </div>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}

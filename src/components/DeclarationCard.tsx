"use client";

import Link from "next/link";
import { useState } from "react";
import { DeclarationType } from "@prisma/client";
import { CompanyAvatar } from "@/components/CompanyBadge";
import { translateRole } from "@/lib/i18n";

interface DeclarationCardProps {
  declaration: {
    id: string;
    amfId: string;
    type: DeclarationType;
    pubDate: Date;
    link: string;
    description: string;
    company: { name: string; slug: string; logoUrl?: string | null };
    insider?: { name: string; slug: string } | null;
    insiderName?: string | null;
    insiderFunction?: string | null;
    transactionNature?: string | null;
    instrumentType?: string | null;
    isin?: string | null;
    unitPrice?: number | null;
    volume?: number | null;
    totalAmount?: number | null;
    currency?: string | null;
    transactionDate?: Date | null;
    transactionVenue?: string | null;
    pdfParsed?: boolean;
    signalScore?: number | null;
    pctOfMarketCap?: number | null;
    pctOfInsiderFlow?: number | null;
  };
  showCompany?: boolean;
  /** "en" (default) or "fr" */
  locale?: string;
}

function getTradeStyle(nature: string | null | undefined, isFr: boolean) {
  if (!nature) return null;
  const n = nature.toLowerCase();
  if (n.includes("cession"))   return { label: isFr ? "Vente"       : "Sale",    icon: "▼", cls: "badge-sell",    amountCls: "text-[var(--tx-1)]" };
  if (n.includes("acquisition")) return { label: isFr ? "Achat"     : "Purchase", icon: "▲", cls: "badge-buy",     amountCls: "text-[var(--tx-1)]" };
  if (n.includes("exercice") || n.includes("option")) return { label: "Options", icon: "◇", cls: "bg-gold-soft border bd-gold tx-gold", amountCls: "text-[var(--tx-1)]" };
  if (n.includes("attribution")) return { label: isFr ? "Attribution" : "Grant", icon: "◆", cls: "bg-violet-soft border bd-violet tx-violet", amountCls: "text-[var(--tx-1)]" };
  return { label: nature, icon: "●", cls: "badge-neutral", amountCls: "text-[var(--tx-2)]" };
}

function fmt(amount: number | null | undefined, currency: string | null | undefined, numLocale: string): string {
  if (!amount) return "";
  return new Intl.NumberFormat(numLocale, {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: 0,
    notation: amount >= 1_000_000 ? "compact" : "standard",
  }).format(amount);
}

function fmtDate(d: Date, numLocale: string): string {
  return new Date(d).toLocaleDateString(numLocale, { day: "numeric", month: "short", year: "numeric" });
}

function SignalBadge({ score, isFr }: { score: number; isFr: boolean }) {
  if (score >= 70) return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-gold-soft border bd-gold tx-gold">
      <span>★</span>{isFr ? "Score fort" : "Strong signal"} · {score}
    </span>
  );
  if (score >= 45) return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gold-soft border bd-gold tx-gold">
      <span>◆</span>Signal · {score}
    </span>
  );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
      style={{ background: "var(--bg-raised)", border: "1px solid var(--border-med)", color: "var(--tx-3)" }}>
      {score}
    </span>
  );
}

const TYPE_BADGE_CLS: Record<DeclarationType, string> = {
  DIRIGEANTS: "badge badge-indigo",
  SEUILS:     "badge badge-indigo",
  PROSPECTUS: "badge badge-amber",
  OTHER:      "badge badge-neutral",
};

function getTypeLabel(type: DeclarationType, isFr: boolean): string {
  if (isFr) {
    const FR: Record<DeclarationType, string> = {
      DIRIGEANTS: "Dirigeants",
      SEUILS: "Seuils",
      PROSPECTUS: "Prospectus",
      OTHER: "Autre",
    };
    return FR[type];
  }
  const EN: Record<DeclarationType, string> = {
    DIRIGEANTS: "Executives",
    SEUILS: "Thresholds",
    PROSPECTUS: "Prospectus",
    OTHER: "Other",
  };
  return EN[type];
}

export function DeclarationCard({ declaration, showCompany = true, locale = "en" }: DeclarationCardProps) {
  const isFr = locale === "fr";
  const numLocale = isFr ? "fr-FR" : "en-GB";
  const trade = getTradeStyle(declaration.transactionNature, isFr);
  const hasDetail = declaration.pdfParsed && declaration.insiderName;
  const pubDate = declaration.transactionDate ?? declaration.pubDate;
  const score = declaration.signalScore ?? 0;
  const pctMcap = declaration.pctOfMarketCap;
  const pctFlow = declaration.pctOfInsiderFlow;
  const [copied, setCopied] = useState(false);

  function copyIsin() {
    if (!declaration.isin) return;
    navigator.clipboard.writeText(declaration.isin).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  return (
    <div className="glass-card rounded-2xl p-4 group">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">

          {/* Top row: badges + company */}
          <div className="flex flex-wrap items-center gap-2 mb-2.5">
            <span className={`${TYPE_BADGE_CLS[declaration.type]} text-[11px]`}>
              {getTypeLabel(declaration.type, isFr)}
            </span>

            {trade && (
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${trade.cls}`}>
                <span className="text-[9px]">{trade.icon}</span>
                {trade.label}
              </span>
            )}

            {showCompany && (
              <Link
                href={`/company/${declaration.company.slug}`}
                style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <CompanyAvatar name={declaration.company.name} logoUrl={declaration.company.logoUrl} size="sm" />
                <span className="text-sm font-semibold transition-colors" style={{ color: "var(--tx-1)" }}>
                  {declaration.company.name}
                </span>
              </Link>
            )}

            <SignalBadge score={Math.round(score)} isFr={isFr} />
          </div>

          {/* Insider row */}
          {hasDetail && declaration.insiderName && (
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                style={{ background: "var(--c-indigo-bg)", border: "1px solid var(--c-indigo-bd)", color: "var(--c-indigo-2)" }}>
                {declaration.insiderName.charAt(0)}
              </div>
              {declaration.insider?.slug ? (
                <Link href={`/insider/${declaration.insider.slug}`}
                  className="text-sm font-medium transition-colors hover:underline"
                  style={{ color: "var(--tx-1)" }}>
                  {declaration.insiderName}
                </Link>
              ) : (
                <span className="text-sm font-medium" style={{ color: "var(--tx-1)" }}>{declaration.insiderName}</span>
              )}
              {declaration.insiderFunction && (
                <span className="text-xs truncate" style={{ color: "var(--tx-3)" }}>
                  {translateRole(declaration.insiderFunction, locale ?? "en")}
                </span>
              )}
            </div>
          )}

          {/* Trade details row */}
          {hasDetail && (declaration.totalAmount || declaration.volume) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2.5">
              {declaration.totalAmount && (
                <span className={`text-base font-bold tabular-nums ${trade?.amountCls ?? "text-[var(--tx-1)]"}`}>
                  {fmt(declaration.totalAmount, declaration.currency, numLocale)}
                </span>
              )}
              {declaration.volume && (
                <span className="text-xs text-[var(--tx-3)]">
                  {new Intl.NumberFormat(numLocale).format(declaration.volume)} {isFr ? "titres" : "shares"}
                </span>
              )}
              {declaration.unitPrice && (
                <span className="text-xs text-[var(--tx-3)]">
                  @{" "}
                  {new Intl.NumberFormat(numLocale, {
                    style: "currency",
                    currency: declaration.currency || "EUR",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 4,
                  }).format(declaration.unitPrice)}
                </span>
              )}
              {/* % of market cap */}
              {pctMcap != null && pctMcap > 0 && (
                <span className="text-[11px] font-semibold tx-gold/80 bg-gold-soft border bd-gold px-2 py-0.5 rounded-lg tabular-nums">
                  {pctMcap < 0.01
                    ? `${pctMcap.toFixed(4)}% mcap`
                    : pctMcap < 0.1
                    ? `${pctMcap.toFixed(3)}% mcap`
                    : `${pctMcap.toFixed(2)}% mcap`}
                </span>
              )}
              {/* % of insider's own flow */}
              {pctFlow != null && pctFlow > 0 && (
                <span className="text-[11px] text-[var(--tx-3)] tabular-nums">
                  {pctFlow.toFixed(1)}{isFr ? "% de son flux" : "% of flow"}
                </span>
              )}
              {declaration.isin && (
                <button
                  type="button"
                  onClick={copyIsin}
                  title={copied ? (isFr ? "Copié !" : "Copied!") : (isFr ? "Copier l'ISIN" : "Copy ISIN")}
                  className="font-mono text-[10px] px-2 py-0.5 rounded transition-colors cursor-pointer flex items-center gap-1"
                  style={{ color: "var(--tx-3)", background: "var(--bg-raised)", border: "1px solid var(--border)" }}
                >
                  {declaration.isin}
                  <span className="text-[9px] opacity-50">{copied ? "ok" : "⌘"}</span>
                </button>
              )}
            </div>
          )}

          {/* Secondary details */}
          {hasDetail && (declaration.instrumentType || declaration.transactionVenue) && (
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {declaration.instrumentType && (
                <span className="text-[11px] px-2 py-0.5 rounded-lg"
                  style={{ color: "var(--tx-3)", background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
                  {declaration.instrumentType}
                </span>
              )}
              {declaration.transactionVenue && (
                <span className="text-[11px] flex items-center gap-1" style={{ color: "var(--tx-3)" }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2"/></svg>
                  {declaration.transactionVenue}
                </span>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--tx-3)" }}>
            <span className="font-mono">{declaration.amfId}</span>
            <span>·</span>
            <time>{fmtDate(pubDate, numLocale)}</time>
            {!declaration.pdfParsed && declaration.type === "DIRIGEANTS" && (
              <span className="italic" style={{ color: "var(--tx-4)" }}>
                {isFr ? "détails non chargés" : "details not loaded"}
              </span>
            )}
          </div>
        </div>

        {/* AMF link */}
        <a
          href={declaration.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 btn-glass px-3 py-2.5 rounded-xl text-xs font-medium flex items-center gap-1 min-h-[44px] justify-center"
        >
          AMF ↗
        </a>
      </div>
    </div>
  );
}

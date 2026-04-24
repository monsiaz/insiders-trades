"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import type { RecoItem } from "@/lib/recommendation-engine";

function fmtPct(n: number | null | undefined, d = 1): string {
  if (n == null) return "·";
  return `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`;
}

function fmtAmt(n: number | null, isFr: boolean): string {
  if (!n) return "·";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} ${isFr ? "Md€" : "Bn€"}`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M€`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} k€`;
  return `${n.toFixed(0)} €`;
}

function fmtDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMcap(n: number | null, isFr: boolean): string | null {
  if (!n) return null;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} ${isFr ? "Md€" : "Bn€"}`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} M€`;
  return null;
}

// Badge → accent class mapping
function tagAccent(b: string): string {
  // Primary trade badges
  if (b === "Cluster" || b === "PDG/DG") return "accent-indigo";
  if (b.startsWith("Score")) return "accent-pos";
  if (b === ">1M€" || b === "Mega-cap" || b === "Large-cap") return "accent-pos";
  if (b === ">2% mcap" || b === "CFO/DAF") return "accent-gold";
  if (b === ">0.5% mcap" || b === ">200k€") return "accent-gold";
  // Composite (Yahoo fundamentals) badges
  if (b === "Strong Buy" || b.startsWith("Upside")) return "accent-pos";
  if (b === "Momentum" || b === "Qualité") return "accent-pos";
  if (b === "Value" || b === "Près plus bas 52s") return "accent-gold";
  if (b === "Institutionnels >50%" || b === "Dirigeants ≥20%") return "accent-indigo";
  if (b === "Short squeeze") return "accent-neg";
  return "";
}

// Rank → Roman numeral for the 1st, ordinal number otherwise
function folioLabel(rank: number): string {
  return rank.toString().padStart(2, "0");
}

// Inline company logo · integrated, not boxed avatar style
function InlineLogo({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  const [err, setErr] = useState(false);
  const letter = name.replace(/^(la |le |les |l')/i, "").charAt(0).toUpperCase();

  if (logoUrl && !err) {
    return (
      <span className="tearsheet-logo">
        <Image
          src={logoUrl}
          alt={name}
          width={44}
          height={44}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          onError={() => setErr(true)}
          unoptimized
        />
      </span>
    );
  }
  return (
    <span className="tearsheet-logo" style={{ fontFamily: "'DM Serif Display', serif", fontSize: "1.25rem", color: "var(--gold)", fontStyle: "italic" }}>
      {letter}
    </span>
  );
}

export function RecoCard({ item, rank, locale = "en" }: { item: RecoItem; rank: number; locale?: string }) {
  const isFr = locale === "fr";
  const isBuy = item.action === "BUY";
  const actionClass = isBuy ? "buy" : "sell";

  const mcapStr = fmtMcap(item.marketCap, isFr);
  const expectedRet = item.expectedReturn90d ?? 0;
  const winRate = item.historicalWinRate90d ?? 0;

  // Score tier
  const scoreRound = Math.round(item.recoScore);
  const scoreTier = scoreRound >= 75 ? "high" : scoreRound >= 55 ? "mid" : "low";

  const pctMcapStr =
    item.pctOfMarketCap != null && item.pctOfMarketCap > 0
      ? item.pctOfMarketCap < 0.01
        ? `${item.pctOfMarketCap.toFixed(3)}% mcap`
        : item.pctOfMarketCap < 0.1
        ? `${item.pctOfMarketCap.toFixed(2)}% mcap`
        : `${item.pctOfMarketCap.toFixed(1)}% mcap`
      : null;

  const companySlug = item.company.slug || "#";

  return (
    <article className="tearsheet">
      {/* Signature elements */}
      <span className={`tearsheet-stripe ${actionClass}`} aria-hidden="true" />
      <span className="tearsheet-folio" aria-hidden="true">{folioLabel(rank)}</span>

      {/* Head: logo + company + score */}
      <div className="tearsheet-head">
        <InlineLogo name={item.company.name} logoUrl={item.company.logoUrl} />

        <div className="tearsheet-company">
          <div className="flex items-center gap-3 flex-wrap">
            {companySlug !== "#" ? (
              <Link href={`/company/${companySlug}`} className="tearsheet-company-name">
                {item.company.name}
              </Link>
            ) : (
              <span className="tearsheet-company-name">{item.company.name}</span>
            )}
            <span className={`tearsheet-action-tag ${actionClass}`}>
              <span className="tag-dot" aria-hidden="true" />
              {isBuy ? (isFr ? "Achat" : "Buy") : (isFr ? "Vente" : "Sale")}
            </span>
          </div>

          {/* Insiders — handles merged multi-declaration cards */}
          {item.declarationCount > 1 ? (
            // Multi-declaration card: show "N opérations" badge + list all unique insiders
            <div className="tearsheet-insider" style={{ flexDirection: "column", alignItems: "flex-start", gap: "3px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                <span style={{
                  fontSize: "0.62rem", fontWeight: 700, padding: "1px 7px", borderRadius: "20px",
                  background: "var(--c-indigo-bg)", border: "1px solid var(--c-indigo-bd)", color: "var(--c-indigo-2)",
                  letterSpacing: "0.04em",
                }}>
                  {item.declarationCount} {isFr ? "opérations" : "operations"}
                </span>
                {item.allInsiders.length > 1 && (
                  <span style={{ fontSize: "0.7rem", color: "var(--tx-3)" }}>
                    · {item.allInsiders.length} {isFr ? "initiés" : "insiders"}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {item.allInsiders.slice(0, 3).map((ins, idx) => (
                  <span key={idx} style={{ fontSize: "0.72rem", color: "var(--tx-2)", fontWeight: 500 }}>
                    {ins.slug ? (
                      <Link href={`/insider/${ins.slug}`} style={{ color: "inherit", textDecoration: "none" }}
                        className="hover:underline">{ins.name ?? "·"}</Link>
                    ) : (ins.name ?? "·")}
                    {idx < Math.min(item.allInsiders.length, 3) - 1 && <span style={{ color: "var(--tx-4)", margin: "0 2px" }}>·</span>}
                  </span>
                ))}
                {item.allInsiders.length > 3 && (
                  <span style={{ fontSize: "0.72rem", color: "var(--tx-4)" }}>+{item.allInsiders.length - 3}</span>
                )}
              </div>
            </div>
          ) : item.insider.name ? (
            // Single declaration: classic display
            <div className="tearsheet-insider">
              {item.insider.slug ? (
                <Link href={`/insider/${item.insider.slug}`} style={{ fontWeight: 500, color: "inherit", textDecoration: "none" }}
                  className="hover:underline transition-opacity hover:opacity-80">
                  {item.insider.name}
                </Link>
              ) : (
                <span style={{ fontWeight: 500 }}>{item.insider.name}</span>
              )}
              {item.insider.role !== "Autre" && (
                <>
                  <span className="tearsheet-insider-sep">·</span>
                  <span className="tearsheet-insider-role">{item.insider.role}</span>
                </>
              )}
            </div>
          ) : null}

          {item.badges.length > 0 && (
            <div className="tearsheet-tags">
              {item.badges.slice(0, 4).map((b) => (
                <span key={b} className={`tearsheet-tag ${tagAccent(b)}`}>
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="tearsheet-score">
          <div className={`tearsheet-score-num ${scoreTier}`}>{scoreRound}</div>
          <div className="tearsheet-score-sub">/ 100 · score</div>
          <div className={`tearsheet-score-bar ${scoreTier}`}>
            <div style={{ width: `${Math.max(4, scoreRound)}%` }} />
          </div>
        </div>
      </div>

      {/* Data strip */}
      <div className="tearsheet-strip">
        <div className="tearsheet-strip-cell">
          <span className="tearsheet-strip-label">
            {isBuy ? (isFr ? "Retour estimé T+90" : "Est. return T+90") : (isFr ? "Dérive titre T+90" : "Price drift T+90")}
          </span>
          <span className={
            // For BUY: positive return = good (green), negative = bad
            // For SELL: negative return = good (seller avoided drop → green), positive = bad
            isBuy
              ? `tearsheet-strip-value ${expectedRet >= 4 ? "pos" : expectedRet < 0 ? "neg" : ""}`
              : `tearsheet-strip-value ${expectedRet <= -2 ? "pos" : expectedRet > 0 ? "neg" : ""}`
          }>
            {fmtPct(item.expectedReturn90d, 1)}
          </span>
          <span className="tearsheet-strip-sub">
            {isBuy
              ? (isFr ? "moy. historique" : "hist. avg.")
              : (isFr ? "moy. post-cession histo." : "hist. post-sell avg.")}
          </span>
        </div>
        <div className="tearsheet-strip-cell">
          <span className="tearsheet-strip-label">
            {isBuy ? "Win rate" : (isFr ? "Taux de chute" : "Drop rate")}
          </span>
          <span className={`tearsheet-strip-value ${winRate >= 60 ? "pos" : ""}`}>
            {item.historicalWinRate90d != null ? `${item.historicalWinRate90d.toFixed(0)}%` : "·"}
          </span>
          <span className="tearsheet-strip-sub">
              T+90 · {item.sampleSize.toLocaleString(isFr ? "fr-FR" : "en-GB")} trades
          </span>
        </div>
        <div className="tearsheet-strip-cell">
          <span className="tearsheet-strip-label">
            {item.declarationCount > 1
              ? (isFr ? "Total déclaré" : "Total declared")
              : (isFr ? "Montant déclaré" : "Declared amount")}
          </span>
          <span className="tearsheet-strip-value">{fmtAmt(item.totalAmount, isFr)}</span>
          {pctMcapStr && <span className="tearsheet-strip-sub">{pctMcapStr}</span>}
        </div>
      </div>

      {/* Footer */}
      <div className="tearsheet-foot">
        <div className="tearsheet-foot-meta">
          {mcapStr && (
            <span>
              MCap <strong>{mcapStr}</strong>
            </span>
          )}
          {item.analystReco && (
            <>
              {mcapStr && <span className="tearsheet-foot-sep" aria-hidden="true" />}
              <span>
                {isFr ? "Analystes" : "Analysts"} · <strong>{item.analystReco}</strong>
                {item.targetMean && ` · ${isFr ? "obj." : "target"} ${item.targetMean.toFixed(1)}€`}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <time className="tearsheet-foot-date">{fmtDate(item.pubDate, locale)}</time>
          {item.amfLink && item.amfLink !== "#" && (
            <a
              href={item.amfLink}
              target="_blank"
              rel="noopener noreferrer"
              className="tearsheet-foot-link"
            >
              {isFr ? "Source AMF" : "AMF filing"}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 17L17 7M17 7H8M17 7v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

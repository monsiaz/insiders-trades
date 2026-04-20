"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import type { RecoItem } from "@/lib/recommendation-engine";

function fmtPct(n: number | null | undefined, d = 1): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`;
}

function fmtAmt(n: number | null): string {
  if (!n) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M€`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} k€`;
  return `${n.toFixed(0)} €`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMcap(n: number | null): string | null {
  if (!n) return null;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} Md€`;
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

// Inline company logo — integrated, not boxed avatar style
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

export function RecoCard({ item, rank }: { item: RecoItem; rank: number }) {
  const isBuy = item.action === "BUY";
  const actionClass = isBuy ? "buy" : "sell";

  const mcapStr = fmtMcap(item.marketCap);
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
              {isBuy ? "Achat" : "Vente"}
            </span>
          </div>

          {item.insider.name && (
            <div className="tearsheet-insider">
              <span style={{ fontWeight: 500 }}>{item.insider.name}</span>
              {item.insider.role !== "Autre" && (
                <>
                  <span className="tearsheet-insider-sep">·</span>
                  <span className="tearsheet-insider-role">{item.insider.role}</span>
                </>
              )}
            </div>
          )}

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
            {isBuy ? "Retour estimé T+90" : "Dérive titre T+90"}
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
            {isBuy ? "moy. historique" : "moy. post-cession histo."}
          </span>
        </div>
        <div className="tearsheet-strip-cell">
          <span className="tearsheet-strip-label">
            {isBuy ? "Win rate" : "Taux de chute"}
          </span>
          <span className={`tearsheet-strip-value ${winRate >= 60 ? "pos" : ""}`}>
            {item.historicalWinRate90d != null ? `${item.historicalWinRate90d.toFixed(0)}%` : "—"}
          </span>
          <span className="tearsheet-strip-sub">
            T+90 · {item.sampleSize.toLocaleString("fr-FR")} trades
          </span>
        </div>
        <div className="tearsheet-strip-cell">
          <span className="tearsheet-strip-label">Montant déclaré</span>
          <span className="tearsheet-strip-value">{fmtAmt(item.totalAmount)}</span>
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
                Analystes · <strong>{item.analystReco}</strong>
                {item.targetMean && ` · obj. ${item.targetMean.toFixed(1)}€`}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <time className="tearsheet-foot-date">{fmtDate(item.pubDate)}</time>
          {item.amfLink && item.amfLink !== "#" && (
            <a
              href={item.amfLink}
              target="_blank"
              rel="noopener noreferrer"
              className="tearsheet-foot-link"
            >
              Source AMF
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

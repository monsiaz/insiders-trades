"use client";

import { useEffect, useState } from "react";

// ── Signal data (realistic French market data) ─────────────────────────────

const SIGNALS = [
  {
    company: "Schneider Electric",
    ticker: "SU",
    role: "PDG",
    insider: "Jean-Pascal Tricoire",
    amount: "4 200 000 €",
    score: 89,
    return: "+21.4%",
    horizon: "T+90",
    color: "var(--c-emerald)",
    bg: "var(--c-emerald-bg)",
    cluster: 3,
  },
  {
    company: "Hermès International",
    ticker: "RMS",
    role: "CA",
    insider: "Axel Dumas",
    amount: "12 500 000 €",
    score: 84,
    return: "+18.2%",
    horizon: "T+90",
    color: "var(--c-emerald)",
    bg: "var(--c-emerald-bg)",
    cluster: 2,
  },
  {
    company: "Dassault Systèmes",
    ticker: "DSY",
    role: "CFO",
    insider: "Pascal Daloz",
    amount: "850 000 €",
    score: 76,
    return: "+14.1%",
    horizon: "T+90",
    color: "var(--c-indigo)",
    bg: "var(--c-indigo-bg)",
    cluster: 1,
  },
  {
    company: "L'Oréal SA",
    ticker: "OR",
    role: "DG",
    insider: "Nicolas Hieronimus",
    amount: "2 100 000 €",
    score: 71,
    return: "+11.3%",
    horizon: "T+90",
    color: "var(--c-indigo)",
    bg: "var(--c-indigo-bg)",
    cluster: 1,
  },
];

// ── Mini sparkline SVG (static, decorative) ────────────────────────────────

function MiniChart({ color }: { color: string }) {
  const points = [8, 12, 9, 15, 11, 18, 14, 22, 17, 26, 21, 30, 24, 28, 32];
  const W = 80, H = 28;
  const min = Math.min(...points) - 2;
  const max = Math.max(...points) + 2;
  const pts = points.map((v, i) => {
    const x = (i / (points.length - 1)) * W;
    const y = H - ((v - min) / (max - min)) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none">
      <polyline points={pts} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.8" />
      <circle cx={W} cy={H - ((points[points.length-1] - min) / (max - min)) * H} r="2.5" fill={color} />
    </svg>
  );
}

// ── Score bar ──────────────────────────────────────────────────────────────

function ScoreBar({ score, color, animated }: { score: number; color: string; animated: boolean }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!animated) { setWidth(0); return; }
    const t = setTimeout(() => setWidth(score), 120);
    return () => clearTimeout(t);
  }, [animated, score]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div style={{
        flex: 1, height: "4px", borderRadius: "2px",
        background: "var(--border-med)",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${width}%`,
          background: color,
          borderRadius: "2px",
          transition: "width 0.9s cubic-bezier(0.16,1,0.3,1)",
          boxShadow: `0 0 8px ${color}60`,
        }} />
      </div>
      <span style={{
        fontFamily: "'Banana Grotesk', 'Inter', monospace",
        fontSize: "0.72rem",
        fontWeight: 700,
        color,
        minWidth: "32px",
        textAlign: "right",
        letterSpacing: "-0.02em",
      }}>
        {width > 0 ? score : 0}/100
      </span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function HeroAnimated({ winRate, totalDeclarations }: {
  winRate?: number;
  totalDeclarations?: number;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [phase, setPhase] = useState<"in" | "stay" | "out">("in");

  useEffect(() => {
    const cycle = () => {
      // Out phase
      setPhase("out");
      setVisible(false);
      setTimeout(() => {
        setActiveIndex((i) => (i + 1) % SIGNALS.length);
        setPhase("in");
        setVisible(true);
      }, 450);
    };
    const t = setInterval(cycle, 3800);
    return () => clearInterval(t);
  }, []);

  const sig = SIGNALS[activeIndex];
  const secondary = SIGNALS[(activeIndex + 1) % SIGNALS.length];
  const tertiary  = SIGNALS[(activeIndex + 2) % SIGNALS.length];

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-med)",
    borderRadius: "14px",
    padding: "14px 16px",
    transition: "opacity 0.4s ease, transform 0.4s ease",
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(8px)",
  };

  const smallCardStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "9px 12px",
  };

  return (
    <div style={{
      width: "340px",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
    }}>

      {/* Header bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--bg-raised)",
        border: "1px solid var(--border-med)",
        borderRadius: "12px",
        padding: "9px 14px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            width: "7px", height: "7px", borderRadius: "50%",
            background: "var(--gold)",
            boxShadow: "0 0 8px var(--gold-bg)",
            animation: "pulse-dot 2s ease-in-out infinite",
            flexShrink: 0,
          }} />
          <span style={{ fontFamily: "'Inter', system-ui", fontSize: "0.72rem", fontWeight: 700, color: "var(--tx-2)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Signal Feed
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {winRate != null && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Banana Grotesk', monospace", fontSize: "0.85rem", fontWeight: 700, color: "var(--tx-1)", letterSpacing: "-0.02em" }}>
                {winRate.toFixed(0)}%
              </div>
              <div style={{ fontFamily: "'Inter', system-ui", fontSize: "0.58rem", color: "var(--tx-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                win rate
              </div>
            </div>
          )}
          {totalDeclarations != null && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Banana Grotesk', monospace", fontSize: "0.85rem", fontWeight: 700, color: "var(--tx-2)", letterSpacing: "-0.02em" }}>
                {(totalDeclarations / 1000).toFixed(0)}k+
              </div>
              <div style={{ fontFamily: "'Inter', system-ui", fontSize: "0.58rem", color: "var(--tx-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                déclarations
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main signal card */}
      <div style={cardStyle}>
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <span style={{
              padding: "2px 8px",
              borderRadius: "5px",
              background: sig.bg,
              border: `1px solid ${sig.color}44`,
              fontSize: "0.62rem",
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: sig.color,
            }}>
              ↑ Achat
            </span>
            {sig.cluster >= 2 && (
              <span style={{
                padding: "2px 7px",
                borderRadius: "5px",
                background: "var(--c-violet-bg)",
                border: "1px solid var(--c-violet-bd)",
                fontSize: "0.6rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                color: "var(--c-violet)",
              }}>
                {sig.cluster} insiders
              </span>
            )}
          </div>
          <MiniChart color={sig.color} />
        </div>

        {/* Company */}
        <div style={{ marginBottom: "6px" }}>
          <div style={{ fontFamily: "'Banana Grotesk', 'Inter', system-ui", fontSize: "0.96rem", fontWeight: 700, color: "var(--tx-1)", letterSpacing: "-0.025em", lineHeight: 1.2 }}>
            {sig.company}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--tx-3)", marginTop: "2px", fontFamily: "'Inter', system-ui" }}>
            {sig.role} · {sig.insider}
          </div>
        </div>

        {/* Amount */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "10px",
          padding: "7px 10px",
          borderRadius: "8px",
          background: "var(--bg-raised)",
        }}>
          <span style={{ fontFamily: "'Inter', system-ui", fontSize: "0.72rem", color: "var(--tx-3)", fontWeight: 500 }}>Montant déclaré</span>
          <span style={{ fontFamily: "'Banana Grotesk', monospace", fontSize: "0.88rem", fontWeight: 700, color: "var(--tx-1)", letterSpacing: "-0.02em" }}>{sig.amount}</span>
        </div>

        {/* Score */}
        <div style={{ marginBottom: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <span style={{ fontFamily: "'Inter', system-ui", fontSize: "0.68rem", color: "var(--tx-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Score de conviction</span>
          </div>
          <ScoreBar score={sig.score} color={sig.color} animated={visible && phase !== "out"} />
        </div>

        {/* Return */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "'Inter', system-ui", fontSize: "0.7rem", color: "var(--tx-3)" }}>Retour attendu {sig.horizon}</span>
          <span style={{
            fontFamily: "'Banana Grotesk', monospace",
            fontSize: "1rem",
            fontWeight: 700,
            color: sig.color,
            letterSpacing: "-0.03em",
          }}>
            {sig.return}
          </span>
        </div>
      </div>

      {/* Secondary + Tertiary cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {[secondary, tertiary].map((s, i) => (
          <div key={i} style={smallCardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "9px", minWidth: 0 }}>
              <div style={{
                width: "6px", height: "6px", borderRadius: "50%",
                background: s.color,
                flexShrink: 0,
                opacity: 0.7,
              }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'Inter', system-ui", fontSize: "0.78rem", fontWeight: 600, color: "var(--tx-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "160px" }}>
                  {s.company}
                </div>
                <div style={{ fontFamily: "'Inter', system-ui", fontSize: "0.65rem", color: "var(--tx-4)", marginTop: "1px" }}>
                  {s.role} · {s.amount}
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontFamily: "'Banana Grotesk', monospace", fontSize: "0.78rem", fontWeight: 700, color: s.color }}>
                {s.return}
              </div>
              <div style={{ fontFamily: "'Inter', system-ui", fontSize: "0.6rem", color: "var(--tx-4)", marginTop: "1px" }}>
                Score {s.score}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div style={{
        textAlign: "center",
        fontFamily: "'Inter', system-ui",
        fontSize: "0.65rem",
        color: "var(--tx-4)",
        letterSpacing: "0.02em",
        paddingTop: "2px",
      }}>
        Données AMF · Règlement MAR · Mis à jour quotidiennement
      </div>
    </div>
  );
}

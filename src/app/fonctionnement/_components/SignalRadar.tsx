"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Animated scatter radar · plots signals on 2 axes:
 *  - X: % of market cap engaged (log-scaled)
 *  - Y: signalScore
 * With a rotating radar sweep for a "live" feel.
 */

type Signal = {
  name: string;
  mcapPct: number;  // 0.01 → 5.0
  score: number;    // 0 → 100
  action: "BUY" | "SELL";
};

// Illustrative signals · a spread across the X/Y plane to make a nice visual
const SIGNALS: Signal[] = [
  { name: "Schneider",   mcapPct: 0.02,  score: 62, action: "BUY" },
  { name: "TotalEnergies", mcapPct: 0.04, score: 68, action: "BUY" },
  { name: "LVMH",        mcapPct: 0.08,  score: 74, action: "BUY" },
  { name: "Hermès",      mcapPct: 0.12,  score: 79, action: "BUY" },
  { name: "L'Oréal",     mcapPct: 0.18,  score: 71, action: "BUY" },
  { name: "Sanofi",      mcapPct: 0.25,  score: 66, action: "BUY" },
  { name: "Air Liquide", mcapPct: 0.35,  score: 76, action: "BUY" },
  { name: "Pernod",      mcapPct: 0.55,  score: 83, action: "BUY" },
  { name: "Thales",      mcapPct: 0.85,  score: 85, action: "BUY" },
  { name: "Dassault",    mcapPct: 1.40,  score: 89, action: "BUY" },
  { name: "Alten",       mcapPct: 2.20,  score: 93, action: "BUY" },
  // Sells
  { name: "Société Gén.", mcapPct: 0.05, score: 54, action: "SELL" },
  { name: "Edenred",     mcapPct: 0.14,  score: 58, action: "SELL" },
  { name: "Worldline",   mcapPct: 0.38,  score: 63, action: "SELL" },
  { name: "Atos",        mcapPct: 0.95,  score: 71, action: "SELL" },
  // Low-score noise
  { name: "Carrefour",   mcapPct: 0.015, score: 32, action: "BUY" },
  { name: "Renault",     mcapPct: 0.03,  score: 38, action: "BUY" },
  { name: "Vinci",       mcapPct: 0.09,  score: 42, action: "BUY" },
];

const W = 720;
const H = 360;
const padL = 60;
const padR = 40;
const padT = 24;
const padB = 42;
const plotW = W - padL - padR;
const plotH = H - padT - padB;

// Log scale for x
const X_MIN = 0.01;
const X_MAX = 3;

function xFor(mcapPct: number) {
  const lm = Math.log10(Math.max(X_MIN, Math.min(X_MAX, mcapPct)));
  const lMin = Math.log10(X_MIN);
  const lMax = Math.log10(X_MAX);
  return padL + ((lm - lMin) / (lMax - lMin)) * plotW;
}
function yFor(score: number) {
  return padT + (1 - Math.max(0, Math.min(100, score)) / 100) * plotH;
}

export function SignalRadar() {
  const pathname = usePathname();
  const isFr = pathname.startsWith("/fr");
  const [visible, setVisible] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (visible >= SIGNALS.length) return;
    const t = setTimeout(() => setVisible((n) => n + 1), 120);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <div
      style={{
        background:
          "radial-gradient(ellipse at center, var(--corporate-bg) 0%, var(--bg-surface) 70%)",
        border: "1px solid var(--border-med)",
        borderRadius: "4px",
        padding: "16px 14px",
        position: "relative",
      }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", height: "auto" }} aria-hidden="true">
        <defs>
          {/* Radar sweep gradient */}
          <linearGradient id="sr-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--gold)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--gold)" stopOpacity="0.28" />
          </linearGradient>
          <radialGradient id="sr-bg-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Background glow */}
        <ellipse cx={W / 2} cy={H / 2} rx={plotW / 2} ry={plotH / 2} fill="url(#sr-bg-glow)" />

        {/* Plot area border */}
        <rect
          x={padL}
          y={padT}
          width={plotW}
          height={plotH}
          fill="none"
          stroke="var(--border-med)"
          strokeWidth="0.5"
        />

        {/* Y axis gridlines (score) */}
        <g stroke="var(--border)" strokeWidth="0.4" opacity="0.6">
          {[0, 20, 40, 60, 80, 100].map((s) => (
            <g key={s}>
              <line x1={padL} y1={yFor(s)} x2={W - padR} y2={yFor(s)} />
              <text
                x={padL - 8}
                y={yFor(s) + 3}
                textAnchor="end"
                fontSize="9"
                fontFamily="'JetBrains Mono', monospace"
                fill="var(--tx-4)"
              >
                {s}
              </text>
            </g>
          ))}
        </g>

        {/* X axis gridlines (log ticks) */}
        <g stroke="var(--border)" strokeWidth="0.4" opacity="0.6">
          {[0.01, 0.05, 0.1, 0.5, 1, 3].map((v) => (
            <g key={v}>
              <line x1={xFor(v)} y1={padT} x2={xFor(v)} y2={H - padB} />
              <text
                x={xFor(v)}
                y={H - 20}
                textAnchor="middle"
                fontSize="9"
                fontFamily="'JetBrains Mono', monospace"
                fill="var(--tx-4)"
              >
                {v}%
              </text>
            </g>
          ))}
        </g>

        {/* Axis labels */}
        <text
          x={padL + plotW / 2}
          y={H - 6}
          textAnchor="middle"
          fontSize="10"
          fontFamily="'JetBrains Mono', monospace"
          fill="var(--tx-3)"
          letterSpacing="0.1em"
        >
          {isFr ? "% CAPITALISATION ENGAGÉE →" : "% MARKET CAP ENGAGED →"}
        </text>
        <text
          x={-H / 2}
          y={14}
          textAnchor="middle"
          fontSize="10"
          fontFamily="'JetBrains Mono', monospace"
          fill="var(--tx-3)"
          letterSpacing="0.1em"
          transform="rotate(-90)"
        >
          SCORE ↑
        </text>

        {/* Quality thresholds */}
        <line
          x1={padL} y1={yFor(70)} x2={W - padR} y2={yFor(70)}
          stroke="var(--gold)" strokeWidth="0.8" strokeDasharray="5 5" opacity="0.65"
        />
        <text
          x={W - padR - 6}
          y={yFor(70) - 4}
          textAnchor="end"
          fontSize="9"
          fill="var(--gold)"
          fontFamily="'JetBrains Mono', monospace"
          letterSpacing="0.08em"
        >
          {isFr ? "SEUIL RECO ≥ 70" : "RECO THRESHOLD ≥ 70"}
        </text>

        {/* Radar sweep */}
        <g style={{ transformOrigin: `${W / 2}px ${H / 2}px`, animation: "sr-rotate 8s linear infinite" }}>
          <path
            d={`M ${W / 2} ${H / 2} L ${W / 2 + plotW / 2} ${H / 2} A ${plotW / 2} ${plotH / 2} 0 0 1 ${W / 2 + (plotW / 2) * Math.cos(Math.PI / 4)} ${H / 2 + (plotH / 2) * Math.sin(Math.PI / 4)} Z`}
            fill="url(#sr-sweep)"
          />
        </g>

        {/* Data points */}
        {SIGNALS.slice(0, visible).map((s, i) => {
          const cx = xFor(s.mcapPct);
          const cy = yFor(s.score);
          const color = s.action === "BUY" ? "var(--signal-pos)" : "var(--signal-neg)";
          const isHover = hover === i;
          const r = isHover ? 10 : 6;
          return (
            <g key={`${s.name}-${i}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <circle
                cx={cx}
                cy={cy}
                r={r + 6}
                fill={color}
                opacity="0.15"
                style={{ transition: "r 0.2s ease" }}
              />
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={color}
                stroke="var(--bg-surface)"
                strokeWidth="1.5"
                style={{
                  transition: "r 0.2s ease",
                  cursor: "pointer",
                  animation: "sr-pop 0.5s ease-out both",
                }}
              />
              {isHover && (
                <g transform={`translate(${cx + 12}, ${cy - 28})`}>
                  <rect x="0" y="0" width="150" height="46" rx="3" fill="var(--bg-raised)" stroke="var(--border-med)" />
                  <text x="8" y="15" fontSize="10" fontWeight="700" fill="var(--tx-1)">
                    {s.name}
                  </text>
                  <text x="8" y="28" fontSize="9" fontFamily="'JetBrains Mono', monospace" fill={color}>
                    {s.action} · score {s.score}
                  </text>
                  <text x="8" y="40" fontSize="9" fontFamily="'JetBrains Mono', monospace" fill="var(--tx-3)">
                    {s.mcapPct.toFixed(2)}% mcap
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: "18px",
          justifyContent: "center",
          marginTop: "8px",
          fontSize: "0.72rem",
          color: "var(--tx-3)",
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.08em",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "var(--signal-pos)",
            }}
          />
          {isFr ? "Achat" : "Buy"}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "var(--signal-neg)" }} />
          {isFr ? "Vente" : "Sale"}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "18px", height: "0", borderTop: "1.5px dashed var(--gold)" }} />
          {isFr ? "Seuil reco ≥ 70" : "Reco threshold ≥ 70"}
        </span>
      </div>

      <style>{`
        @keyframes sr-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes sr-pop {
          0%   { transform: scale(0);   opacity: 0; }
          80%  { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}

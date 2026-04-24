"use client";

import { useEffect, useState } from "react";

/**
 * Animated donut chart showing the 10 components of signalScore (v3, 2026-04).
 * Pure SVG + CSS, no canvas, animates on mount + on hover.
 *
 * v3 shifts weight from generic fundamentals (public info, already priced in)
 * toward insider-centric features: track record, DCA, directional cluster,
 * analyst-contrarian. Total remains 100 pts.
 */

// Gold family = insider-centric signals (alpha sources)
// Navy family = context / public-info signals (confirmatory)
const COMPONENTS = [
  { name: "Cluster directionnel ±30j", pts: 18, color: "#B8955A", hint: "★ ≥2 dirigeants même sens · alpha confirmé" },
  { name: "% capitalisation (mcap)",   pts: 16, color: "#C9A772", hint: "Barème log 0.001% → 1%+" },
  { name: "Track record dirigeant",    pts: 14, color: "#A07F47", hint: "★ Alpha historique de l'insider (shrinkage)" },
  { name: "Fonction (PDG/CFO)",        pts: 14, color: "#8B6B37", hint: "PDG/DG → CFO → Dir → CA" },
  { name: "Composite Yahoo",           pts: 10, color: "#D4BA8E", hint: "Momentum, value, qualité (52w-low gated)" },
  { name: "% flux insider",            pts: 8,  color: "#17305C", hint: "Part dans son flux total" },
  { name: "DCA / accumulation",        pts: 6,  color: "#3A5687", hint: "★ ≥2 achats sur 12 mois" },
  { name: "Analyst-contrarian",        pts: 6,  color: "#1F3A6A", hint: "★ Achat vs consensus neutre/bearish" },
  { name: "Conviction cumulée",        pts: 4,  color: "#0F2540", hint: "Net-acheteur cumulé sur le titre" },
  { name: "Fondamentaux",              pts: 4,  color: "#0A1B30", hint: "Consensus + P/E + D/E (réduit)" },
];

const TOTAL = COMPONENTS.reduce((s, c) => s + c.pts, 0); // = 100

export function ScoringWheel() {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Build arcs
  const size = 340;
  const cx = size / 2;
  const cy = size / 2;
  const R = 130;
  const strokeWidth = 32;

  let cumulative = 0;
  const segments = COMPONENTS.map((c, i) => {
    const start = (cumulative / TOTAL) * 2 * Math.PI;
    cumulative += c.pts;
    const end = (cumulative / TOTAL) * 2 * Math.PI;
    return { ...c, start, end, idx: i };
  });

  function describeArc(startAngle: number, endAngle: number) {
    // Rotate -90° so it starts at the top
    const a1 = startAngle - Math.PI / 2;
    const a2 = endAngle - Math.PI / 2;
    const x1 = cx + R * Math.cos(a1);
    const y1 = cy + R * Math.sin(a1);
    const x2 = cx + R * Math.cos(a2);
    const y2 = cy + R * Math.sin(a2);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  const hovered = hoverIdx != null ? COMPONENTS[hoverIdx] : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "14px 0",
      }}
    >
      <div style={{ position: "relative", width: size, maxWidth: "100%" }}>
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ display: "block" }} aria-hidden="true">
          {/* Background track */}
          <circle
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke="var(--border)"
            strokeWidth={strokeWidth}
            opacity="0.4"
          />
          {/* Segments */}
          {segments.map((seg, i) => {
            const isOther = hoverIdx != null && hoverIdx !== i;
            return (
              <path
                key={seg.name}
                d={describeArc(seg.start, seg.end)}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeLinecap="butt"
                opacity={mounted ? (isOther ? 0.22 : 1) : 0}
                style={{
                  transition: "opacity 0.25s ease, stroke-width 0.25s ease",
                  cursor: "pointer",
                  strokeDasharray: 2 * Math.PI * R,
                  strokeDashoffset: mounted ? 0 : 2 * Math.PI * R,
                  transitionProperty: "opacity, stroke-dashoffset, stroke-width",
                  transitionDuration: "0.8s, 1.4s, 0.25s",
                  transitionTimingFunction: "ease-out, cubic-bezier(0.16, 1, 0.3, 1), ease",
                  transitionDelay: `${i * 0.09}s, ${i * 0.09}s, 0s`,
                }}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
              />
            );
          })}

          {/* Center text */}
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            fontFamily="var(--font-dm-serif), serif"
            fontSize="42"
            fill="var(--tx-1)"
            style={{ letterSpacing: "-0.025em" }}
          >
            {hovered ? hovered.pts : 100}
          </text>
          <text
            x={cx}
            y={cy + 14}
            textAnchor="middle"
            fontFamily="'JetBrains Mono', monospace"
            fontSize="9"
            fontWeight="700"
            fill="var(--tx-3)"
            letterSpacing="0.14em"
          >
            {hovered ? "POINTS" : "SCORE MAX"}
          </text>
        </svg>
      </div>

      {/* Legend / hover label */}
      <div
        style={{
          marginTop: "10px",
          minHeight: "56px",
          textAlign: "center",
          padding: "10px 14px",
          background: hovered ? "var(--bg-raised)" : "transparent",
          border: `1px solid ${hovered ? "var(--border-med)" : "transparent"}`,
          borderRadius: "3px",
          transition: "all 0.2s ease",
          width: "100%",
        }}
      >
        {hovered ? (
          <>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: "0.9rem",
                fontWeight: 700,
                color: "var(--tx-1)",
              }}
            >
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "2px",
                  background: hovered.color,
                }}
              />
              {hovered.name}
              <span
                style={{
                  fontFamily: "'Banana Grotesk', sans-serif",
                  color: hovered.color,
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  letterSpacing: "-0.02em",
                }}
              >
                {hovered.pts} pts
              </span>
            </div>
            <div
              style={{
                fontSize: "0.76rem",
                color: "var(--tx-3)",
                marginTop: "4px",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {hovered.hint}
            </div>
          </>
        ) : (
          <div
            style={{
              fontSize: "0.8rem",
              color: "var(--tx-3)",
              lineHeight: 1.55,
              fontStyle: "italic",
            }}
          >
            Survolez un segment pour voir son poids et sa formule.
          </div>
        )}
      </div>

      {/* Compact legend grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "6px",
          marginTop: "12px",
          width: "100%",
        }}
      >
        {COMPONENTS.map((c, i) => (
          <button
            key={c.name}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            onFocus={() => setHoverIdx(i)}
            onBlur={() => setHoverIdx(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 8px",
              background: hoverIdx === i ? "var(--bg-raised)" : "transparent",
              border: "1px solid transparent",
              borderColor: hoverIdx === i ? "var(--border-med)" : "transparent",
              borderRadius: "2px",
              cursor: "pointer",
              fontSize: "0.74rem",
              color: "var(--tx-2)",
              fontFamily: "var(--font-inter), sans-serif",
              transition: "all 0.15s ease",
              textAlign: "left",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "2px",
                background: c.color,
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.name}
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--tx-3)",
                fontWeight: 600,
              }}
            >
              {c.pts}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

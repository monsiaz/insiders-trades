"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animated line chart · simulates a backtest equity curve for a portfolio
 * composed of "buy-when-insider-buys" signals vs. CAC40 baseline.
 * Pure SVG, no canvas, theme-aware.
 */

// Simulated monthly equity curves (indexed base 100) · representative of
// what the backtest page produces. NOT live data; illustrative.
const SIGNAL_CURVE = [
  100, 102.4, 104.1, 103.8, 106.2, 108.5, 107.9, 110.6, 113.2, 112.4,
  115.8, 118.1, 120.7, 119.4, 122.8, 126.4, 128.9, 127.3, 131.1, 134.6,
  137.2, 139.8, 138.1, 142.5, 146.9, 150.3, 148.8, 153.2, 157.6, 162.1,
  159.7, 164.4, 168.9, 172.5, 170.2, 175.8,
];
const CAC_CURVE = [
  100, 101.2, 100.8, 102.1, 103.4, 104.6, 103.9, 105.2, 106.8, 106.1,
  107.9, 109.3, 110.8, 110.2, 112.1, 113.9, 115.4, 114.8, 116.7, 118.3,
  119.9, 121.4, 120.7, 122.8, 124.6, 126.1, 125.3, 127.4, 129.2, 131.0,
  130.2, 132.1, 134.0, 135.8, 135.1, 136.9,
];

const MONTHS = 36;

export function BacktestCurve() {
  const [visibleMonths, setVisibleMonths] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasEntered, setHasEntered] = useState(false);

  // Intersection observer to replay animation when scrolled into view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setHasEntered(true);
            setVisibleMonths(0);
          }
        });
      },
      { threshold: 0.35 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!hasEntered) return;
    if (visibleMonths >= MONTHS) return;
    const t = setTimeout(() => setVisibleMonths((m) => m + 1), 55);
    return () => clearTimeout(t);
  }, [visibleMonths, hasEntered]);

  const W = 560;
  const H = 320;
  const padL = 44;
  const padR = 14;
  const padT = 18;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const minY = 95;
  const maxY = 185;

  function x(i: number) {
    return padL + (i / (MONTHS - 1)) * plotW;
  }
  function y(v: number) {
    return padT + (1 - (v - minY) / (maxY - minY)) * plotH;
  }

  function pathFor(arr: number[]) {
    const clampLen = Math.min(visibleMonths, arr.length);
    return arr
      .slice(0, clampLen)
      .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
      .join(" ");
  }

  // Area fill under signal
  function areaPath(arr: number[]) {
    const clampLen = Math.min(visibleMonths, arr.length);
    if (clampLen < 2) return "";
    const top = arr
      .slice(0, clampLen)
      .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
      .join(" ");
    const baseY = y(minY);
    return `${top} L ${x(clampLen - 1).toFixed(1)} ${baseY} L ${padL} ${baseY} Z`;
  }

  const lastSignal = SIGNAL_CURVE[Math.max(0, Math.min(visibleMonths, MONTHS) - 1)];
  const lastCac = CAC_CURVE[Math.max(0, Math.min(visibleMonths, MONTHS) - 1)];
  const alpha = lastSignal - lastCac;

  return (
    <div
      ref={containerRef}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-med)",
        borderRadius: "4px",
        padding: "18px 18px 14px",
      }}
    >
      {/* Header strip */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", marginBottom: "12px", alignItems: "baseline" }}>
        <div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.62rem",
              color: "var(--tx-3)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Backtest simulé · 36 mois
          </div>
          <div
            style={{
              fontFamily: "var(--font-dm-serif), serif",
              fontSize: "1.15rem",
              color: "var(--tx-1)",
              marginTop: "3px",
            }}
          >
            Stratégie signal vs. CAC 40
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "18px" }}>
          <Metric label="Signal" value={`+${(lastSignal - 100).toFixed(1)}%`} color="var(--signal-pos)" />
          <Metric label="CAC 40" value={`+${(lastCac - 100).toFixed(1)}%`} color="var(--tx-2)" />
          <Metric label="Alpha" value={`+${alpha.toFixed(1)} pts`} color="var(--gold)" />
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: "block", height: "auto" }}
        aria-hidden="true"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const svg = svgRef.current;
          if (!svg) return;
          const pt = svg.createSVGPoint();
          pt.x = e.clientX;
          pt.y = e.clientY;
          const ctm = svg.getScreenCTM();
          if (!ctm) return;
          const loc = pt.matrixTransform(ctm.inverse());
          const rel = (loc.x - padL) / plotW;
          const idx = Math.max(0, Math.min(MONTHS - 1, Math.round(rel * (MONTHS - 1))));
          setHoverIdx(idx);
        }}
      >
        <defs>
          <linearGradient id="bc-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--signal-pos)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--signal-pos)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gridlines */}
        <g stroke="var(--border)" strokeWidth="0.5" opacity="0.55">
          {[100, 120, 140, 160, 180].map((v) => (
            <g key={v}>
              <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} />
              <text
                x={padL - 8}
                y={y(v) + 3}
                textAnchor="end"
                fontSize="9"
                fontFamily="'JetBrains Mono', monospace"
                fill="var(--tx-4)"
              >
                {v}
              </text>
            </g>
          ))}
        </g>

        {/* Month ticks */}
        <g>
          {[0, 6, 12, 18, 24, 30, 35].map((i) => (
            <text
              key={i}
              x={x(i)}
              y={H - 14}
              textAnchor="middle"
              fontSize="9"
              fontFamily="'JetBrains Mono', monospace"
              fill="var(--tx-4)"
            >
              M{i}
            </text>
          ))}
        </g>

        {/* Area under signal */}
        {visibleMonths > 1 && (
          <path d={areaPath(SIGNAL_CURVE)} fill="url(#bc-area)" />
        )}

        {/* CAC line */}
        {visibleMonths > 1 && (
          <path
            d={pathFor(CAC_CURVE)}
            fill="none"
            stroke="var(--tx-3)"
            strokeWidth="1.5"
            strokeDasharray="3 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {/* Signal line */}
        {visibleMonths > 1 && (
          <path
            d={pathFor(SIGNAL_CURVE)}
            fill="none"
            stroke="var(--signal-pos)"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* End points */}
        {visibleMonths > 0 && (
          <>
            <circle
              cx={x(visibleMonths - 1)}
              cy={y(lastSignal)}
              r="4"
              fill="var(--signal-pos)"
              stroke="var(--bg-surface)"
              strokeWidth="2"
            />
            <circle
              cx={x(visibleMonths - 1)}
              cy={y(lastCac)}
              r="3"
              fill="var(--tx-3)"
              stroke="var(--bg-surface)"
              strokeWidth="2"
            />
          </>
        )}

        {/* Hover crosshair */}
        {hoverIdx != null && hoverIdx < visibleMonths && (
          <g>
            <line
              x1={x(hoverIdx)}
              y1={padT}
              x2={x(hoverIdx)}
              y2={H - padB}
              stroke="var(--tx-4)"
              strokeDasharray="2 3"
              strokeWidth="1"
            />
            <circle cx={x(hoverIdx)} cy={y(SIGNAL_CURVE[hoverIdx])} r="4" fill="var(--signal-pos)" />
            <circle cx={x(hoverIdx)} cy={y(CAC_CURVE[hoverIdx])}   r="4" fill="var(--tx-3)" />
            <g transform={`translate(${x(hoverIdx) + 10}, ${y(SIGNAL_CURVE[hoverIdx]) - 46})`}>
              <rect x="0" y="0" width="96" height="42" rx="3" fill="var(--bg-raised)" stroke="var(--border-med)" />
              <text x="8" y="14" fontSize="9" fontFamily="'JetBrains Mono', monospace" fill="var(--tx-3)">
                Mois {hoverIdx}
              </text>
              <text x="8" y="26" fontSize="10" fontWeight="700" fill="var(--signal-pos)">
                Signal +{(SIGNAL_CURVE[hoverIdx] - 100).toFixed(1)}%
              </text>
              <text x="8" y="37" fontSize="10" fontWeight="600" fill="var(--tx-2)">
                CAC +{(CAC_CURVE[hoverIdx] - 100).toFixed(1)}%
              </text>
            </g>
          </g>
        )}
      </svg>

      <div
        style={{
          fontSize: "0.72rem",
          color: "var(--tx-4)",
          fontFamily: "'JetBrains Mono', monospace",
          marginTop: "6px",
          letterSpacing: "0.04em",
        }}
      >
        Courbe illustrative. Les performances passées ne préjugent pas des performances futures.
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: "0.62rem",
          color: "var(--tx-3)",
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "1.1rem",
          fontFamily: "'Banana Grotesk', sans-serif",
          fontWeight: 700,
          color,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

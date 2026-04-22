"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animated pipeline diagram — shows data flowing through 6 stages.
 * Pure SVG + CSS animations, no canvas, fully responsive, theme-aware.
 */

const STAGES = [
  { id: "amf",      label: "AMF BDIF",     sub: "Polling 1h",       x: 60,  y: 90  },
  { id: "parse",    label: "Parse PDF",    sub: "Regex + pdftotext", x: 280, y: 90  },
  { id: "yahoo",    label: "Enrich Yahoo", sub: "Mcap, fondamentaux", x: 500, y: 90  },
  { id: "score",    label: "Score 0–100",  sub: "7 composantes",    x: 720, y: 90  },
  { id: "backtest", label: "Backtest",     sub: "T+30 à T+730",      x: 280, y: 220 },
  { id: "signal",   label: "Signal",       sub: "Reco actionnable", x: 720, y: 220 },
];

export function PipelineDiagram() {
  const [pulseIdx, setPulseIdx] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    // Cycle the highlighted stage for a "data flows" feel
    const interval = setInterval(() => {
      setPulseIdx((n) => (n + 1) % STAGES.length);
    }, 1600);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        background:
          "radial-gradient(ellipse at top, var(--corporate-bg) 0%, transparent 60%), var(--bg-surface)",
        border: "1px solid var(--border-med)",
        borderRadius: "6px",
        padding: "28px 24px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <svg
        ref={svgRef}
        viewBox="0 0 820 300"
        width="100%"
        style={{
          display: "block",
          height: "auto",
          fontFamily: "var(--font-inter), sans-serif",
        }}
        aria-hidden="true"
      >
        <defs>
          {/* Arrow marker */}
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--gold)" />
          </marker>
          {/* Pulsing glow */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background grid */}
        <g stroke="var(--border)" strokeWidth="0.4" opacity="0.4">
          {[0, 60, 120, 180, 240].map((y) => (
            <line key={y} x1="40" y1={y + 30} x2="780" y2={y + 30} />
          ))}
        </g>

        {/* Connectors */}
        <Connector x1={120} y1={90}  x2={240} y2={90}  delay={0} />
        <Connector x1={340} y1={90}  x2={460} y2={90}  delay={0.4} />
        <Connector x1={560} y1={90}  x2={680} y2={90}  delay={0.8} />
        <Connector x1={280} y1={120} x2={280} y2={190} delay={1.2} />
        <Connector x1={720} y1={120} x2={720} y2={190} delay={1.2} />
        <Connector x1={340} y1={220} x2={680} y2={220} delay={1.6} />

        {/* Data packets traveling along the main horizontal flow */}
        <g>
          <Packet path={[
            { x: 120, y: 90 }, { x: 240, y: 90 },
            { x: 280, y: 90 }, { x: 340, y: 90 },
            { x: 460, y: 90 }, { x: 500, y: 90 },
            { x: 560, y: 90 }, { x: 680, y: 90 },
            { x: 720, y: 90 }, { x: 720, y: 220 },
          ]} />
        </g>

        {/* Stage nodes */}
        {STAGES.map((stage, i) => (
          <StageNode key={stage.id} stage={stage} active={i === pulseIdx} />
        ))}
      </svg>

      <style>{`
        @keyframes packet-travel {
          0%    { offset-distance: 0%;   opacity: 0; }
          5%    { opacity: 1; }
          95%   { opacity: 1; }
          100%  { offset-distance: 100%; opacity: 0; }
        }
        @keyframes connector-dash {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -24; }
        }
        @keyframes stage-pulse {
          0%, 100% { transform: scale(1); }
          50%     { transform: scale(1.06); }
        }
        @keyframes stage-glow-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function StageNode({ stage, active }: { stage: (typeof STAGES)[number]; active: boolean }) {
  const stroke = active ? "var(--gold)" : "var(--border-strong)";
  const textColor = active ? "var(--gold)" : "var(--tx-1)";
  const subColor = "var(--tx-3)";
  return (
    <g
      style={{
        transformOrigin: `${stage.x}px ${stage.y}px`,
        transform: active ? "scale(1.04)" : "scale(1)",
        transition: "transform 0.35s ease",
      }}
    >
      <rect
        x={stage.x - 60}
        y={stage.y - 26}
        width="120"
        height="52"
        rx="4"
        fill="var(--bg-surface)"
        stroke={stroke}
        strokeWidth={active ? "2" : "1"}
        filter={active ? "url(#glow)" : undefined}
      />
      {/* Active indicator dot */}
      {active && (
        <circle cx={stage.x - 48} cy={stage.y - 14} r="3" fill="var(--gold)">
          <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
        </circle>
      )}
      <text
        x={stage.x}
        y={stage.y - 4}
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill={textColor}
        letterSpacing="0.02em"
      >
        {stage.label}
      </text>
      <text
        x={stage.x}
        y={stage.y + 12}
        textAnchor="middle"
        fontSize="9"
        fontFamily="'JetBrains Mono', monospace"
        fill={subColor}
        letterSpacing="0.04em"
      >
        {stage.sub}
      </text>
    </g>
  );
}

function Connector({
  x1, y1, x2, y2, delay = 0,
}: {
  x1: number; y1: number; x2: number; y2: number; delay?: number;
}) {
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke="var(--gold)"
      strokeWidth="1.5"
      strokeDasharray="4 6"
      opacity="0.55"
      markerEnd="url(#arrow)"
      style={{
        animation: `connector-dash 1.2s linear infinite`,
        animationDelay: `${delay}s`,
      }}
    />
  );
}

function Packet({ path }: { path: { x: number; y: number }[] }) {
  // Build an SVG path string for offset-path
  const d =
    "M " +
    path.map((p, i) => `${i === 0 ? "" : "L "}${p.x} ${p.y}`).join(" ");
  return (
    <circle
      r="4"
      fill="var(--signal-pos)"
      style={{
        offsetPath: `path('${d}')`,
        animation: "packet-travel 5s linear infinite",
        filter: "drop-shadow(0 0 4px var(--signal-pos))",
      }}
    />
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// ── Pure CSS/SVG animations · no canvas, fully theme-aware via CSS vars ─────

// ── Step 1: AMF Data Stream ──────────────────────────────────────────────────

function AnimCollecte({ isFr }: { isFr: boolean }) {
  const rows = [
    { ticker: "SCHNEIDER ELEC.", amount: "4 200 000 €", ok: true,  delay: 0 },
    { ticker: "LVMH SA",         amount: "12 500 000 €", ok: true,  delay: 0.4 },
    { ticker: "TOTALENERGIES",   amount: "834 000 €",    ok: true,  delay: 0.8 },
    { ticker: "HERMÈS INTL",     amount: "2 100 000 €",  ok: true,  delay: 1.2 },
    { ticker: "SOC. GÉNÉRALE",   amount: "890 000 €",    ok: false, delay: 1.6 },
  ];

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", padding: "20px 18px" }}>
      {/* Animated background lines */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.35 }} aria-hidden>
        {[0.25, 0.45, 0.65, 0.82].map((y, i) => (
          <line key={i} x1="0" y1={`${y * 100}%`} x2="100%" y2={`${y * 100}%`}
            stroke="var(--c-indigo)" strokeWidth="0.5" strokeDasharray="4 10"
            style={{ animation: `slide-line ${2.5 + i * 0.4}s linear infinite` }} />
        ))}
      </svg>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", position: "relative" }}>
        <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "var(--gold)", boxShadow: "0 0 8px var(--gold-bg)", flexShrink: 0, animation: "pulse-dot 2s ease-in-out infinite" }} />
        <span style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--gold)" }}>
          AMF · BDIF FEED
        </span>
        <span style={{ marginLeft: "auto", fontSize: "0.62rem", color: "var(--tx-3)", fontFamily: "monospace" }}>LIVE</span>
      </div>

      {/* Data rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", position: "relative" }}>
        {rows.map((row) => (
          <div key={row.ticker} style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "7px 10px", borderRadius: "8px",
            background: row.ok ? "color-mix(in srgb, var(--gold) 6%, var(--bg-raised))" : "var(--bg-raised)",
            border: `1px solid ${row.ok ? "var(--gold-bd)" : "var(--border)"}`,
            animation: `fade-in-row 0.4s ease both`,
            animationDelay: `${row.delay}s`,
          }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0, background: row.ok ? "var(--gold)" : "var(--tx-4)" }} />
            <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--tx-1)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {row.ticker}
            </span>
            <span style={{ fontSize: "0.7rem", fontFamily: "monospace", fontWeight: 700, color: row.ok ? "var(--tx-1)" : "var(--tx-3)", flexShrink: 0 }}>
              {row.amount}
            </span>
          </div>
        ))}
      </div>

      {/* Bottom labels */}
      <div style={{ position: "absolute", bottom: "12px", left: "18px", right: "18px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--tx-4)", letterSpacing: "0.06em" }}>AMF</span>
        <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--tx-4)", letterSpacing: "0.06em" }}>{isFr ? "BASE DE DONNÉES" : "DATABASE"}</span>
      </div>

      <style>{`
        @keyframes slide-line { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -28; } }
        @keyframes fade-in-row { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  );
}

// ── Step 2: Scoring Gauge ────────────────────────────────────────────────────

function AnimScoring({ isFr }: { isFr: boolean }) {
  const [score, setScore] = useState(0);
  const [bars, setBars] = useState([0, 0, 0, 0, 0]);
  const target = 87;
  const barTargets = [92, 85, 78, 65, 72];
  const barLabels = isFr
    ? ["Cluster dir. ±30j", "Track record ★", "Montant/Mcap", "Rôle PDG/CFO", "DCA + contrarian"]
    : ["Directional cluster", "Track record ★", "Amount/Mcap", "Role CEO/CFO", "DCA + contrarian"];
  // DA v3: monochrome gold scale · no rainbow
  const barColors = ["var(--gold)", "var(--gold-2)", "var(--corporate)", "var(--corporate-2)", "var(--gold)"];

  useEffect(() => {
    let frame = 0;
    const total = 80;
    const t = setInterval(() => {
      frame++;
      const p = Math.min(1, frame / total);
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      setScore(Math.round(eased * target));
      setBars(barTargets.map(bt => Math.round(eased * bt)));
      if (frame >= total) {
        clearInterval(t);
        setTimeout(() => { frame = 0; }, 1200);
      }
    }, 25);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const r = 52, cx = 72, cy = 72;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference * 0.75;
  const startAngle = 135;

  return (
    <div style={{ display: "flex", gap: "16px", alignItems: "center", padding: "18px 18px 10px", height: "100%" }}>
      {/* Gauge */}
      <div style={{ flexShrink: 0, position: "relative", width: "144px", height: "144px" }}>
        <svg width="144" height="144" viewBox="0 0 144 144">
          {/* Track */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-med)" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
            transform={`rotate(${startAngle} ${cx} ${cy})`} />
          {/* Filled arc */}
          <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth="12" strokeLinecap="round"
            style={{ stroke: "url(#gauge-grad)", transition: "stroke-dasharray 0.05s linear" }}
            strokeDasharray={`${filled} ${circumference - filled}`}
            transform={`rotate(${startAngle} ${cx} ${cy})`} />
          {/* Glow */}
          <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth="20" strokeLinecap="round"
            style={{ stroke: "var(--c-indigo)", opacity: 0.12, transition: "stroke-dasharray 0.05s linear" }}
            strokeDasharray={`${filled} ${circumference - filled}`}
            transform={`rotate(${startAngle} ${cx} ${cy})`} />
          <defs>
            {/* DA v3: gauge gradient navy → gold (brand only) */}
            <linearGradient id="gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--corporate)" />
              <stop offset="100%" stopColor="var(--gold)" />
            </linearGradient>
          </defs>
        </svg>
        {/* Score number */}
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: "8px" }}>
          <span style={{ fontFamily: "'Banana Grotesk', monospace", fontSize: "2rem", fontWeight: 800, color: "var(--tx-1)", lineHeight: 1, letterSpacing: "-0.04em" }}>
            {score}
          </span>
          <span style={{ fontSize: "0.62rem", color: "var(--c-indigo-2)", fontWeight: 700, letterSpacing: "0.06em" }}>/ 100</span>
          <span style={{ fontSize: "0.58rem", color: "var(--tx-3)", marginTop: "2px", letterSpacing: "0.04em" }}>CONVICTION</span>
        </div>
      </div>

      {/* Bars */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "9px" }}>
        {barLabels.map((label, i) => (
          <div key={label}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
              <span style={{ fontSize: "0.68rem", color: "var(--tx-2)", fontWeight: 500 }}>{label}</span>
              <span style={{ fontSize: "0.66rem", fontFamily: "monospace", fontWeight: 700, color: barColors[i] }}>{bars[i]}%</span>
            </div>
            <div style={{ height: "5px", borderRadius: "3px", background: "var(--border-med)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${bars[i]}%`, background: barColors[i], borderRadius: "3px", transition: "width 0.05s linear" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 3: Backtest Equity Curve ────────────────────────────────────────────

function AnimBacktest({ isFr }: { isFr: boolean }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let p = 0;
    const t = setInterval(() => {
      p += 0.008;
      if (p > 1.15) p = 0;
      setProgress(Math.min(p, 1));
    }, 30);
    return () => clearInterval(t);
  }, []);

  const curve = [0.50,0.52,0.56,0.54,0.59,0.57,0.63,0.60,0.67,0.64,0.71,0.68,0.75,0.72,0.80,0.77,0.84,0.81,0.88,0.85,0.92,0.89,0.95,0.93,0.98];
  const trades: { xi: number; win: boolean }[] = [
    {xi:2,win:true},{xi:5,win:false},{xi:8,win:true},{xi:11,win:true},
    {xi:14,win:true},{xi:17,win:false},{xi:20,win:true},{xi:23,win:true},
  ];

  const W = 280, H = 120, pL = 24, pR = 10, pT = 10, pB = 24;
  const plotW = W - pL - pR, plotH = H - pT - pB;
  const xOf = (i: number) => pL + (i / (curve.length - 1)) * plotW;
  const yOf = (v: number) => pT + (1 - v) * plotH;

  const N = Math.min(curve.length - 1, Math.floor(progress * (curve.length - 1)));
  const frac = Math.min(1, (progress * (curve.length - 1)) - N);

  const linePts = curve.slice(0, N + 1).map((v, i) => `${xOf(i)},${yOf(v)}`).join(" ");
  const headX = N < curve.length - 1 ? xOf(N) + (xOf(N + 1) - xOf(N)) * frac : xOf(N);
  const headY = N < curve.length - 1 ? yOf(curve[N]) + (yOf(curve[N + 1]) - yOf(curve[N])) * frac : yOf(curve[N]);

  const wins = trades.filter(t => t.xi <= N && t.win).length;
  const total = trades.filter(t => t.xi <= N).length;
  const winRate = total > 0 ? Math.round(wins / total * 100) : 0;
  const perf = curve[Math.min(N, curve.length - 1)];
  const perfPct = `+${Math.round((perf - 0.5) * 100)}%`;

  return (
    <div style={{ padding: "16px 18px 10px", display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--gold)" }}>
          Performance · T+90
        </span>
        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 800, fontFamily: "monospace", color: "var(--tx-1)" }}>{winRate}%</div>
            <div style={{ fontSize: "0.58rem", color: "var(--tx-4)", letterSpacing: "0.04em" }}>win rate</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 800, fontFamily: "monospace", color: "var(--gold)" }}>{perfPct}</div>
            <div style={{ fontSize: "0.58rem", color: "var(--tx-4)", letterSpacing: "0.04em" }}>{isFr ? "retour" : "return"}</div>
          </div>
        </div>
      </div>

      {/* SVG Chart */}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ flex: 1 }}>
        <defs>
          <linearGradient id="bg-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--gold)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid */}
        {[0.25, 0.5, 0.75].map((y, i) => (
          <line key={i} x1={pL} y1={pT + y * plotH} x2={W - pR} y2={pT + y * plotH}
            stroke="var(--border)" strokeWidth="0.5" />
        ))}
        <line x1={pL} y1={pT + 0.5 * plotH} x2={W - pR} y2={pT + 0.5 * plotH}
          stroke="var(--corporate-2)" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />

        {/* Area */}
        {N > 0 && (
          <polygon
            points={`${xOf(0)},${H - pB} ${linePts} ${headX},${H - pB}`}
            fill="url(#bg-fill)" />
        )}

        {/* Line */}
        {N > 0 && (
          <>
            <polyline points={`${linePts} ${headX},${headY}`}
              fill="none" stroke="var(--gold)" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ filter: "drop-shadow(0 0 4px var(--gold-bg))" }} />
            {/* Head dot */}
            <circle cx={headX} cy={headY} r="5" fill="var(--gold)" opacity="0.2" />
            <circle cx={headX} cy={headY} r="3" fill="var(--gold)" />
          </>
        )}

        {/* Trade dots · only losses get red; wins stay neutral (the line already shows performance) */}
        {trades.map(({ xi, win }) => {
          const col = win ? "var(--gold)" : "var(--c-crimson)";
          if (xi > N) return null;
          return (
            <g key={xi}>
              <circle cx={xOf(xi)} cy={yOf(curve[xi])} r="5" fill={col} opacity="0.2" />
              <circle cx={xOf(xi)} cy={yOf(curve[xi])} r="3" fill={col} />
            </g>
          );
        })}

        {/* Y labels */}
        <text x={pL - 3} y={pT + 3} fill="var(--tx-4)" fontSize="7" textAnchor="end">+50%</text>
        <text x={pL - 3} y={pT + plotH / 2 + 3} fill="var(--tx-4)" fontSize="7" textAnchor="end">0%</text>
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", gap: "14px", marginTop: "6px" }}>
        {[{color:"var(--gold)",label:"Gain"},{color:"var(--c-crimson)",label: isFr ? "Perte" : "Loss"}].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: l.color }} />
            <span style={{ fontSize: "0.65rem", color: "var(--tx-3)" }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 4: Signal Card ──────────────────────────────────────────────────────

function AnimSignal({ isFr }: { isFr: boolean }) {
  const [phase, setPhase] = useState(0);
  const [scoreVal, setScoreVal] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPhase(p => (p + 1) % 320), 30);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (phase < 140) {
      setScoreVal(Math.round(Math.min(phase / 100, 1) * 87));
    } else if (phase === 180) {
      setScoreVal(0);
    }
  }, [phase]);

  const show = (minPhase: number) => phase >= minPhase && phase < minPhase + 260;
  const alpha = (minPhase: number) => Math.min(1, Math.max(0, (phase - minPhase) / 12));

  return (
    <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "0", height: "100%", justifyContent: "center" }}>
      {/* Badge */}
      {show(5) && (
        <div style={{ opacity: alpha(5), marginBottom: "12px" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "5px",
            padding: "4px 12px", borderRadius: "20px",
            background: "var(--gold-bg)", color: "var(--gold)",
            border: "1px solid var(--gold-bd)",
            fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.06em",
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            {isFr ? "SIGNAL ACHAT FORT" : "STRONG BUY SIGNAL"}
          </span>
        </div>
      )}

      {/* Company */}
      {show(20) && (
        <div style={{ opacity: alpha(20), marginBottom: "4px" }}>
          <div style={{ fontFamily: "'Banana Grotesk','Inter',sans-serif", fontSize: "1.05rem", fontWeight: 800, color: "var(--tx-1)", letterSpacing: "-0.025em" }}>
            SCHNEIDER ELECTRIC
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--tx-3)", marginTop: "1px" }}>PDG · J.P. Tricoire</div>
        </div>
      )}

      {/* Amount */}
      {show(45) && (
        <div style={{ opacity: alpha(45), marginTop: "8px", marginBottom: "10px" }}>
          <span style={{ fontFamily: "monospace", fontSize: "1.2rem", fontWeight: 700, color: "var(--tx-1)", letterSpacing: "-0.02em" }}>
            4 200 000 €
          </span>
          <span style={{ fontSize: "0.7rem", color: "var(--tx-3)", marginLeft: "6px" }}>{isFr ? "déclaré" : "declared"}</span>
        </div>
      )}

      {/* Score bar */}
      {show(60) && (
        <div style={{ opacity: alpha(60) }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--tx-3)", letterSpacing: "0.06em" }}>{isFr ? "SCORE CONVICTION" : "CONVICTION SCORE"}</span>
            <span style={{ fontSize: "0.72rem", fontWeight: 800, fontFamily: "monospace", color: "var(--gold)" }}>{scoreVal}/100</span>
          </div>
          <div style={{ height: "8px", borderRadius: "4px", background: "var(--border-med)", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${scoreVal}%`,
              background: "linear-gradient(90deg, var(--corporate-2), var(--gold))",
              borderRadius: "4px",
              transition: "width 0.04s linear",
              boxShadow: "0 0 10px var(--gold-bg)",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "5px" }}>
            <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--gold)" }}>{isFr ? "+21.4% attendu T+90" : "+21.4% expected T+90"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Panel card ────────────────────────────────────────────────────────────────

function AnimPanel({ step, accentColor, pill, title, body, children }: {
  step: string; accentColor: string; pill: string;
  title: string; body: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      borderRadius: "18px",
      border: "1px solid var(--border-med)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      background: "var(--bg-surface)",
      boxShadow: "var(--shadow-md)",
      transition: "box-shadow 0.2s, border-color 0.2s",
    }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = "var(--shadow-lg)")}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = "var(--shadow-md)")}
    >
      {/* Animation area */}
      <div style={{
        height: "200px",
        flexShrink: 0,
        background: `linear-gradient(135deg, var(--bg-raised) 0%, color-mix(in srgb, ${accentColor} 5%, var(--bg-surface)) 100%)`,
        borderBottom: "1px solid var(--border)",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Subtle corner glow */}
        <div style={{
          position: "absolute", top: -30, right: -30,
          width: "120px", height: "120px", borderRadius: "50%",
          background: accentColor, opacity: 0.06, filter: "blur(32px)",
          pointerEvents: "none",
        }} />
        {children}
      </div>

      {/* Text */}
      <div style={{ padding: "18px 20px 22px", flex: 1, display: "flex", flexDirection: "column" }}>
        <span style={{
          display: "inline-flex", alignItems: "center",
          padding: "2px 9px", borderRadius: "20px", marginBottom: "10px",
          fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const,
          background: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${accentColor} 30%, transparent)`,
          color: accentColor, alignSelf: "flex-start",
        }}>
          {pill}
        </span>
        <h3 style={{
          fontFamily: "'Banana Grotesk','Inter',system-ui",
          fontWeight: 700, fontSize: "0.9375rem", letterSpacing: "-0.022em",
          marginBottom: "7px", color: "var(--tx-1)", lineHeight: 1.3,
        }}>
          {title}
        </h3>
        <p style={{
          fontFamily: "'Inter',system-ui", fontSize: "0.8125rem",
          color: "var(--tx-2)", lineHeight: 1.65, margin: 0,
        }}>
          {body}
        </p>
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function HowItWorksAnimations() {
  const pathname = usePathname();
  const isFr = pathname.startsWith("/fr");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(270px, 100%), 1fr))", gap: "16px" }}>
      <AnimPanel
        step="01" accentColor="var(--corporate-2)"
        pill={isFr ? "01 · Collecte" : "01 · Collection"}
        title={isFr ? "Déclarations AMF en temps réel" : "Real-time AMF declarations"}
        body={isFr
          ? "Chaque déclaration BDIF est récupérée, parsée et enrichie automatiquement chaque jour. Prix, capitalisation, rôle, montant exact."
          : "Every BDIF declaration is fetched, parsed and automatically enriched each day. Price, market cap, role, exact amount."}
      >
        <AnimCollecte isFr={isFr} />
      </AnimPanel>

      <AnimPanel
        step="02" accentColor="var(--gold)"
        pill="02 · Scoring"
        title={isFr ? "Score de conviction algorithmique" : "Algorithmic conviction score"}
        body={isFr
          ? "100 points composites v3 · 10 composantes : cluster directionnel, taille, track record dirigeant, rôle, composite gated, DCA, analyst-contrarian, conviction cumulée, fondamentaux."
          : "100 composite v3 points · 10 components: directional cluster, size, insider track record, role, gated composite, DCA, analyst-contrarian, cumulative conviction, fundamentals."}
      >
        <AnimScoring isFr={isFr} />
      </AnimPanel>

      <AnimPanel
        step="03" accentColor="var(--corporate-2)"
        pill="03 · Backtest"
        title={isFr ? "Validation sur données historiques" : "Validation on historical data"}
        body={isFr
          ? "Chaque pattern est backtesté sur 24 000+ transactions depuis 2021. Win rate, Sharpe, retour médian T+90 / T+365 vérifiés."
          : "Every pattern is backtested on 22,000+ transactions since 2021. Win rate, Sharpe, median return at T+90 / T+365 verified."}
      >
        <AnimBacktest isFr={isFr} />
      </AnimPanel>

      <AnimPanel
        step="04" accentColor="var(--gold)"
        pill={isFr ? "04 · Signal" : "04 · Signal"}
        title={isFr ? "Recommandation actionnable" : "Actionable recommendation"}
        body={isFr
          ? "Les meilleurs signaux remontent en Top 10 quotidien. Score, retour attendu, historique du dirigeant · tout en un clic."
          : "The best signals surface in a daily Top 10. Score, expected return, insider history — all in one click."}
      >
        <AnimSignal isFr={isFr} />
      </AnimPanel>
    </div>
  );
}

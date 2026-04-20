"use client";

import { useRef, useEffect, useCallback } from "react";

// ── Shared colors (CSS var values resolved at runtime) ────────────────────
const C = {
  bg:      "#060D1B",
  indigo:  "#5B8AF6",
  indigo2: "#7BA3FF",
  emerald: "#10B981",
  emerald2:"#34D399",
  crimson: "#F43F5E",
  amber:   "#F59E0B",
  violet:  "#A78BFA",
  grid:    "rgba(91,138,246,0.07)",
  glow:    "rgba(91,138,246,0.18)",
};

function easeInOut(t: number) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

// ── STEP 1 — Collecte AMF (data streaming) ────────────────────────────────

function useDraw1(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;
    let frame = 0, raf = 0;

    // Flowing particles along 3 lanes
    const LANES = [H * 0.3, H * 0.5, H * 0.7];
    const particles: { x: number; lane: number; speed: number; size: number; alpha: number; color: string }[] = [];
    for (let i = 0; i < 18; i++) {
      particles.push({
        x: Math.random() * W,
        lane: Math.floor(Math.random() * LANES.length),
        speed: 0.5 + Math.random() * 1.2,
        size: 2 + Math.random() * 2.5,
        alpha: 0.4 + Math.random() * 0.6,
        color: Math.random() > 0.3 ? C.indigo : C.emerald,
      });
    }

    // AMF data rows
    const rows = [
      { label: "SCHNEIDER ELECTRIC", val: "4 200 000 €", parsed: true },
      { label: "LVMH SA",            val: "12 500 000 €", parsed: true },
      { label: "TOTALENERGIES SE",   val: "834 000 €",    parsed: true },
      { label: "HERMÈS INTL",        val: "2 100 000 €",  parsed: true },
      { label: "SOCIÉTÉ GÉNÉRALE",   val: "890 000 €",    parsed: false },
    ];

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // Background
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);

      // Subtle grid
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 0.5;
      for (let x = 0; x < W; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      // Lane tracks
      LANES.forEach((y, li) => {
        const grad = ctx.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0, "rgba(91,138,246,0)");
        grad.addColorStop(0.5, `rgba(91,138,246,${0.1 + li * 0.03})`);
        grad.addColorStop(1, "rgba(91,138,246,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 8]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        ctx.setLineDash([]);
      });

      // Particles
      particles.forEach((p) => {
        const y = LANES[p.lane];
        p.x += p.speed;
        if (p.x > W + 10) p.x = -10;

        // Glow
        const grd = ctx.createRadialGradient(p.x, y, 0, p.x, y, p.size * 4);
        grd.addColorStop(0, p.color + "AA");
        grd.addColorStop(1, "transparent");
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(p.x, y, p.size * 4, 0, Math.PI * 2); ctx.fill();

        // Core
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath(); ctx.arc(p.x, y, p.size, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      });

      // AMF data table (right side)
      const tableX = W * 0.45;
      const rowH = 20;
      const visibleRows = Math.min(rows.length, Math.floor((frame / 40)) + 1);

      ctx.font = "bold 8px 'JetBrains Mono', monospace";
      ctx.fillStyle = C.indigo2;
      ctx.fillText("AMF BDIF FEED", tableX, 22);

      rows.slice(0, visibleRows).forEach((row, i) => {
        const alpha = i === visibleRows - 1 ? clamp((frame % 40) / 20, 0, 1) : 1;
        const y = 36 + i * rowH;
        ctx.globalAlpha = alpha;

        // Row bg
        ctx.fillStyle = row.parsed ? "rgba(16,185,129,0.08)" : "rgba(91,138,246,0.06)";
        ctx.fillRect(tableX - 2, y - 12, W - tableX + 2 - 4, rowH - 2);

        // Status dot
        ctx.fillStyle = row.parsed ? C.emerald : C.indigo;
        ctx.beginPath(); ctx.arc(tableX + 4, y - 4, 3, 0, Math.PI * 2); ctx.fill();

        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.fillStyle = "rgba(232,240,254,0.9)";
        ctx.fillText(row.label, tableX + 12, y - 3);

        ctx.fillStyle = row.parsed ? C.emerald2 : C.indigo2;
        ctx.textAlign = "right";
        ctx.fillText(row.val, W - 8, y - 3);
        ctx.textAlign = "left";
        ctx.globalAlpha = 1;
      });

      // Scanner beam
      const beamX = (Math.sin(frame * 0.015) * 0.5 + 0.5) * W * 0.4;
      const beamGrd = ctx.createLinearGradient(beamX - 20, 0, beamX + 20, 0);
      beamGrd.addColorStop(0, "transparent");
      beamGrd.addColorStop(0.5, `rgba(91,138,246,0.15)`);
      beamGrd.addColorStop(1, "transparent");
      ctx.fillStyle = beamGrd;
      ctx.fillRect(beamX - 20, 0, 40, H);

      // Source label (left)
      ctx.font = "bold 9px 'Inter', sans-serif";
      ctx.fillStyle = C.indigo2;
      ctx.textAlign = "center";
      ctx.fillText("AMF", W * 0.08, H - 18);
      ctx.fillText("BDIF", W * 0.08, H - 8);
      // DB label
      ctx.fillText("Base", W * 0.93, H - 18);
      ctx.fillText("DB", W * 0.93, H - 8);
      ctx.textAlign = "left";

      frame++;
      if (frame > 10000) frame = 0;
      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ── STEP 2 — Scoring algorithmique ────────────────────────────────────────

function useDraw2(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;
    let frame = 0, raf = 0;
    const CX = W * 0.38, CY = H * 0.5;
    const R = Math.min(W, H) * 0.34;

    const CRITERIA = [
      { label: "Montant / Mcap", pct: 0.92, color: C.emerald },
      { label: "Rôle dirigeant",  pct: 0.85, color: C.indigo },
      { label: "Backtest signal", pct: 0.78, color: C.violet },
      { label: "Cluster",         pct: 0.65, color: C.amber },
      { label: "Historique",      pct: 0.72, color: C.emerald2 },
    ];

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);

      // Bg grid
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 0.5;
      for (let x = 0; x < W; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      // Gauge background rings
      [1, 0.75, 0.5].forEach((r, i) => {
        ctx.strokeStyle = `rgba(91,138,246,${0.06 + i * 0.02})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(CX, CY, R * r, 0, Math.PI * 2); ctx.stroke();
      });

      // Pulsing outer ring
      const pulse = (Math.sin(frame * 0.04) * 0.5 + 0.5) * 0.12;
      const outerGrd = ctx.createRadialGradient(CX, CY, R * 0.85, CX, CY, R * 1.15);
      outerGrd.addColorStop(0, `rgba(91,138,246,${pulse})`);
      outerGrd.addColorStop(1, "transparent");
      ctx.fillStyle = outerGrd;
      ctx.beginPath(); ctx.arc(CX, CY, R * 1.15, 0, Math.PI * 2); ctx.fill();

      // Score arc fills over time — 6s cycle
      const CYCLE = 360;
      const t = (frame % CYCLE) / CYCLE;
      const fillT = t < 0.5 ? easeInOut(t * 2) : easeInOut((1 - t) * 2);
      const targetScore = 87;
      const displayScore = Math.round(lerp(0, targetScore, fillT));
      const sweepAngle = (displayScore / 100) * (Math.PI * 1.6);
      const startAngle = Math.PI * 0.7;

      // Arc track
      ctx.strokeStyle = "rgba(91,138,246,0.12)";
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(CX, CY, R * 0.82, startAngle, startAngle + Math.PI * 1.6);
      ctx.stroke();

      // Filled arc
      if (displayScore > 0) {
        const arcGrd = ctx.createLinearGradient(CX - R, CY, CX + R, CY);
        arcGrd.addColorStop(0, C.indigo);
        arcGrd.addColorStop(0.5, C.violet);
        arcGrd.addColorStop(1, C.emerald);
        ctx.strokeStyle = arcGrd;
        ctx.lineWidth = 10;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(CX, CY, R * 0.82, startAngle, startAngle + sweepAngle);
        ctx.stroke();

        // Arc glow
        ctx.strokeStyle = `rgba(91,138,246,0.3)`;
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.arc(CX, CY, R * 0.82, startAngle, startAngle + sweepAngle);
        ctx.stroke();
      }

      // Score number
      ctx.font = `bold ${Math.round(R * 0.52)}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = "#E8F0FE";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(displayScore), CX, CY - 4);

      ctx.font = "bold 9px 'Inter', sans-serif";
      ctx.fillStyle = C.indigo2;
      ctx.fillText("/ 100", CX, CY + R * 0.28);

      ctx.font = "8px 'Inter', sans-serif";
      ctx.fillStyle = "rgba(139,166,204,0.7)";
      ctx.fillText("CONVICTION", CX, CY - R * 0.42);

      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";

      // Criteria bars (right side)
      const barX = W * 0.68;
      const barW = W - barX - 10;
      CRITERIA.forEach((c, i) => {
        const y = H * 0.2 + i * (H * 0.14);
        const filled = fillT * c.pct;

        ctx.font = "8px 'Inter', sans-serif";
        ctx.fillStyle = "rgba(139,166,204,0.8)";
        ctx.fillText(c.label, barX, y);

        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.beginPath(); ctx.roundRect(barX, y + 4, barW, 5, 2); ctx.fill();

        ctx.fillStyle = c.color;
        ctx.beginPath(); ctx.roundRect(barX, y + 4, barW * filled, 5, 2); ctx.fill();

        ctx.font = "bold 8px 'JetBrains Mono', monospace";
        ctx.fillStyle = c.color;
        ctx.textAlign = "right";
        ctx.fillText(`${Math.round(c.pct * filled * 100)}%`, W - 6, y);
        ctx.textAlign = "left";
      });

      frame++;
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ── STEP 3 — Backtest historique ──────────────────────────────────────────

function useDraw3(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;
    let frame = 0, raf = 0;

    // Pre-computed equity curve (normalized 0-1)
    const curve = [0.50,0.52,0.55,0.53,0.58,0.56,0.62,0.59,0.65,0.63,0.70,0.68,0.74,0.72,0.79,0.76,0.83,0.80,0.87,0.84,0.91,0.89,0.95,0.92,0.98];
    const trades: { xi: number; win: boolean }[] = [
      { xi: 2,  win: true  }, { xi: 5,  win: false },
      { xi: 8,  win: true  }, { xi: 11, win: true  },
      { xi: 14, win: true  }, { xi: 17, win: false },
      { xi: 20, win: true  }, { xi: 23, win: true  },
    ];

    const padL = 28, padR = 16, padT = 24, padB = 32;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    function xOf(i: number) { return padL + (i / (curve.length - 1)) * plotW; }
    function yOf(v: number) { return padT + (1 - v) * plotH; }

    const CYCLE = 300;

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 0.5;
      for (let x = padL; x <= W - padR; x += plotW / 4) { ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke(); }
      for (let y = padT; y <= H - padB; y += plotH / 3) { ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke(); }

      // Y axis labels
      ctx.font = "7px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(77,106,138,0.8)";
      ctx.textAlign = "right";
      ["+50%", "+25%", "0%"].forEach((l, i) => {
        ctx.fillText(l, padL - 4, padT + i * plotH / 3 + 3);
      });
      ctx.textAlign = "left";

      const t = (frame % CYCLE) / CYCLE;
      const progress = Math.min(1, t < 0.6 ? easeInOut(t / 0.6) : 1);
      const N = Math.floor(progress * (curve.length - 1));
      const frac = (progress * (curve.length - 1)) - N;

      if (N > 0) {
        // Fill area
        const fillGrd = ctx.createLinearGradient(0, padT, 0, H - padB);
        fillGrd.addColorStop(0, "rgba(16,185,129,0.22)");
        fillGrd.addColorStop(1, "rgba(16,185,129,0.02)");
        ctx.fillStyle = fillGrd;
        ctx.beginPath();
        ctx.moveTo(xOf(0), yOf(curve[0]));
        for (let i = 1; i <= N; i++) ctx.lineTo(xOf(i), yOf(curve[i]));
        if (N < curve.length - 1) {
          const xEnd = lerp(xOf(N), xOf(N + 1), frac);
          const yEnd = lerp(yOf(curve[N]), yOf(curve[N + 1]), frac);
          ctx.lineTo(xEnd, yEnd);
          ctx.lineTo(xEnd, H - padB);
        } else ctx.lineTo(xOf(N), H - padB);
        ctx.lineTo(xOf(0), H - padB);
        ctx.closePath(); ctx.fill();

        // Line
        ctx.strokeStyle = C.emerald;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.shadowColor = C.emerald;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(xOf(0), yOf(curve[0]));
        for (let i = 1; i <= N; i++) ctx.lineTo(xOf(i), yOf(curve[i]));
        if (N < curve.length - 1) {
          ctx.lineTo(lerp(xOf(N), xOf(N + 1), frac), lerp(yOf(curve[N]), yOf(curve[N + 1]), frac));
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Trade dots
        trades.forEach(({ xi, win }) => {
          if (xi > N) return;
          const alpha = xi < N ? 1 : frac;
          const x = xOf(xi), y = yOf(curve[xi]);
          const col = win ? C.emerald : C.crimson;
          ctx.globalAlpha = alpha;
          ctx.shadowColor = col; ctx.shadowBlur = 12;
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        });

        // Moving cursor at head
        const headX = N < curve.length - 1
          ? lerp(xOf(N), xOf(N + 1), frac)
          : xOf(N);
        const headY = N < curve.length - 1
          ? lerp(yOf(curve[N]), yOf(curve[N + 1]), frac)
          : yOf(curve[N]);
        const pulse = (Math.sin(frame * 0.12) * 0.5 + 0.5);
        ctx.fillStyle = `rgba(16,185,129,${0.15 * pulse})`;
        ctx.beginPath(); ctx.arc(headX, headY, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.emerald;
        ctx.beginPath(); ctx.arc(headX, headY, 4, 0, Math.PI * 2); ctx.fill();
      }

      // Stats (appear after 60%)
      if (t > 0.5) {
        const statsAlpha = clamp((t - 0.5) / 0.15, 0, 1);
        ctx.globalAlpha = statsAlpha;
        const wins = trades.filter(t => t.xi <= N && t.win).length;
        const total = trades.filter(t => t.xi <= N).length;

        ctx.font = "bold 11px 'JetBrains Mono', monospace";
        ctx.fillStyle = C.emerald;
        ctx.textAlign = "right";
        ctx.fillText(`${total > 0 ? Math.round(wins / total * 100) : 0}%`, W - padR, padT + 14);
        ctx.font = "7px 'Inter', sans-serif";
        ctx.fillStyle = "rgba(139,166,204,0.8)";
        ctx.fillText("win rate", W - padR, padT + 24);

        const perf = curve[Math.min(N, curve.length - 1)];
        ctx.font = "bold 11px 'JetBrains Mono', monospace";
        ctx.fillStyle = C.emerald2;
        ctx.fillText(`+${Math.round((perf - 0.5) * 100)}%`, W - padR, padT + 46);
        ctx.font = "7px 'Inter', sans-serif";
        ctx.fillStyle = "rgba(139,166,204,0.8)";
        ctx.fillText("retour T+90", W - padR, padT + 56);
        ctx.textAlign = "left";
        ctx.globalAlpha = 1;
      }

      // Title
      ctx.font = "bold 8px 'Inter', sans-serif";
      ctx.fillStyle = C.indigo2;
      ctx.fillText("PERFORMANCE HISTORIQUE · T+90", padL, 14);

      frame++;
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ── STEP 4 — Signal & Recommandation ─────────────────────────────────────

function useDraw4(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;
    let frame = 0, raf = 0;

    const CYCLE = 320;
    const lines = [
      { label: "SCHNEIDER ELECTRIC", color: "#E8F0FE", delay: 0.10 },
      { label: "PDG · J.P. Tricoire",color: "#8BA6CC",  delay: 0.20 },
      { label: "4 200 000 €",        color: C.emerald2, delay: 0.30 },
      { label: "Score de signal",     color: "#8BA6CC",  delay: 0.42 },
    ];

    function typewriter(text: string, progress: number): string {
      return text.slice(0, Math.floor(progress * text.length));
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);

      // Ambient glow
      const t = (frame % CYCLE) / CYCLE;
      const glow = Math.sin(frame * 0.035) * 0.5 + 0.5;
      const radGrd = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, H * 0.6);
      radGrd.addColorStop(0, `rgba(16,185,129,${0.08 * glow})`);
      radGrd.addColorStop(0.5, `rgba(91,138,246,${0.05})`);
      radGrd.addColorStop(1, "transparent");
      ctx.fillStyle = radGrd;
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 0.5;
      for (let x = 0; x < W; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      // Card
      const cx = W * 0.5, cy = H * 0.5;
      const cw = W * 0.82, ch = H * 0.78;
      const cx0 = cx - cw / 2, cy0 = cy - ch / 2;

      const cardAlpha = clamp(t / 0.08, 0, 1);
      ctx.globalAlpha = cardAlpha;
      ctx.fillStyle = "rgba(10,22,40,0.95)";
      ctx.strokeStyle = `rgba(91,138,246,${0.3 + glow * 0.2})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(cx0, cy0, cw, ch, 12); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;

      // "NOUVEAU SIGNAL" badge
      if (t > 0.05) {
        const bAlpha = clamp((t - 0.05) / 0.06, 0, 1);
        ctx.globalAlpha = bAlpha;
        const badgeW = 86, badgeH = 16;
        const bx = cx - badgeW / 2, by = cy0 + 10;
        ctx.fillStyle = C.emerald;
        ctx.shadowColor = C.emerald; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.roundRect(bx, by, badgeW, badgeH, 4); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = "bold 8px 'Inter', sans-serif";
        ctx.fillStyle = "#000";
        ctx.textAlign = "center";
        ctx.fillText("▲ SIGNAL ACHAT FORT", cx, by + 10.5);
        ctx.textAlign = "left";
        ctx.globalAlpha = 1;
      }

      // Text lines
      lines.forEach(({ label, color, delay }, i) => {
        if (t < delay) return;
        const progress = clamp((t - delay) / 0.15, 0, 1);
        const text = typewriter(label, progress);
        const y = cy0 + 40 + i * 22;
        const alpha = progress;
        ctx.globalAlpha = alpha;

        if (i === 0) {
          ctx.font = "bold 12px 'Banana Grotesk', 'Inter', sans-serif";
        } else if (i === 2) {
          ctx.font = "bold 11px 'JetBrains Mono', monospace";
        } else {
          ctx.font = "9px 'Inter', sans-serif";
        }
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.fillText(text, cx, y);
        ctx.textAlign = "left";

        // Cursor blink
        if (progress > 0 && progress < 1) {
          const tw = ctx.measureText(text).width;
          if (frame % 20 < 12) {
            ctx.fillStyle = C.indigo2;
            ctx.fillRect(cx + tw / 2 + 1, y - 10, 1.5, 11);
          }
        }
        ctx.globalAlpha = 1;
      });

      // Score bar
      if (t > 0.45) {
        const barAlpha = clamp((t - 0.45) / 0.08, 0, 1);
        ctx.globalAlpha = barAlpha;
        const scoreProgress = clamp((t - 0.45) / 0.25, 0, 1);
        const score = Math.round(easeInOut(scoreProgress) * 87);
        const barY = cy0 + ch - 54;
        const barX = cx0 + 16, barW = cw - 32;

        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.beginPath(); ctx.roundRect(barX, barY, barW, 7, 3); ctx.fill();

        const barGrd = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        barGrd.addColorStop(0, C.indigo);
        barGrd.addColorStop(0.6, C.violet);
        barGrd.addColorStop(1, C.emerald);
        ctx.fillStyle = barGrd;
        ctx.shadowColor = C.indigo; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.roundRect(barX, barY, barW * score / 100, 7, 3); ctx.fill();
        ctx.shadowBlur = 0;

        ctx.font = "bold 9px 'JetBrains Mono', monospace";
        ctx.fillStyle = C.indigo2;
        ctx.textAlign = "left";
        ctx.fillText(`Score ${score}/100`, barX, barY - 4);
        ctx.textAlign = "right";
        ctx.fillStyle = C.emerald;
        ctx.fillText(`+21.4% attendu T+90`, barX + barW, barY - 4);
        ctx.textAlign = "left";
        ctx.globalAlpha = 1;
      }

      // Pulsing ring at end
      if (t > 0.75) {
        const ringAlpha = clamp((t - 0.75) / 0.1, 0, 1) * (Math.sin(frame * 0.08) * 0.3 + 0.7);
        ctx.globalAlpha = ringAlpha * 0.4;
        ctx.strokeStyle = C.emerald;
        ctx.lineWidth = 1.5;
        const rr = H * 0.32 + Math.sin(frame * 0.04) * 4;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.arc(cx, cy, rr * 1.15, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }

      frame++;
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ── Animation panel component ─────────────────────────────────────────────

function AnimPanel({
  step, color, pill, title, body, useAnim
}: {
  step: string;
  color: string;
  pill: string;
  title: string;
  body: string;
  useAnim: (ref: React.RefObject<HTMLCanvasElement | null>) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useAnim(ref);

  return (
    <div className="card overflow-hidden" style={{ display: "flex", flexDirection: "column" }}>
      {/* Canvas */}
      <div style={{ position: "relative", background: C.bg, height: "190px", flexShrink: 0 }}>
        <canvas
          ref={ref}
          width={560}
          height={190}
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      </div>

      {/* Text */}
      <div style={{ padding: "18px 20px 20px" }}>
        <div style={{
          display: "inline-flex", alignItems: "center",
          padding: "2px 10px", borderRadius: "20px",
          fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.08em",
          background: color + "14", border: `1px solid ${color}35`,
          color, marginBottom: "10px",
        }}>
          {pill}
        </div>
        <h3 style={{
          fontFamily: "'Banana Grotesk', 'Inter', system-ui",
          fontWeight: 700, fontSize: "0.95rem", letterSpacing: "-0.02em",
          marginBottom: "6px", color: "var(--tx-1)", lineHeight: 1.3,
        }}>
          {title}
        </h3>
        <p style={{ fontFamily: "'Inter', system-ui", fontSize: "0.82rem", color: "var(--tx-2)", lineHeight: 1.65, margin: 0 }}>
          {body}
        </p>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────

export function HowItWorksAnimations() {
  const steps = [
    {
      step: "01",
      color: C.indigo,
      pill: "01 · Collecte",
      title: "Déclarations AMF en temps réel",
      body: "Chaque déclaration BDIF est récupérée, parsée et enrichie automatiquement chaque jour. Prix, capitalisation, rôle, montant exact.",
      useAnim: useDraw1,
    },
    {
      step: "02",
      color: C.violet,
      pill: "02 · Scoring",
      title: "Score de conviction algorithmique",
      body: "100 points composites : taille vs capitalisation, rôle du dirigeant, performances historiques de la catégorie, signaux cluster.",
      useAnim: useDraw2,
    },
    {
      step: "03",
      color: C.emerald,
      pill: "03 · Backtest",
      title: "Validation sur données historiques",
      body: "Chaque pattern est backtesté sur 22 000+ transactions depuis 2021. Win rate, Sharpe, retour médian T+90 / T+365 vérifiés.",
      useAnim: useDraw3,
    },
    {
      step: "04",
      color: C.amber,
      pill: "04 · Signal",
      title: "Recommandation actionnable",
      body: "Les meilleurs signaux remontent en Top 10 quotidien. Score, retour attendu, historique du dirigeant — tout en un clic.",
      useAnim: useDraw4,
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
      {steps.map((s) => (
        <AnimPanel key={s.step} {...s} />
      ))}
    </div>
  );
}

"use client";

import { useRef, useEffect } from "react";

// ── Theme palette — resolved per-frame from DOM ───────────────────────────────

function getPalette(isDark: boolean) {
  return isDark ? {
    bg:       "#05101F",
    bgSurface:"#0A1628",
    bgRaised: "#0F1E36",
    grid:     "rgba(91,138,246,0.06)",
    border:   "rgba(91,138,246,0.14)",
    tx1:      "#E8F0FE",
    tx2:      "#8BA6CC",
    tx3:      "#4D6A8A",
    indigo:   "#5B8AF6",
    indigo2:  "#7BA3FF",
    emerald:  "#10B981",
    emerald2: "#34D399",
    crimson:  "#F43F5E",
    amber:    "#F59E0B",
    violet:   "#A78BFA",
  } : {
    bg:       "#EDF1F7",
    bgSurface:"#FFFFFF",
    bgRaised: "#F0F4FB",
    grid:     "rgba(59,106,212,0.07)",
    border:   "rgba(59,106,212,0.15)",
    tx1:      "#0A1628",
    tx2:      "#3B5A80",
    tx3:      "#7A9ABF",
    indigo:   "#3B6AD4",
    indigo2:  "#5B8AF6",
    emerald:  "#059669",
    emerald2: "#10B981",
    crimson:  "#DC2626",
    amber:    "#D97706",
    violet:   "#7C3AED",
  };
}

function isDarkMode() {
  if (typeof document === "undefined") return true;
  return !document.documentElement.classList.contains("light");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function easeInOut(t: number) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function hexAlpha(hex: string, a: number) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── STEP 1 — Collecte AMF ────────────────────────────────────────────────────

function useDraw1(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;
    let frame = 0, raf = 0;

    const LANES = [H*0.28, H*0.48, H*0.68];
    const particles: { x:number; lane:number; speed:number; size:number; color:string }[] = [];
    for (let i = 0; i < 22; i++) particles.push({
      x: Math.random()*W, lane: Math.floor(Math.random()*3),
      speed: 0.6+Math.random()*1.4, size: 1.8+Math.random()*2.4,
      color: Math.random() > 0.35 ? "indigo" : "emerald",
    });

    const rows = [
      { label: "SCHNEIDER ELEC.", val: "4 200 000 €", ok: true  },
      { label: "LVMH SA",         val: "12 500 000 €", ok: true  },
      { label: "TOTALENERGIES SE",val: "834 000 €",    ok: true  },
      { label: "HERMÈS INTL",     val: "2 100 000 €",  ok: true  },
      { label: "SOCIÉTÉ GÉNÉRALE",val: "890 000 €",    ok: false },
    ];

    function draw() {
      const P = getPalette(isDarkMode());
      ctx.clearRect(0,0,W,H);

      // Background gradient
      const grd = ctx.createLinearGradient(0,0,W,H);
      grd.addColorStop(0, P.bg);
      grd.addColorStop(1, P.bgSurface);
      ctx.fillStyle = grd;
      ctx.fillRect(0,0,W,H);

      // Grid lines
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 0.5;
      for (let x=0; x<W; x+=30) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for (let y=0; y<H; y+=30) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

      // Lane tracks
      LANES.forEach((y, li) => {
        const g2 = ctx.createLinearGradient(0,0,W,0);
        g2.addColorStop(0, "transparent");
        g2.addColorStop(0.5, hexAlpha(P.indigo, 0.08+li*0.02));
        g2.addColorStop(1, "transparent");
        ctx.strokeStyle = g2; ctx.lineWidth = 1;
        ctx.setLineDash([3, 9]);
        ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
        ctx.setLineDash([]);
      });

      // Moving particles
      particles.forEach(p => {
        const col = p.color === "indigo" ? P.indigo : P.emerald;
        const y = LANES[p.lane];
        p.x += p.speed; if (p.x > W+8) p.x = -8;
        // Glow
        const gd = ctx.createRadialGradient(p.x,y,0,p.x,y,p.size*5);
        gd.addColorStop(0, hexAlpha(col, 0.5));
        gd.addColorStop(1, "transparent");
        ctx.fillStyle = gd; ctx.beginPath(); ctx.arc(p.x,y,p.size*5,0,Math.PI*2); ctx.fill();
        // Core dot
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x,y,p.size,0,Math.PI*2); ctx.fill();
      });

      // Scanner beam
      const bx = (Math.sin(frame*0.014)*0.5+0.5)*W*0.35;
      const bg2 = ctx.createLinearGradient(bx-22,0,bx+22,0);
      bg2.addColorStop(0,"transparent"); bg2.addColorStop(0.5,hexAlpha(P.indigo,0.12)); bg2.addColorStop(1,"transparent");
      ctx.fillStyle=bg2; ctx.fillRect(bx-22,0,44,H);

      // Data table (right side)
      const tx = W*0.44; const rowH = (H-30)/rows.length;
      const visN = Math.min(rows.length, Math.floor(frame/45)+1);

      // Table header
      ctx.font = "bold 7px 'JetBrains Mono', monospace";
      ctx.fillStyle = P.tx3; ctx.textAlign = "left";
      ctx.fillText("AMF · BDIF FEED", tx, 16);

      rows.slice(0, visN).forEach((row, i) => {
        const alpha = i === visN-1 ? clamp((frame%45)/20,0,1) : 1;
        const y = 26 + i * rowH;
        ctx.globalAlpha = alpha;
        // Row bg
        ctx.fillStyle = row.ok ? hexAlpha(P.emerald,0.08) : hexAlpha(P.indigo,0.06);
        ctx.beginPath(); ctx.roundRect(tx-2, y-11, W-tx+2-6, rowH-3, 4); ctx.fill();
        // Status dot
        ctx.fillStyle = row.ok ? P.emerald : P.amber;
        ctx.beginPath(); ctx.arc(tx+5, y-3, 3, 0, Math.PI*2); ctx.fill();
        // Name
        ctx.font = "7.5px 'Inter', sans-serif"; ctx.fillStyle = P.tx1; ctx.textAlign = "left";
        ctx.fillText(row.label, tx+14, y-1);
        // Amount
        ctx.font = "bold 7.5px 'JetBrains Mono', monospace";
        ctx.fillStyle = row.ok ? P.emerald2 : P.tx3; ctx.textAlign = "right";
        ctx.fillText(row.val, W-8, y-1);
        ctx.globalAlpha = 1;
      });
      ctx.textAlign = "left";

      // Left label
      ctx.font = "bold 8px 'Inter', sans-serif"; ctx.fillStyle = P.indigo2; ctx.textAlign = "center";
      ctx.fillText("AMF", W*0.1, H-14); ctx.fillText("BDIF", W*0.1, H-4);
      ctx.fillText("DB", W*0.91, H-14); ctx.fillText("↗", W*0.91, H-4);
      ctx.textAlign = "left";

      frame++; raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ── STEP 2 — Scoring algorithmique ───────────────────────────────────────────

function useDraw2(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;
    let frame = 0, raf = 0;
    const CX = W*0.36, CY = H*0.5, R = Math.min(W,H)*0.33;

    const CRITERIA = [
      { label: "Montant / Mcap", pct:0.92, color:"emerald" },
      { label: "Rôle dirigeant", pct:0.85, color:"indigo"  },
      { label: "Backtest signal",pct:0.78, color:"violet"  },
      { label: "Cluster",        pct:0.66, color:"amber"   },
      { label: "Historique",     pct:0.73, color:"emerald2"},
    ];

    function draw() {
      const P = getPalette(isDarkMode());
      ctx.clearRect(0,0,W,H);
      const grd = ctx.createLinearGradient(0,0,W,H);
      grd.addColorStop(0, P.bg); grd.addColorStop(1, P.bgSurface);
      ctx.fillStyle = grd; ctx.fillRect(0,0,W,H);

      // Grid
      ctx.strokeStyle = P.grid; ctx.lineWidth=0.5;
      for (let x=0;x<W;x+=30){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
      for (let y=0;y<H;y+=30){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

      const CYCLE=360, t=(frame%CYCLE)/CYCLE;
      const fillT = t<0.5 ? easeInOut(t*2) : easeInOut((1-t)*2);
      const score = Math.round(lerp(0,87,fillT));
      const sweep = (score/100)*Math.PI*1.65;
      const start = Math.PI*0.67;

      // Concentric rings
      [1,0.7,0.45].forEach((s,i)=>{
        ctx.strokeStyle = hexAlpha(P.indigo, 0.07+i*0.02);
        ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(CX,CY,R*s,0,Math.PI*2); ctx.stroke();
      });

      // Outer pulse
      const pulse = Math.sin(frame*0.04)*0.5+0.5;
      const pg = ctx.createRadialGradient(CX,CY,R*0.8,CX,CY,R*1.2);
      pg.addColorStop(0,hexAlpha(P.indigo,0.13*pulse)); pg.addColorStop(1,"transparent");
      ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(CX,CY,R*1.2,0,Math.PI*2); ctx.fill();

      // Arc track
      ctx.strokeStyle=hexAlpha(P.indigo,isDarkMode()?0.14:0.12); ctx.lineWidth=11; ctx.lineCap="round";
      ctx.beginPath(); ctx.arc(CX,CY,R*0.82,start,start+Math.PI*1.65); ctx.stroke();

      // Filled arc
      if (score>0) {
        const ag = ctx.createLinearGradient(CX-R,CY,CX+R,CY);
        ag.addColorStop(0,P.indigo); ag.addColorStop(0.55,P.violet); ag.addColorStop(1,P.emerald);
        // Glow
        ctx.strokeStyle=hexAlpha(P.indigo,0.25); ctx.lineWidth=19; ctx.lineCap="round";
        ctx.beginPath(); ctx.arc(CX,CY,R*0.82,start,start+sweep); ctx.stroke();
        // Main arc
        ctx.strokeStyle=ag; ctx.lineWidth=11; ctx.lineCap="round";
        ctx.beginPath(); ctx.arc(CX,CY,R*0.82,start,start+sweep); ctx.stroke();
      }

      // Score number
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.font=`bold ${Math.round(R*0.56)}px 'JetBrains Mono', monospace`;
      ctx.fillStyle=P.tx1; ctx.fillText(String(score),CX,CY-3);
      ctx.font=`bold 8px 'Inter', sans-serif`;
      ctx.fillStyle=P.indigo2; ctx.fillText("/ 100",CX,CY+R*0.3);
      ctx.font="7px 'Inter', sans-serif";
      ctx.fillStyle=P.tx3; ctx.fillText("CONVICTION",CX,CY-R*0.44);
      ctx.textAlign="left"; ctx.textBaseline="alphabetic";

      // Criteria bars
      const bx=W*0.67, bW=W-bx-10;
      const colMap: Record<string,string> = {
        emerald:P.emerald, indigo:P.indigo, violet:P.violet, amber:P.amber, emerald2:P.emerald2
      };
      CRITERIA.forEach((c,i)=>{
        const y=H*0.17+i*(H*0.148);
        const col=colMap[c.color];
        const filled=fillT*c.pct;
        ctx.font="7.5px 'Inter', sans-serif"; ctx.fillStyle=P.tx2;
        ctx.fillText(c.label,bx,y);
        // Track
        ctx.fillStyle=isDarkMode()?hexAlpha(P.indigo,0.1):hexAlpha(P.indigo,0.08);
        ctx.beginPath(); ctx.roundRect(bx,y+4,bW,5,2); ctx.fill();
        // Fill
        ctx.fillStyle=col;
        if (filled>0) { ctx.beginPath(); ctx.roundRect(bx,y+4,bW*filled,5,2); ctx.fill(); }
        // Pct
        ctx.font="bold 7.5px 'JetBrains Mono', monospace";
        ctx.fillStyle=col; ctx.textAlign="right";
        ctx.fillText(`${Math.round(c.pct*filled*100)}%`,W-7,y+1);
        ctx.textAlign="left";
      });

      frame++; raf=requestAnimationFrame(draw);
    }
    raf=requestAnimationFrame(draw);
    return ()=>cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ── STEP 3 — Backtest historique ─────────────────────────────────────────────

function useDraw3(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;
    let frame = 0, raf = 0;

    const curve = [0.50,0.52,0.56,0.54,0.59,0.57,0.63,0.60,0.67,0.64,0.71,0.68,0.75,0.72,0.80,0.77,0.84,0.81,0.88,0.85,0.92,0.89,0.95,0.93,0.98];
    const tradeEvts: { xi:number; win:boolean }[] = [
      {xi:2,win:true},{xi:5,win:false},{xi:8,win:true},{xi:11,win:true},
      {xi:14,win:true},{xi:17,win:false},{xi:20,win:true},{xi:23,win:true},
    ];
    const pL=32,pR=16,pT=28,pB=36;
    const plotW=W-pL-pR, plotH=H-pT-pB;
    const xOf=(i:number)=>pL+(i/(curve.length-1))*plotW;
    const yOf=(v:number)=>pT+(1-v)*plotH;
    const CYCLE=280;

    function draw() {
      const P = getPalette(isDarkMode());
      ctx.clearRect(0,0,W,H);
      const grd=ctx.createLinearGradient(0,0,W,H);
      grd.addColorStop(0,P.bg); grd.addColorStop(1,P.bgSurface);
      ctx.fillStyle=grd; ctx.fillRect(0,0,W,H);

      // Grid
      ctx.strokeStyle=P.grid; ctx.lineWidth=0.5;
      for(let x=pL;x<=W-pR;x+=plotW/4){ctx.beginPath();ctx.moveTo(x,pT);ctx.lineTo(x,H-pB);ctx.stroke();}
      for(let y=pT;y<=H-pB;y+=plotH/3){ctx.beginPath();ctx.moveTo(pL,y);ctx.lineTo(W-pR,y);ctx.stroke();}

      // Y labels
      ctx.font="7px 'JetBrains Mono', monospace";
      ctx.fillStyle=P.tx3; ctx.textAlign="right";
      ["+50%","+25%","0%"].forEach((l,i)=>ctx.fillText(l,pL-4,pT+i*plotH/3+3));
      ctx.textAlign="left";

      const t=(frame%CYCLE)/CYCLE;
      const progress=Math.min(1,t<0.65?easeInOut(t/0.65):1);
      const N=Math.floor(progress*(curve.length-1));
      const frac=(progress*(curve.length-1))-N;

      if(N>0){
        // Area fill
        const fgrd=ctx.createLinearGradient(0,pT,0,H-pB);
        fgrd.addColorStop(0,hexAlpha(P.emerald,isDarkMode()?0.22:0.16));
        fgrd.addColorStop(1,hexAlpha(P.emerald,0.02));
        ctx.fillStyle=fgrd;
        ctx.beginPath(); ctx.moveTo(xOf(0),yOf(curve[0]));
        for(let i=1;i<=N;i++) ctx.lineTo(xOf(i),yOf(curve[i]));
        const hx=N<curve.length-1?lerp(xOf(N),xOf(N+1),frac):xOf(N);
        const hy=N<curve.length-1?lerp(yOf(curve[N]),yOf(curve[N+1]),frac):yOf(curve[N]);
        ctx.lineTo(hx,H-pB); ctx.lineTo(xOf(0),H-pB); ctx.closePath(); ctx.fill();

        // Line
        ctx.strokeStyle=P.emerald; ctx.lineWidth=2.5; ctx.lineJoin="round"; ctx.lineCap="round";
        ctx.shadowColor=P.emerald; ctx.shadowBlur=isDarkMode()?10:4;
        ctx.beginPath(); ctx.moveTo(xOf(0),yOf(curve[0]));
        for(let i=1;i<=N;i++) ctx.lineTo(xOf(i),yOf(curve[i]));
        if(N<curve.length-1) ctx.lineTo(hx,hy);
        ctx.stroke(); ctx.shadowBlur=0;

        // Trade dots
        tradeEvts.forEach(({xi,win})=>{
          if(xi>N) return;
          const alpha=xi<N?1:frac;
          const x=xOf(xi),y=yOf(curve[xi]),col=win?P.emerald:P.crimson;
          ctx.globalAlpha=alpha;
          ctx.shadowColor=col; ctx.shadowBlur=isDarkMode()?14:6;
          ctx.fillStyle=col; ctx.beginPath(); ctx.arc(x,y,5.5,0,Math.PI*2); ctx.fill();
          ctx.fillStyle=isDarkMode()?"#fff":P.bgSurface;
          ctx.beginPath(); ctx.arc(x,y,2.5,0,Math.PI*2); ctx.fill();
          ctx.shadowBlur=0; ctx.globalAlpha=1;
        });

        // Cursor head
        const pulse=Math.sin(frame*0.12)*0.5+0.5;
        ctx.fillStyle=hexAlpha(P.emerald,0.18*pulse);
        ctx.beginPath(); ctx.arc(hx,hy,13,0,Math.PI*2); ctx.fill();
        ctx.fillStyle=P.emerald; ctx.beginPath(); ctx.arc(hx,hy,4.5,0,Math.PI*2); ctx.fill();
      }

      // Stats
      if(t>0.55){
        const sa=clamp((t-0.55)/0.1,0,1);
        ctx.globalAlpha=sa;
        const wins=tradeEvts.filter(e=>e.xi<=N&&e.win).length;
        const total=tradeEvts.filter(e=>e.xi<=N).length;
        const perf=curve[Math.min(N,curve.length-1)];
        ctx.font="bold 11px 'JetBrains Mono', monospace";
        ctx.fillStyle=P.emerald; ctx.textAlign="right";
        ctx.fillText(`${total>0?Math.round(wins/total*100):0}%`,W-pR,pT+16);
        ctx.font="7px 'Inter', sans-serif"; ctx.fillStyle=P.tx3;
        ctx.fillText("win rate",W-pR,pT+26);
        ctx.font="bold 11px 'JetBrains Mono', monospace"; ctx.fillStyle=P.emerald2;
        ctx.fillText(`+${Math.round((perf-0.5)*100)}%`,W-pR,pT+48);
        ctx.font="7px 'Inter', sans-serif"; ctx.fillStyle=P.tx3;
        ctx.fillText("retour T+90",W-pR,pT+58);
        ctx.textAlign="left"; ctx.globalAlpha=1;
      }

      ctx.font="bold 7.5px 'Inter', sans-serif"; ctx.fillStyle=P.indigo2;
      ctx.fillText("PERFORMANCE HISTORIQUE · T+90",pL,16);

      frame++; raf=requestAnimationFrame(draw);
    }
    raf=requestAnimationFrame(draw);
    return ()=>cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ── STEP 4 — Signal & Recommandation ─────────────────────────────────────────

function useDraw4(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;
    let frame = 0, raf = 0;
    const CYCLE=340;

    const lines = [
      { text:"SCHNEIDER ELECTRIC", size:13, bold:true,  color:"tx1",    delay:0.08 },
      { text:"PDG · J.P. Tricoire",size:9,  bold:false, color:"tx2",    delay:0.18 },
      { text:"4 200 000 €",         size:11, bold:true,  color:"emerald",delay:0.28 },
    ];

    function typewriter(s:string, p:number) { return s.slice(0,Math.floor(p*s.length)); }

    function draw() {
      const P = getPalette(isDarkMode());
      const dark = isDarkMode();
      const t=(frame%CYCLE)/CYCLE;
      ctx.clearRect(0,0,W,H);

      // Background
      const grd=ctx.createLinearGradient(0,0,W,H);
      grd.addColorStop(0,P.bg); grd.addColorStop(1,P.bgSurface);
      ctx.fillStyle=grd; ctx.fillRect(0,0,W,H);

      // Grid
      ctx.strokeStyle=P.grid; ctx.lineWidth=0.5;
      for(let x=0;x<W;x+=30){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
      for(let y=0;y<H;y+=30){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

      // Ambient emerald glow
      const glow=Math.sin(frame*0.035)*0.5+0.5;
      const rg=ctx.createRadialGradient(W*0.5,H*0.45,0,W*0.5,H*0.45,H*0.65);
      rg.addColorStop(0,hexAlpha(P.emerald,dark?0.1*glow:0.06*glow));
      rg.addColorStop(0.6,hexAlpha(P.indigo,dark?0.04:0.02));
      rg.addColorStop(1,"transparent");
      ctx.fillStyle=rg; ctx.fillRect(0,0,W,H);

      // Card
      const cx=W*0.5,cy=H*0.5,cw=W*0.84,ch=H*0.82;
      const cx0=cx-cw/2,cy0=cy-ch/2;
      const cardAlpha=clamp(t/0.08,0,1);
      ctx.globalAlpha=cardAlpha;
      // Card shadow (light mode only)
      if(!dark){
        ctx.shadowColor="rgba(15,30,60,0.12)"; ctx.shadowBlur=20; ctx.shadowOffsetY=4;
      }
      ctx.fillStyle=P.bgSurface;
      ctx.beginPath(); ctx.roundRect(cx0,cy0,cw,ch,14); ctx.fill();
      if(!dark) ctx.shadowBlur=0;
      // Card border
      ctx.strokeStyle=hexAlpha(P.indigo, dark?0.28+glow*0.15:0.2+glow*0.08);
      ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.roundRect(cx0,cy0,cw,ch,14); ctx.stroke();
      ctx.globalAlpha=1;

      // "SIGNAL ACHAT FORT" badge
      if(t>0.06){
        const ba=clamp((t-0.06)/0.07,0,1);
        ctx.globalAlpha=ba;
        const bw=100,bh=18,bx=cx-bw/2,by=cy0+12;
        ctx.fillStyle=P.emerald;
        if(dark){ctx.shadowColor=P.emerald;ctx.shadowBlur=12;}
        ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,5); ctx.fill();
        ctx.shadowBlur=0;
        ctx.font="bold 7.5px 'Inter', sans-serif";
        ctx.fillStyle=dark?"#000":"#fff"; ctx.textAlign="center";
        ctx.fillText("▲  SIGNAL ACHAT FORT",cx,by+11.5);
        ctx.textAlign="left"; ctx.globalAlpha=1;
      }

      // Text lines
      lines.forEach(({text,size,bold,color,delay},i)=>{
        if(t<delay) return;
        const progress=clamp((t-delay)/0.16,0,1);
        const displayed=typewriter(text,progress);
        const y=cy0+50+i*26;
        const alpha=progress;
        const col=(P as Record<string,string>)[color]??P.tx1;
        ctx.globalAlpha=alpha;
        ctx.font=`${bold?"bold ":""}${size}px '${bold?"Banana Grotesk, ":""}Inter', sans-serif`;
        ctx.fillStyle=col; ctx.textAlign="center";
        ctx.fillText(displayed,cx,y);
        if(progress>0&&progress<1&&frame%18<9){
          const tw=ctx.measureText(displayed).width;
          ctx.fillStyle=P.indigo2;
          ctx.fillRect(cx+tw/2+1,y-size+1,1.5,size);
        }
        ctx.textAlign="left"; ctx.globalAlpha=1;
      });

      // Score bar
      if(t>0.46){
        const sp=clamp((t-0.46)/0.25,0,1);
        const score=Math.round(easeInOut(sp)*87);
        const barY=cy0+ch-58, barX=cx0+18, barW=cw-36;
        ctx.globalAlpha=clamp((t-0.44)/0.08,0,1);

        // Track
        ctx.fillStyle=dark?hexAlpha(P.indigo,0.12):hexAlpha(P.indigo,0.1);
        ctx.beginPath(); ctx.roundRect(barX,barY,barW,8,4); ctx.fill();
        // Fill gradient
        const bg2=ctx.createLinearGradient(barX,0,barX+barW,0);
        bg2.addColorStop(0,P.indigo); bg2.addColorStop(0.55,P.violet); bg2.addColorStop(1,P.emerald);
        if(dark){ctx.shadowColor=P.indigo;ctx.shadowBlur=8;}
        ctx.fillStyle=bg2;
        if(score>0){ctx.beginPath();ctx.roundRect(barX,barY,barW*score/100,8,4);ctx.fill();}
        ctx.shadowBlur=0;

        // Labels
        ctx.font="bold 8px 'JetBrains Mono', monospace";
        ctx.fillStyle=P.indigo2; ctx.textAlign="left";
        ctx.fillText(`Score ${score}/100`,barX,barY-5);
        ctx.fillStyle=P.emerald; ctx.textAlign="right";
        ctx.fillText(`+21.4% attendu T+90`,barX+barW,barY-5);
        ctx.textAlign="left"; ctx.globalAlpha=1;
      }

      // Pulsing rings
      if(t>0.76){
        const ra=clamp((t-0.76)/0.1,0,1)*(Math.sin(frame*0.07)*0.3+0.7);
        const rr=H*0.31+Math.sin(frame*0.04)*4;
        ctx.globalAlpha=ra*(dark?0.35:0.2);
        ctx.strokeStyle=P.emerald; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(cx,cy,rr,0,Math.PI*2); ctx.stroke();
        ctx.lineWidth=0.5;
        ctx.beginPath(); ctx.arc(cx,cy,rr*1.14,0,Math.PI*2); ctx.stroke();
        ctx.globalAlpha=1;
      }

      frame++; raf=requestAnimationFrame(draw);
    }
    raf=requestAnimationFrame(draw);
    return ()=>cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ── Panel component ───────────────────────────────────────────────────────────

function AnimPanel({ step, accentColor, pill, title, body, useAnim }: {
  step: string; accentColor: string; pill: string;
  title: string; body: string;
  useAnim: (r: React.RefObject<HTMLCanvasElement | null>) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useAnim(ref);

  return (
    <div className="card overflow-hidden" style={{ display:"flex", flexDirection:"column", minHeight:"360px" }}>
      {/* Canvas — taller, no hardcoded dark bg */}
      <div style={{ position:"relative", height:"220px", flexShrink:0, overflow:"hidden", borderRadius:"14px 14px 0 0" }}>
        <canvas
          ref={ref}
          width={560}
          height={220}
          style={{ width:"100%", height:"100%", display:"block" }}
        />
      </div>

      {/* Text content */}
      <div style={{ padding:"18px 20px 22px", flex:1, display:"flex", flexDirection:"column" }}>
        <div style={{
          display:"inline-flex", alignItems:"center",
          padding:"2px 10px", borderRadius:"20px", marginBottom:"10px",
          fontSize:"0.61rem", fontWeight:700, letterSpacing:"0.08em",
          background:`${accentColor}15`, border:`1px solid ${accentColor}30`,
          color:accentColor, alignSelf:"flex-start",
        }}>
          {pill}
        </div>
        <h3 style={{
          fontFamily:"'Banana Grotesk','Inter',system-ui",
          fontWeight:700, fontSize:"0.9375rem", letterSpacing:"-0.022em",
          marginBottom:"7px", color:"var(--tx-1)", lineHeight:1.3,
        }}>
          {title}
        </h3>
        <p style={{
          fontFamily:"'Inter',system-ui", fontSize:"0.8125rem",
          color:"var(--tx-2)", lineHeight:1.65, margin:0, flex:1,
        }}>
          {body}
        </p>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

const STEPS = [
  {
    step:"01", accentColor:"#5B8AF6", pill:"01 · Collecte",
    title:"Déclarations AMF en temps réel",
    body:"Chaque déclaration BDIF est récupérée, parsée et enrichie automatiquement chaque jour. Prix, capitalisation, rôle, montant exact.",
    useAnim: useDraw1,
  },
  {
    step:"02", accentColor:"#A78BFA", pill:"02 · Scoring",
    title:"Score de conviction algorithmique",
    body:"100 points composites : taille vs capitalisation, rôle du dirigeant, performances historiques de la catégorie, signaux cluster.",
    useAnim: useDraw2,
  },
  {
    step:"03", accentColor:"#10B981", pill:"03 · Backtest",
    title:"Validation sur données historiques",
    body:"Chaque pattern est backtesté sur 22 000+ transactions depuis 2021. Win rate, Sharpe, retour médian T+90 / T+365 vérifiés.",
    useAnim: useDraw3,
  },
  {
    step:"04", accentColor:"#F59E0B", pill:"04 · Signal",
    title:"Recommandation actionnable",
    body:"Les meilleurs signaux remontent en Top 10 quotidien. Score, retour attendu, historique du dirigeant — tout en un clic.",
    useAnim: useDraw4,
  },
];

export function HowItWorksAnimations() {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))", gap:"16px" }}>
      {STEPS.map(s => <AnimPanel key={s.step} {...s} />)}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

interface DailyCount {
  day: string;
  count: number;
}

interface FreshnessData {
  total: number | null;
  lastScrape: { at: string; company: string | null } | null;
  dailyCounts: DailyCount[];
}

function formatDay(isoDay: string): string {
  const d = new Date(isoDay);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((todayStart.getTime() - dayStart.getTime()) / 86400_000);

  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

export function DataTicker() {
  const [data, setData] = useState<FreshnessData | null>(null);

  useEffect(() => {
    fetch("/api/freshness")
      .then((r) => r.json())
      .then(setData)
      .catch(() => null);
  }, []);

  if (!data || (!data.total && !data.lastScrape)) return null;

  // Build the list of segments to display in the ticker
  const segments: string[] = [];

  if (data.total != null) {
    segments.push(`${data.total.toLocaleString("fr-FR")} déclarations AMF en base`);
  }

  if (data.lastScrape) {
    const time = formatTime(data.lastScrape.at);
    const co = data.lastScrape.company ?? "";
    segments.push(`Dernière ingestion ${time}${co ? ` · ${co}` : ""}`);
  }

  // Up to 4 recent days
  data.dailyCounts.slice(0, 4).forEach((dc) => {
    const label = formatDay(dc.day);
    segments.push(`${label} : ${dc.count} nouvelles`);
  });

  // Duplicate for seamless loop
  const allSegments = [...segments, ...segments];

  return (
    <div className="data-ticker" aria-label="Fraîcheur des données AMF" role="marquee">
      <span className="data-ticker-badge">
        <span className="data-ticker-dot" />
        Live
      </span>
      <div className="data-ticker-track-wrapper">
        <div className="data-ticker-track">
          {allSegments.map((seg, i) => (
            <span key={i} className="data-ticker-item">
              {seg}
              <span className="data-ticker-sep" aria-hidden>·</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

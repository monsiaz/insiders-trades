"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface DailyCount {
  day: string;
  count: number;
}

interface FreshnessData {
  total: number | null;
  lastScrape: { at: string; company: string | null } | null;
  dailyCounts: DailyCount[];
}

function formatDay(isoDay: string, locale: "fr" | "en"): string {
  const d = new Date(isoDay);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((todayStart.getTime() - dayStart.getTime()) / 86400_000);

  if (diffDays === 0) return locale === "fr" ? "Aujourd'hui" : "Today";
  if (diffDays === 1) return locale === "fr" ? "Hier" : "Yesterday";
  return d.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { weekday: "long" });
}

function formatTime(iso: string, locale: "fr" | "en"): string {
  return new Date(iso).toLocaleTimeString(locale === "fr" ? "fr-FR" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

export function DataTicker() {
  const pathname = usePathname();
  const locale: "fr" | "en" = (pathname === "/fr" || pathname.startsWith("/fr/")) ? "fr" : "en";
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
    segments.push(
      locale === "fr"
        ? `${data.total.toLocaleString("fr-FR")} déclarations AMF en base`
        : `${data.total.toLocaleString("en-GB")} AMF declarations in database`
    );
  }

  if (data.lastScrape) {
    const time = formatTime(data.lastScrape.at, locale);
    const co = data.lastScrape.company ?? "";
    segments.push(
      locale === "fr"
        ? `Dernière ingestion ${time}${co ? ` · ${co}` : ""}`
        : `Last ingestion ${time}${co ? ` · ${co}` : ""}`
    );
  }

  // Up to 4 recent days
  data.dailyCounts.slice(0, 4).forEach((dc) => {
    const label = formatDay(dc.day, locale);
    segments.push(
      locale === "fr"
        ? `${label} : ${dc.count} nouvelles`
        : `${label}: ${dc.count} new`
    );
  });

  // Duplicate for seamless loop
  const allSegments = [...segments, ...segments];

  return (
    <div className="data-ticker" aria-label={locale === "fr" ? "Fraîcheur des données AMF" : "AMF data freshness"} role="marquee">
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

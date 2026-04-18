import { XMLParser } from "fast-xml-parser";
import { DeclarationType } from "@prisma/client";

const AMF_RSS_BASE = "https://bdif.amf-france.org/back/api/v1/rss";

export interface AmfRssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
  "dc:date": string;
}

export interface AmfRssFeed {
  companyName: string;
  items: AmfRssItem[];
}

export function parseDeclarationType(description: string): DeclarationType {
  const lower = description.toLowerCase();
  if (lower.includes("déclarations des dirigeants")) return "DIRIGEANTS";
  if (lower.includes("seuils")) return "SEUILS";
  if (lower.includes("prospectus")) return "PROSPECTUS";
  return "OTHER";
}

export function extractAmfId(description: string): string {
  // Extract ID from e.g. "Déclarations des dirigeants 2026DD1095929"
  const parts = description.trim().split(" ");
  return parts[parts.length - 1];
}

export async function fetchAmfRss(amfToken: string): Promise<AmfRssFeed> {
  const url = `${AMF_RSS_BASE}?lang=fr&jetons=${amfToken}`;
  const res = await fetch(url, {
    next: { revalidate: 0 },
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; InsiderTradesBot/1.0; +https://insiders-trades.vercel.app)",
    },
  });

  if (!res.ok) {
    throw new Error(`AMF RSS fetch failed: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  return parseAmfRss(xml);
}

export function parseAmfRss(xml: string): AmfRssFeed {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "_",
    isArray: (name) => name === "item",
  });

  const result = parser.parse(xml);
  const channel = result?.rss?.channel;

  if (!channel) throw new Error("Invalid RSS feed structure");

  const companyName = channel.title as string;
  const items: AmfRssItem[] = (channel.item || []).map(
    (item: Record<string, string>) => ({
      title: item.title || "",
      link: (item.link || "").replace("?xtor=RSS-1", ""),
      description: item.description || "",
      pubDate: item.pubDate || "",
      guid: (item.guid || "").replace("?xtor=RSS-1", ""),
      "dc:date": item["dc:date"] || "",
    })
  );

  return { companyName, items };
}

export function getAmfDetailUrl(amfId: string): string {
  return `https://bdif.amf-france.org/fr/details/${amfId}`;
}

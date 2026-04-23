/**
 * POST /api/translate-news
 *
 * Background job: translate untranslated CompanyNewsItem titles to English
 * using OpenAI.  Called by the main cron endpoint every 12 h.
 *
 * Batch strategy:
 *   – Fetch up to BATCH_SIZE rows where titleEn IS NULL
 *   – Group into chunks of CHUNK_SIZE for a single ChatCompletion call
 *   – Parse JSON array response, update DB rows
 *   – Returns { translated: N, remaining: M }
 *
 * Auth: requires CRON_SECRET header (same as other cron routes).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime  = "nodejs";
export const maxDuration = 60; // Vercel Pro: up to 60 s

const BATCH_SIZE = 200;   // rows fetched per cron call
const CHUNK_SIZE  = 20;   // titles per OpenAI request
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

// ── OpenAI translation helper ────────────────────────────────────────────────

async function translateBatch(titles: string[]): Promise<string[]> {
  if (!OPENAI_KEY || !titles.length) return titles;

  const numbered = titles.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const body = JSON.stringify({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: titles.length * 40,
    messages: [
      {
        role: "system",
        content:
          "You are a financial news translator. Translate each French headline to concise English, preserving proper nouns, tickers, and financial terminology. Respond ONLY with a JSON array of strings in the same order, e.g. [\"Translated 1\",\"Translated 2\"]. No extra text.",
      },
      { role: "user", content: numbered },
    ],
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
    body,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    console.error("[translate-news] OpenAI error:", res.status, await res.text());
    return titles; // fallback: return originals
  }

  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "[]";

  try {
    const parsed = JSON.parse(content.trim()) as string[];
    if (Array.isArray(parsed) && parsed.length === titles.length) return parsed;
  } catch { /* fall through */ }

  // Fallback if JSON parse fails
  return titles;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth: allow CRON_SECRET header or same-origin (localhost)
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  const isLocal = req.headers.get("host")?.includes("localhost");
  if (!isLocal && secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch untranslated items, oldest first (so oldest news gets translated first)
  const untranslated = await prisma.companyNewsItem.findMany({
    where: { titleEn: null },
    orderBy: { pubDate: "asc" },
    take: BATCH_SIZE,
    select: { id: true, titleFr: true, description: true },
  });

  if (!untranslated.length) {
    return NextResponse.json({ translated: 0, remaining: 0, message: "Nothing to translate" });
  }

  // Process in chunks
  let translated = 0;
  for (let i = 0; i < untranslated.length; i += CHUNK_SIZE) {
    const chunk = untranslated.slice(i, i + CHUNK_SIZE);
    const titlesFr = chunk.map((r) => r.titleFr);

    const titlesEn = await translateBatch(titlesFr);

    await Promise.all(
      chunk.map((row, j) =>
        prisma.companyNewsItem.update({
          where: { id: row.id },
          data: {
            titleEn: titlesEn[j] ?? row.titleFr,
            translatedAt: new Date(),
          },
        })
      )
    );
    translated += chunk.length;
  }

  const remaining = await prisma.companyNewsItem.count({ where: { titleEn: null } });

  return NextResponse.json({
    translated,
    remaining,
    message: `Translated ${translated} items. ${remaining} still pending.`,
  });
}

// Allow GET for manual trigger from browser (still checks secret)
export async function GET(req: NextRequest) {
  return POST(req);
}

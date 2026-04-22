/**
 * gender-gpt.ts · GPT-4o gender classification for insider names/functions.
 *
 * Used by the daily cron to resolve gender for insiders that the local
 * heuristic (gender-utils.ts) could not determine.
 *
 * Sends batches of 50 insiders to GPT-4o and updates the DB.
 */

import { prisma } from "./prisma";

interface InsiderItem {
  id: string;
  name: string;
  fn: string;
}

const BATCH_SIZE  = 50;
const CONCURRENCY = 10; // keep low on Vercel (edge memory / timeout)

const SYSTEM_PROMPT = `Tu es un expert en détermination de genre à partir de prénoms et titres de fonctions français.
On te donne une liste de personnes (JSON). Pour chaque personne, détermine si c'est un homme (H) ou une femme (F).
Base-toi sur :
 1. Le prénom (Marie, Sophie → F ; Jean, Pierre → H)
 2. La fonction : formes féminines françaises (Administratrice, Directrice, Présidente, Gérante → F)
 3. En cas de doute ou si c'est une société/entité, réponds "?"
Réponds UNIQUEMENT avec un objet JSON : {"results":[{"id":"...","g":"H"|"F"|"?"}]}.
Aucun texte, aucun markdown, aucun commentaire. JSON brut uniquement.`;

async function classifyBatch(
  items: InsiderItem[],
  apiKey: string
): Promise<Array<{ id: string; g: string }>> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini", // cheaper/faster; same accuracy for names
      temperature: 0,
      max_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify(
            items.map(({ id, name, fn }) => ({ id, name, fn }))
          ),
        },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as { results?: Array<{ id: string; g: string }> };
  return parsed.results ?? [];
}

/**
 * Classify gender for all insiders that have gender=null.
 * Respects Vercel timeout by capping at `maxInsiders`.
 *
 * Returns counts: { resolved, skipped, errors }
 */
export async function gptGenderForUnknownInsiders(options?: {
  maxInsiders?: number;
  apiKey?: string;
}): Promise<{ resolved: number; skipped: number; errors: number }> {
  const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY ?? "";
  const maxInsiders = options?.maxInsiders ?? 500;

  if (!apiKey) {
    console.warn("[gender-gpt] No OPENAI_API_KEY · skipping GPT gender step");
    return { resolved: 0, skipped: 0, errors: 0 };
  }

  // Fetch unknown insiders with their most recent declaration data
  const rawInsiders = await prisma.insider.findMany({
    where: { gender: null },
    orderBy: { createdAt: "desc" },
    take: maxInsiders,
    select: {
      id: true,
      name: true,
      declarations: {
        select: { insiderName: true, insiderFunction: true },
        where: { insiderFunction: { not: null } },
        take: 3,
      },
    },
  });

  if (rawInsiders.length === 0) return { resolved: 0, skipped: 0, errors: 0 };

  const items: InsiderItem[] = rawInsiders.map((ins) => ({
    id: ins.id,
    name: ins.declarations[0]?.insiderName ?? ins.name,
    fn:   ins.declarations[0]?.insiderFunction ?? "",
  }));

  // Split into batches
  const batches: InsiderItem[][] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    batches.push(items.slice(i, i + BATCH_SIZE));
  }

  const allResults: Array<{ id: string; g: string }> = [];
  let errors = 0;

  // Process with limited concurrency
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((b) => classifyBatch(b, apiKey))
    );
    for (const r of settled) {
      if (r.status === "fulfilled") allResults.push(...r.value);
      else { errors++; console.error("[gender-gpt] batch error:", r.reason); }
    }
  }

  // Update DB
  let resolved = 0;
  let skipped  = 0;

  await Promise.all(
    allResults.map(async ({ id, g }) => {
      if (g === "H" || g === "F") {
        await prisma.insider.update({
          where: { id },
          data: { gender: g === "H" ? "M" : "F" },
        });
        resolved++;
      } else {
        skipped++;
      }
    })
  );

  return { resolved, skipped, errors };
}

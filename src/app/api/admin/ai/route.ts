/**
 * Admin AI assistant · OpenAI chat with read-only DB tools.
 *
 *   POST /api/admin/ai
 *     body: {
 *       messages: [{ role: "user" | "assistant" | "system", content: string }],
 *       model?: string,
 *       temperature?: number
 *     }
 *   → { reply: string, toolCalls: Array<{ name, args, result }>, usage: {...} }
 *
 * The assistant can call tools (defined in src/lib/admin-ai-tools.ts) to pull
 * live data from the DB. All tools are READ-ONLY. The endpoint loops up to 4
 * tool rounds, then returns the final textual reply.
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getCurrentUser } from "@/lib/auth";
import { ADMIN_TOOLS_SCHEMA, runAdminTool } from "@/lib/admin-ai-tools";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_MODEL = "gpt-4o-mini";
const ALLOWED_MODELS = new Set([
  // GPT-4o family
  "gpt-4o-mini",
  "gpt-4o",
  // GPT-4.1 family
  "gpt-4.1",
  "gpt-4.1-mini",
  // o-series reasoning models
  "o1",
  "o3",
  "o4-mini",
  "gpt-4.1-mini",
  "gpt-5.2",
]);

const SYSTEM_PROMPT = `Tu es Sigma Copilote, l'assistant IA du back-office d'Insiders Trades Sigma.
Tu aides l'administrateur à :
  • comprendre l'état du système (déclarations AMF, scoring, backtests, users, portefeuilles) ;
  • diagnostiquer des anomalies (pipeline, emails, crons) ;
  • produire des résumés et recommandations opérationnelles.

Règles strictes :
  • Utilise toujours les outils fournis pour obtenir des données FRAÎCHES · ne jamais inventer de chiffres.
  • Si une question peut être répondue en appelant un outil, appelle-le.
  • Mentionne les noms de tables/outils quand c'est utile à l'admin.
  • Formate les réponses en Markdown (listes, titres, code inline).
  • Les montants en euros sont affichés avec un espace insécable comme séparateur de milliers (ex : "4 200 000 €").
  • Les scores vont de 0 à 100. Seuil reco achat ≥ 70. Retour T+90 attendu ≥ +4 %.
  • En cas d'échec d'outil (champ "error"), indique poliment qu'il y a un problème et suggère une alternative.
  • Tu n'écris jamais dans la base de données. Aucun outil destructif n'existe.
  • Ton ton est factuel, concis, direct, en français.`;

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY manquant côté serveur" },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    messages?: Array<{ role: string; content: string }>;
    model?: string;
    temperature?: number;
  };

  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  if (rawMessages.length === 0) {
    return NextResponse.json({ error: "messages[] est requis" }, { status: 400 });
  }

  const model =
    typeof body.model === "string" && ALLOWED_MODELS.has(body.model)
      ? body.model
      : DEFAULT_MODEL;
  const temperature =
    typeof body.temperature === "number" &&
    body.temperature >= 0 &&
    body.temperature <= 2
      ? body.temperature
      : 0.3;

  // Normalise & hard-cap history
  const historyCap = 40;
  const history = rawMessages
    .filter((m) => ["user", "assistant", "system"].includes(m.role))
    .slice(-historyCap)
    .map((m) => ({ role: m.role as "user" | "assistant" | "system", content: String(m.content ?? "").slice(0, 12_000) }));

  const openai = new OpenAI({ apiKey });

  // Message stack the model will work against. We always inject our system prompt first.
  type ApiMsg = {
    role: "system" | "user" | "assistant" | "tool";
    content?: string;
    tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
    tool_call_id?: string;
    name?: string;
  };

  const messages: ApiMsg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.filter((m) => m.role !== "system"),
  ];

  const toolLog: Array<{ name: string; args: unknown; result: unknown; ms: number }> = [];

  let finalReply = "";
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  const MAX_ROUNDS = 5;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let completion;
    try {
      // o-series reasoning models (o1, o3, o4-mini) do not support temperature.
      const isReasoningModel = /^o\d/i.test(model) || /^gpt-5/i.test(model);
      completion = await openai.chat.completions.create({
        model,
        messages: messages as never,
        tools: ADMIN_TOOLS_SCHEMA as never,
        tool_choice: "auto",
        ...(isReasoningModel ? {} : { temperature }),
      });
    } catch (err) {
      return NextResponse.json(
        {
          error: `OpenAI error: ${String(err instanceof Error ? err.message : err)}`,
          toolLog,
        },
        { status: 502 }
      );
    }

    if (completion.usage) {
      totalUsage = {
        prompt_tokens: totalUsage.prompt_tokens + (completion.usage.prompt_tokens ?? 0),
        completion_tokens: totalUsage.completion_tokens + (completion.usage.completion_tokens ?? 0),
        total_tokens: totalUsage.total_tokens + (completion.usage.total_tokens ?? 0),
      };
    }

    const msg = completion.choices[0]?.message;
    if (!msg) break;

    const toolCalls = msg.tool_calls ?? [];

    if (toolCalls.length > 0) {
      // Append the assistant message with tool_calls, then each tool_response.
      messages.push({
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: toolCalls as ApiMsg["tool_calls"],
      });

      for (const call of toolCalls) {
        if (call.type !== "function") continue;
        const name = call.function.name;
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch { args = {}; }
        const t0 = Date.now();
        const result = await runAdminTool(name, args);
        const ms = Date.now() - t0;
        toolLog.push({ name, args, result, ms });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name,
          content: JSON.stringify(result).slice(0, 30_000),
        });
      }
      continue; // next round
    }

    // No more tool calls · we have a final reply.
    finalReply = msg.content ?? "";
    break;
  }

  if (!finalReply) {
    finalReply =
      "Désolé, je n'ai pas réussi à produire une réponse exploitable. Réessaye avec une question plus précise ou change de modèle.";
  }

  return NextResponse.json({
    reply: finalReply,
    toolCalls: toolLog,
    usage: totalUsage,
    model,
  });
}

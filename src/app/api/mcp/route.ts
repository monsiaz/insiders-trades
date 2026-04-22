/**
 * MCP (Model Context Protocol) server endpoint.
 *
 * Implements JSON-RPC 2.0 with MCP protocol version 2024-11-05.
 * URL: POST /api/mcp
 *
 * Methods supported:
 *   - initialize   → handshake
 *   - initialized  → notification (HTTP 204)
 *   - tools/list   → catalog of 20 tools with inputSchema
 *   - tools/call   → execute a tool
 *   - ping         → heartbeat
 *
 * Auth: the caller passes their Insiders Trades API key via either
 *   - Authorization: Bearer <key> · preferred (HTTP headers)
 *   - X-Api-Key: <key> · alt header
 *   - ?apiKey=<key> · URL query (fallback for clients that can't set headers)
 *
 * Clients like Claude Desktop since 3.7 support headers via `type: "http"` config.
 * Simpler `type: "url"` configs must use the query-param form.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveApiKey, bumpKeyUsage } from "@/lib/api-key";
import { TOOLS, TOOL_BY_NAME } from "@/lib/mcp/tools";
import { executeTool } from "@/lib/mcp/execute";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = {
  name: "insiders-trades-sigma",
  version: "1.0.0",
};

// ── JSON-RPC error codes ─────────────────────────────────────────────────────
const RPC_ERROR = {
  PARSE_ERROR:       -32700,
  INVALID_REQUEST:   -32600,
  METHOD_NOT_FOUND:  -32601,
  INVALID_PARAMS:    -32602,
  INTERNAL_ERROR:    -32603,
  UNAUTHORIZED:      -32000, // JSON-RPC reserves -32000 to -32099 for server-defined
};

// ── CORS ─────────────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function jsonRpcError(id: string | number | null | undefined, code: number, message: string, data?: unknown) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } },
    { status: 200, headers: CORS_HEADERS } // JSON-RPC errors are 200 OK with error body
  );
}

function jsonRpcOk(id: string | number | null | undefined, result: unknown) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, result },
    { status: 200, headers: CORS_HEADERS }
  );
}

function extractApiKey(req: NextRequest, body?: Record<string, unknown>): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const xKey = req.headers.get("x-api-key");
  if (xKey) return xKey.trim();
  const url = new URL(req.url);
  const q = url.searchParams.get("apiKey") ?? url.searchParams.get("api_key");
  if (q) return q.trim();
  // Some clients pass auth inside the request _meta (non-standard, tolerant)
  const meta = body?._meta as Record<string, unknown> | undefined;
  if (meta && typeof meta.apiKey === "string") return meta.apiKey.trim();
  return null;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: JsonRpcRequest;
  try {
    body = (await req.json()) as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, RPC_ERROR.PARSE_ERROR, "Parse error · body must be valid JSON");
  }

  if (body?.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return jsonRpcError(body?.id ?? null, RPC_ERROR.INVALID_REQUEST, "Invalid JSON-RPC envelope (missing jsonrpc or method)");
  }

  const { id, method, params } = body;

  // ── Method: initialize (handshake · no auth required) ─────────────────────
  if (method === "initialize") {
    return jsonRpcOk(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: false },
      },
      serverInfo: SERVER_INFO,
      instructions:
        "Insiders Trades Sigma MCP. Pass your API key via Authorization: Bearer <key> header. " +
        "Tools cover French AMF insider declarations, signal scoring, backtests, and Yahoo fundamentals.",
    });
  }

  // ── Method: initialized (notification · HTTP 204) ─────────────────────────
  if (method === "initialized" || method === "notifications/initialized") {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  // ── Method: ping (heartbeat, no auth required) ────────────────────────────
  if (method === "ping") {
    return jsonRpcOk(id, {});
  }

  // Every method below requires a valid API key
  const apiKey = extractApiKey(req, params as Record<string, unknown>);
  if (!apiKey) {
    return jsonRpcError(
      id,
      RPC_ERROR.UNAUTHORIZED,
      "Clé API manquante. Ajoutez `Authorization: Bearer <key>` ou `?apiKey=<key>` à l'URL."
    );
  }
  const keyRec = await resolveApiKey(apiKey);
  if (!keyRec) {
    return jsonRpcError(
      id,
      RPC_ERROR.UNAUTHORIZED,
      "Clé API invalide, inconnue ou révoquée."
    );
  }

  // Fire-and-forget counter bump
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent") ?? null;
  void bumpKeyUsage(keyRec.id, keyRec.requestsToday, keyRec.todayResetAt, { ip, ua });

  // ── Method: tools/list ────────────────────────────────────────────────────
  if (method === "tools/list") {
    return jsonRpcOk(id, {
      tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
  }

  // ── Method: tools/call ────────────────────────────────────────────────────
  if (method === "tools/call") {
    const p = (params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
    const toolName = typeof p.name === "string" ? p.name : "";
    const args = (p.arguments ?? {}) as Record<string, unknown>;

    if (!toolName || !TOOL_BY_NAME.has(toolName)) {
      return jsonRpcError(
        id,
        RPC_ERROR.INVALID_PARAMS,
        `Unknown tool: '${toolName}'. Call 'tools/list' for the catalog.`
      );
    }

    try {
      const result = await executeTool(toolName, args, { keyId: keyRec.id, userId: keyRec.userId });
      return jsonRpcOk(id, {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: false,
      });
    } catch (err) {
      const msg = String(err instanceof Error ? err.message : err);
      return jsonRpcOk(id, {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: msg }, null, 2),
          },
        ],
        isError: true,
      });
    }
  }

  // Unknown method
  return jsonRpcError(id, RPC_ERROR.METHOD_NOT_FOUND, `Method not found: '${method}'`);
}

/**
 * GET returns a friendly welcome page explaining how to use the endpoint.
 * Useful when a user pastes the URL in a browser.
 */
export async function GET() {
  return NextResponse.json(
    {
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
      protocolVersion: PROTOCOL_VERSION,
      transport: "HTTP (JSON-RPC 2.0)",
      methods: ["initialize", "initialized", "tools/list", "tools/call", "ping"],
      toolsCount: TOOLS.length,
      authentication: {
        header: "Authorization: Bearer <YOUR_INSIDERS_TRADES_API_KEY>",
        alternative: "X-Api-Key: <YOUR_KEY>  or  ?apiKey=<YOUR_KEY>",
        createKeyAt: "https://insiders-trades-sigma.vercel.app/account/api-keys",
      },
      docs: "https://insiders-trades-sigma.vercel.app/docs/mcp",
      examples: {
        initialize: {
          request: {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "demo", version: "1.0" } },
          },
        },
        toolsList: { request: { jsonrpc: "2.0", id: 2, method: "tools/list" } },
        toolsCall: {
          request: {
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: "search_top_signals", arguments: { direction: "BUY", limit: 5 } },
          },
        },
      },
    },
    { headers: CORS_HEADERS }
  );
}

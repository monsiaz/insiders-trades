/**
 * End-to-end live test of the MCP server.
 *
 * 1. Login via /api/auth/login to grab session cookie
 * 2. POST /api/account/keys to create a fresh API key
 * 3. Call every MCP method: initialize, tools/list, tools/call (each of 20 tools), ping
 * 4. Report status + latency per tool
 * 5. Revoke the test key
 *
 * Usage:  node scripts/test-mcp.mjs
 */
import "dotenv/config";

const BASE = process.env.BASE ?? "https://insiders-trades-sigma.vercel.app";
const EMAIL = process.env.ADMIN_EMAIL ?? "simon.azoulay.pro@gmail.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Sigma2026!";
const MCP_URL = `${BASE}/api/mcp`;

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m", cyan: "\x1b[36m" };

let passed = 0, failed = 0;
function status(color, sym, name, httpStatus, detail, ms) {
  if (color === C.green) passed++; else failed++;
  const latency = ms != null ? `${C.dim}${ms.toString().padStart(5)}ms${C.reset}` : "          ";
  console.log(`  ${color}${sym}${C.reset} ${name.padEnd(44)} ${httpStatus.padEnd(8)} ${latency}  ${detail}`);
}

async function loginCookie() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    redirect: "manual",
  });
  if (r.status !== 200) throw new Error(`Login failed: HTTP ${r.status}`);
  const setCookie = r.headers.getSetCookie?.() ?? [r.headers.get("set-cookie") ?? ""];
  return setCookie.map((c) => c.split(";")[0]).join("; ");
}

async function createKey(cookie) {
  const r = await fetch(`${BASE}/api/account/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: `mcp-test-${Date.now()}` }),
  });
  if (!r.ok) throw new Error(`Key creation failed: HTTP ${r.status}`);
  const d = await r.json();
  return { key: d.key, id: d.record.id };
}

async function revokeKey(cookie, id) {
  await fetch(`${BASE}/api/account/keys?id=${id}`, { method: "DELETE", headers: { Cookie: cookie } });
}

async function rpc(key, method, params, expectUnauthorized = false) {
  const headers = { "Content-Type": "application/json" };
  if (key) headers["Authorization"] = `Bearer ${key}`;
  const t0 = Date.now();
  const r = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: Math.floor(Math.random() * 10000), method, ...(params ? { params } : {}) }),
  });
  const ms = Date.now() - t0;
  if (r.status === 204) return { ms, status: 204, body: null };
  const body = await r.json().catch(() => null);
  return { ms, status: r.status, body };
}

async function callTool(key, name, args = {}) {
  return rpc(key, "tools/call", { name, arguments: args });
}

async function main() {
  console.log(`${C.bold}${C.blue}╔══════════════════════════════════════════════════════════════════════════════╗`);
  console.log(`║  MCP Live Test — ${new Date().toISOString().padEnd(55)}  ║`);
  console.log(`║  ${MCP_URL.padEnd(77)} ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

  console.log(`${C.cyan}Preparing…${C.reset}`);
  const cookie = await loginCookie();
  const { key, id: keyId } = await createKey(cookie);
  console.log(`  Got test API key : ${key.slice(0, 22)}…\n`);

  try {
    console.log(`${C.cyan}1. Protocol methods (no auth required)${C.reset}`);
    {
      // initialize (no auth)
      const r = await rpc(null, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "mcp-test", version: "1.0" },
      });
      const ok = r.status === 200 && r.body?.result?.protocolVersion === "2024-11-05";
      status(ok ? C.green : C.red, ok ? "✓" : "✗", "initialize", `HTTP ${r.status}`,
        ok ? `protocol ${r.body.result.protocolVersion} · ${r.body.result.serverInfo.name}` : "failed", r.ms);
    }
    {
      // ping (no auth)
      const r = await rpc(null, "ping");
      const ok = r.status === 200 && r.body?.result;
      status(ok ? C.green : C.red, ok ? "✓" : "✗", "ping", `HTTP ${r.status}`, "heartbeat", r.ms);
    }
    {
      // initialized notification (no auth) → 204
      const r = await rpc(null, "initialized");
      const ok = r.status === 204;
      status(ok ? C.green : C.red, ok ? "✓" : "✗", "initialized (notification)", `HTTP ${r.status}`, "204 expected", r.ms);
    }

    console.log(`\n${C.cyan}2. Auth negative paths${C.reset}`);
    {
      const r = await rpc(null, "tools/list");
      const ok = r.body?.error?.code === -32000;
      status(ok ? C.green : C.red, ok ? "✓" : "✗", "tools/list without auth", `HTTP ${r.status}`,
        ok ? "-32000 Unauthorized" : `got code ${r.body?.error?.code}`, r.ms);
    }
    {
      const r = await rpc("sit_live_invalid_key_xxx", "tools/list");
      const ok = r.body?.error?.code === -32000;
      status(ok ? C.green : C.red, ok ? "✓" : "✗", "tools/list with bad key", `HTTP ${r.status}`,
        ok ? "-32000 Unauthorized" : `got code ${r.body?.error?.code}`, r.ms);
    }

    console.log(`\n${C.cyan}3. tools/list (auth required)${C.reset}`);
    let toolsFromList = [];
    {
      const r = await rpc(key, "tools/list");
      const tools = r.body?.result?.tools ?? [];
      toolsFromList = tools.map((t) => t.name);
      const ok = tools.length >= 20;
      status(ok ? C.green : C.red, ok ? "✓" : "✗", "tools/list", `HTTP ${r.status}`,
        `${tools.length} tools returned`, r.ms);
    }

    console.log(`\n${C.cyan}4. Alternative auth formats${C.reset}`);
    {
      // X-Api-Key header
      const r = await fetch(MCP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": key },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      const d = await r.json();
      const ok = Array.isArray(d?.result?.tools);
      status(ok ? C.green : C.red, ok ? "✓" : "✗", "auth via X-Api-Key header", `HTTP ${r.status}`,
        ok ? `${d.result.tools.length} tools` : "failed", 0);
    }
    {
      // ?apiKey= query param
      const r = await fetch(`${MCP_URL}?apiKey=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      const d = await r.json();
      const ok = Array.isArray(d?.result?.tools);
      status(ok ? C.green : C.red, ok ? "✓" : "✗", "auth via ?apiKey= query", `HTTP ${r.status}`,
        ok ? `${d.result.tools.length} tools` : "failed", 0);
    }

    console.log(`\n${C.cyan}5. tools/call — all 20 tools${C.reset}`);

    // Tool invocations — each with sensible args
    const tests = [
      { name: "search_companies",          args: { query: "bouygues", limit: 3 } },
      { name: "search_insiders",           args: { query: "arnault", limit: 3 } },
      { name: "search_declarations",       args: { limit: 3, minScore: 40, direction: "BUY" } },
      { name: "search_global",             args: { query: "total" } },
      { name: "search_top_signals",        args: { direction: "BUY", minScore: 30, limit: 3 } },
      { name: "get_site_stats",            args: {} },
      { name: "get_system_health",         args: {} },
      { name: "get_backtest_stats",        args: { direction: "BUY" } },
      { name: "get_account_usage",         args: {} },
      { name: "find_clustered_trades",     args: { lookbackDays: 30, minInsiders: 2, limit: 3 } },
    ];

    // Dynamic tests — we need real slugs first
    const coSearch = await callTool(key, "search_companies", { query: "bouygues", limit: 1 });
    const slugCompany = JSON.parse(coSearch.body?.result?.content?.[0]?.text ?? "{}")?.results?.[0]?.slug;
    const inSearch = await callTool(key, "search_insiders", { query: "", limit: 1 });
    let slugInsider = null;
    try {
      const parsed = JSON.parse(inSearch.body?.result?.content?.[0]?.text ?? "{}");
      slugInsider = parsed?.results?.[0]?.slug;
    } catch {}
    if (!slugInsider) {
      const alt = await callTool(key, "search_declarations", { limit: 1 });
      const p = JSON.parse(alt.body?.result?.content?.[0]?.text ?? "{}");
      slugInsider = p?.results?.[0]?.insider?.name; // fallback — might not be a slug
    }

    // Find an amfId
    const declSearch = await callTool(key, "search_declarations", { limit: 1 });
    const amfId = JSON.parse(declSearch.body?.result?.content?.[0]?.text ?? "{}")?.results?.[0]?.amfId;
    // Find an ISIN for watch_isins
    const isin = JSON.parse(declSearch.body?.result?.content?.[0]?.text ?? "{}")?.results?.[0]?.transaction?.isin;

    if (slugCompany) {
      tests.push({ name: "get_company",                 args: { slug: slugCompany } });
      tests.push({ name: "get_company_declarations",    args: { slug: slugCompany, limit: 3 } });
      tests.push({ name: "get_company_full_profile",    args: { slug: slugCompany } });
    }
    if (amfId) {
      tests.push({ name: "get_declaration",             args: { amfId } });
      tests.push({ name: "analyze_declaration",         args: { amfId } });
    }
    if (isin) {
      tests.push({ name: "watch_isins",                 args: { isins: [isin], lookbackDays: 30 } });
    }
    // Insider-specific tools need a real insider slug
    const insiderSearch2 = await callTool(key, "search_insiders", { query: "Ber", limit: 1 });
    const realInsiderSlug = JSON.parse(insiderSearch2.body?.result?.content?.[0]?.text ?? "{}")?.results?.[0]?.slug;
    if (realInsiderSlug) {
      tests.push({ name: "get_insider",                    args: { slug: realInsiderSlug } });
      tests.push({ name: "get_insider_declarations",       args: { slug: realInsiderSlug, limit: 3 } });
      tests.push({ name: "get_insider_activity_summary",  args: { slug: realInsiderSlug } });
    }
    // Compare needs ≥ 2 slugs
    const coSearch2 = await callTool(key, "search_companies", { query: "hermes", limit: 1 });
    const slug2 = JSON.parse(coSearch2.body?.result?.content?.[0]?.text ?? "{}")?.results?.[0]?.slug;
    if (slugCompany && slug2) {
      tests.push({ name: "compare_companies",           args: { slugs: [slugCompany, slug2] } });
    }

    // Run all tests
    for (const t of tests) {
      const r = await callTool(key, t.name, t.args);
      const result = r.body?.result;
      const ok = r.status === 200 && result && !result.isError;
      const text = result?.content?.[0]?.text ?? "";
      const parsed = text ? JSON.parse(text) : {};
      const preview = parsed.error
        ? `error: ${parsed.error}`
        : parsed.count != null  ? `${parsed.count} items`
        : parsed.results?.length != null ? `${parsed.results.length} items`
        : parsed.meta?.latencyMs != null ? `ok · latencyMs=${parsed.meta.latencyMs}`
        : "ok";
      status(ok ? C.green : C.red, ok ? "✓" : "✗",
        `${t.name}(${shortArgs(t.args)})`, `HTTP ${r.status}`, preview, r.ms);
    }

    // Test an unknown tool
    console.log(`\n${C.cyan}6. Negative: unknown tool${C.reset}`);
    {
      const r = await callTool(key, "does_not_exist", {});
      const ok = r.body?.error?.code === -32602;
      status(ok ? C.green : C.red, ok ? "✓" : "✗", "tools/call unknown_tool", `HTTP ${r.status}`,
        ok ? "-32602 Invalid params" : `got code ${r.body?.error?.code}`, r.ms);
    }

    // Test unknown method
    {
      const r = await rpc(key, "tools/nope", {});
      const ok = r.body?.error?.code === -32601;
      status(ok ? C.green : C.red, ok ? "✓" : "✗", "unknown method", `HTTP ${r.status}`,
        ok ? "-32601 Method not found" : `got code ${r.body?.error?.code}`, r.ms);
    }
  } finally {
    console.log(`\n${C.cyan}Cleanup…${C.reset}`);
    await revokeKey(cookie, keyId);
    console.log(`  Test key revoked.\n`);
  }

  const totalColor = failed === 0 ? C.green : C.yellow;
  console.log(`${C.bold}${C.blue}╔══════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`║  ${totalColor}${passed} passed${C.reset}  ${failed > 0 ? C.red : C.dim}${failed} failed${C.reset}  of ${passed + failed} tests${" ".repeat(Math.max(0, 60 - String(passed + failed).length))}║`);
  console.log(`${C.bold}${C.blue}╚══════════════════════════════════════════════════════════════════════════════╝${C.reset}`);
  process.exit(failed === 0 ? 0 : 1);
}

function shortArgs(a) {
  if (!a || Object.keys(a).length === 0) return "";
  return Object.entries(a)
    .slice(0, 2)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v.slice(0, 20) : JSON.stringify(v)}`)
    .join(",");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });

/**
 * End-to-end live test of the /api/v1/* REST API.
 *
 *   1. Log in via /api/auth/login as the admin user → grab the session cookie
 *   2. POST /api/account/keys with a name → receive a plaintext API key
 *   3. Use that key to hit every documented endpoint
 *   4. Print per-endpoint status + latency + payload preview
 *   5. Revoke the key at the end
 *
 * Usage:
 *   BASE=https://insiders-trades-sigma.vercel.app \
 *   ADMIN_EMAIL=simon.azoulay.pro@gmail.com \
 *   ADMIN_PASSWORD=Sigma2026! \
 *   node scripts/test-api.mjs
 */
import "dotenv/config";

const BASE = process.env.BASE ?? "https://insiders-trades-sigma.vercel.app";
const EMAIL = process.env.ADMIN_EMAIL ?? "simon.azoulay.pro@gmail.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "Sigma2026!";

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  blue:   "\x1b[34m",
  cyan:   "\x1b[36m",
};

let totalTests = 0;
let passed = 0;
let failed = 0;

function log(label, msg, color = C.reset) {
  const pad = label.padEnd(38);
  console.log(`${color}${pad}${C.reset} ${msg}`);
}

function status(color, symbol, name, statusStr, msg, ms) {
  totalTests++;
  if (color === C.green) passed++;
  else failed++;
  const latencyStr = ms ? `${C.dim}${ms.toString().padStart(4)}ms${C.reset}` : "         ";
  console.log(`  ${color}${symbol}${C.reset} ${name.padEnd(48)} ${statusStr.padEnd(8)} ${latencyStr}  ${msg}`);
}

async function loginAndGetCookie() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    redirect: "manual",
  });
  if (res.status !== 200) throw new Error(`Login failed: HTTP ${res.status}`);
  const setCookie = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  if (!cookie.includes("it_session")) throw new Error("No session cookie returned");
  return cookie;
}

async function createApiKey(cookie, name) {
  const res = await fetch(`${BASE}/api/account/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Key creation failed: HTTP ${res.status} — ${body}`);
  }
  const d = await res.json();
  return { key: d.key, id: d.record.id };
}

async function revokeKey(cookie, id) {
  await fetch(`${BASE}/api/account/keys?id=${id}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
}

async function hit(name, url, key, opts = {}) {
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, ...(opts.headers ?? {}) },
      method: opts.method ?? "GET",
    });
  } catch (e) {
    status(C.red, "✗", name, "NETWORK", `${e?.message ?? e}`);
    return null;
  }
  const ms = Date.now() - t0;
  const statusStr = `HTTP ${res.status}`;
  const data = res.headers.get("content-type")?.includes("json") ? await res.json().catch(() => null) : null;
  const expected = opts.expect ?? 200;

  if (res.status !== expected) {
    status(C.red, "✗", name, statusStr, `expected ${expected} — ${JSON.stringify(data).slice(0, 80)}`, ms);
    return null;
  }

  // Per-endpoint sanity checks
  const validator = opts.validate ?? (() => true);
  const validationError = validator(data);
  if (validationError && validationError !== true) {
    status(C.yellow, "!", name, statusStr, `validation: ${validationError}`, ms);
    return data;
  }

  const preview = opts.preview ? opts.preview(data) : "";
  status(C.green, "✓", name, statusStr, preview, ms);
  return data;
}

async function main() {
  console.log(`${C.bold}${C.blue}╔══════════════════════════════════════════════════════════════════════════════╗`);
  console.log(`║  API v1 Live Test — ${new Date().toISOString().padEnd(52)} ║`);
  console.log(`║  ${BASE.padEnd(77)} ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

  // 1. Login
  log("1. Authenticating…", "", C.cyan);
  const cookie = await loginAndGetCookie();
  log("   Session cookie:", `${cookie.slice(0, 40)}…`, C.dim);

  // 2. Create key
  log("\n2. Creating API key…", "", C.cyan);
  const { key, id: keyId } = await createApiKey(cookie, `test-${Date.now()}`);
  log("   Plaintext key:", `${key.slice(0, 20)}…`, C.dim);

  try {
    // 3. Hit every endpoint
    console.log(`\n${C.cyan}3. Hitting endpoints…${C.reset}\n`);

    // Auth negative paths first — these should fail
    await hit(
      "negative: no auth header",
      `${BASE}/api/v1/me`,
      "",
      { expect: 401, preview: (d) => `code=${d?.error?.code ?? "?"}` }
    );
    await hit(
      "negative: wrong key shape",
      `${BASE}/api/v1/me`,
      "not-a-real-key",
      { expect: 401, preview: (d) => `code=${d?.error?.code ?? "?"}` }
    );

    // Positive: all v1 endpoints
    await hit("GET  /api/v1/me",         `${BASE}/api/v1/me`,        key, {
      preview: (d) => `${d.user?.email ?? "?"} · ${d.meta?.latencyMs ?? "?"}ms`,
      validate: (d) => d?.user?.email ? true : "no user in response",
    });
    await hit("GET  /api/v1/health",     `${BASE}/api/v1/health`,    key, {
      preview: (d) => `db ${d.database?.latencyMs ?? "?"}ms · last pub ${d.lastAmfPublicationAt?.slice(0, 10) ?? "?"}`,
      validate: (d) => d?.database?.reachable ? true : "db unreachable",
    });
    await hit("GET  /api/v1/stats",      `${BASE}/api/v1/stats`,     key, {
      preview: (d) => `${d.declarations?.typeDirigeants ?? "?"} decls · ${d.companies?.total ?? "?"} cos`,
      validate: (d) => d?.declarations?.total > 0 ? true : "empty declarations",
    });
    await hit("GET  /api/v1/companies?limit=3", `${BASE}/api/v1/companies?limit=3`, key, {
      preview: (d) => `total=${d.total} · first=${d.items?.[0]?.name ?? "?"}`,
      validate: (d) => Array.isArray(d.items) && d.total > 0 ? true : "no items",
    });

    // Pick a company slug from the listing
    const co = await hit("GET  /api/v1/companies?q=bouygues", `${BASE}/api/v1/companies?q=bouygues&limit=1`, key, {
      preview: (d) => `${d.items?.[0]?.name ?? "?"}`,
    });
    const companySlug = co?.items?.[0]?.slug ?? "bouygues";
    await hit(
      `GET  /api/v1/companies/${companySlug}`,
      `${BASE}/api/v1/companies/${companySlug}`,
      key,
      {
        preview: (d) => `mcap=${(d.marketCap ?? 0) / 1e9 || "?"}B · decls=${d.declarationsCount}`,
        validate: (d) => d?.name ? true : "no name",
      }
    );
    await hit(
      `GET  /api/v1/companies/${companySlug}/declarations`,
      `${BASE}/api/v1/companies/${companySlug}/declarations?limit=3`,
      key,
      {
        preview: (d) => `total=${d.total} · first amfId=${d.items?.[0]?.amfId ?? "?"}`,
      }
    );
    await hit(
      `GET  /api/v1/companies/does-not-exist`,
      `${BASE}/api/v1/companies/does-not-exist-9999`,
      key,
      { expect: 404, preview: (d) => `code=${d?.error?.code ?? "?"}` }
    );

    // Insiders
    const insiders = await hit("GET  /api/v1/insiders?limit=3",   `${BASE}/api/v1/insiders?limit=3`, key, {
      preview: (d) => `total=${d.total}`,
    });
    const insiderSlug = insiders?.items?.[0]?.slug;
    if (insiderSlug) {
      await hit(`GET  /api/v1/insiders/${insiderSlug}`, `${BASE}/api/v1/insiders/${insiderSlug}`, key, {
        preview: (d) => `${d.name} · ${d.declarationsCount} decls`,
      });
      await hit(
        `GET  /api/v1/insiders/${insiderSlug}/declarations`,
        `${BASE}/api/v1/insiders/${insiderSlug}/declarations?limit=3`,
        key,
        { preview: (d) => `total=${d.total}` }
      );
    }

    // Declarations (listing + detail)
    const decls = await hit(
      "GET  /api/v1/declarations?limit=3&minScore=40",
      `${BASE}/api/v1/declarations?limit=3&minScore=40&sort=signalScore&order=desc`,
      key,
      {
        preview: (d) => `total=${d.total} · top score=${d.items?.[0]?.signal?.score ?? "?"}`,
      }
    );
    const amfId = decls?.items?.[0]?.amfId;
    if (amfId) {
      await hit(`GET  /api/v1/declarations/${amfId}`, `${BASE}/api/v1/declarations/${amfId}`, key, {
        preview: (d) => `${d.company?.name} · ${d.insider?.name ?? "?"} · score=${d.signal?.score ?? "?"}`,
        validate: (d) => d?.amfId ? true : "no amfId",
      });
    }

    // Signals
    await hit(
      "GET  /api/v1/signals?direction=BUY",
      `${BASE}/api/v1/signals?direction=BUY&minScore=30&limit=5`,
      key,
      {
        preview: (d) => `${d.count} BUY signals · top=${d.items?.[0]?.company?.name ?? "?"}`,
      }
    );
    await hit(
      "GET  /api/v1/signals?direction=SELL",
      `${BASE}/api/v1/signals?direction=SELL&minScore=30&limit=5`,
      key,
      {
        preview: (d) => `${d.count} SELL signals`,
      }
    );

    // Backtest
    await hit("GET  /api/v1/backtest",            `${BASE}/api/v1/backtest`, key, {
      preview: (d) => `total=${d.total} · T+90 moyenne=${d.averageReturnsPct?.T90?.toFixed(2) ?? "?"}%`,
    });
    await hit("GET  /api/v1/backtest?direction=BUY", `${BASE}/api/v1/backtest?direction=BUY`, key, {
      preview: (d) => `BUYs=${d.total} · win90=${((d.winRates90d?.BUY ?? 0) * 100).toFixed(1)}%`,
    });

    // Search
    await hit("GET  /api/v1/search?q=lvmh", `${BASE}/api/v1/search?q=lvmh`, key, {
      preview: (d) => `${d.companies?.length ?? 0} cos · ${d.insiders?.length ?? 0} insiders`,
    });

    // OpenAPI spec
    await hit("GET  /api/openapi.json (public)", `${BASE}/api/openapi.json`, "", {
      preview: (d) => `${Object.keys(d.paths ?? {}).length} paths documented`,
      validate: (d) => d?.openapi ? true : "no openapi field",
    });
    // Docs page
    const docsT0 = Date.now();
    const docsRes = await fetch(`${BASE}/api/docs`);
    const docsMs = Date.now() - docsT0;
    const docsOk = docsRes.ok;
    status(docsOk ? C.green : C.red, docsOk ? "✓" : "✗", "GET  /api/docs (public)", `HTTP ${docsRes.status}`, docsOk ? "Swagger UI served" : "failed", docsMs);

    // Second /me call to verify counter increment
    const me2 = await hit("GET  /api/v1/me (2nd call)", `${BASE}/api/v1/me`, key, {
      preview: (d) => `totalRequests now ${d.key?.totalRequests}`,
    });
    if (me2?.key?.totalRequests > 1) {
      status(C.green, "✓", "usage counter increment", "", `from 1 → ${me2.key.totalRequests}`, 0);
    } else {
      status(C.yellow, "!", "usage counter increment", "", `didn't increment properly`, 0);
    }
  } finally {
    // 4. Revoke the key so we don't leave test keys lying around
    console.log(`\n${C.cyan}4. Cleaning up…${C.reset}`);
    await revokeKey(cookie, keyId);
    log("   Test key revoked:", keyId, C.dim);

    // 5. Verify revoked key is rejected
    const t0 = Date.now();
    const r = await fetch(`${BASE}/api/v1/me`, { headers: { Authorization: `Bearer ${key}` } });
    const ms = Date.now() - t0;
    if (r.status === 401) {
      status(C.green, "✓", "revoked key is rejected", `HTTP ${r.status}`, "OK", ms);
    } else {
      status(C.red, "✗", "revoked key is rejected", `HTTP ${r.status}`, "expected 401", ms);
    }
  }

  // Summary
  console.log(`\n${C.bold}${C.blue}╔══════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
  const passedColor = failed === 0 ? C.green : C.yellow;
  const line = `  ${passedColor}${passed} passed${C.reset}  ${failed > 0 ? C.red : C.dim}${failed} failed${C.reset}  of ${totalTests} tests`;
  console.log(`║${line.padEnd(100)}║`);
  console.log(`${C.bold}${C.blue}╚══════════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });

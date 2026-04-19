/**
 * Overnight enrichment loop:
 * 1. Reparse unparsed/incomplete declarations (PDF → trade details)
 * 2. Enrich market caps / financials for companies
 * 3. Score signals
 */
const BASE = "https://insiders-trades-sigma.vercel.app";
const SECRET = process.env.CRON_SECRET || "insider-trades-cron-secret";

function now() {
  return new Date().toLocaleTimeString("fr-FR");
}

function elapsed(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h${String(m).padStart(2, "0")}m`;
}

async function apiCall(path, method = "GET", body = null) {
  try {
    const opts = {
      method,
      headers: {
        Authorization: `Bearer ${SECRET}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(290000),
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

async function getStats() {
  const r = await apiCall("/api/reparse?mode=stats");
  if (r.error) return null;
  return r;
}

async function main() {
  const startTime = Date.now();
  console.log(`🚀 Overnight enrichment started at ${now()}`);
  console.log(`   Target: ${BASE}\n`);

  let round = 0;

  while (true) {
    round++;
    const roundElapsed = elapsed(Date.now() - startTime);
    console.log(`⚙️  [${roundElapsed}] Round ${round} — processing...`);

    // Run all 3 reparse modes in parallel
    const [unparsed, missingIsin, missingAmount] = await Promise.all([
      apiCall("/api/reparse", "POST", { mode: "unparsed", limit: 100 }),
      apiCall("/api/reparse", "POST", { mode: "missing-isin", limit: 100 }),
      apiCall("/api/reparse", "POST", { mode: "missing-amount", limit: 100 }),
    ]);

    const improved =
      (unparsed.improved ?? 0) +
      (missingIsin.improved ?? 0) +
      (missingAmount.improved ?? 0);
    const errors =
      (unparsed.errors ?? 0) + (missingIsin.errors ?? 0) + (missingAmount.errors ?? 0);
    console.log(`   Reparse: +${improved} improved, ${errors} errors`);

    // Enrich financials (companies without market cap)
    const enrich = await apiCall(`/api/enrich-mcap?limit=50`);
    if (enrich.enriched != null) {
      console.log(`   Enrich: ${enrich.enriched} companies enriched`);
    }

    // Score signals
    const score = await apiCall("/api/score-signals");
    if (score.scored != null) {
      console.log(`   Scores: ${score.scored} declarations scored`);
    }

    // Stats every 5 rounds
    if (round % 5 === 0) {
      const stats = await getStats();
      if (stats) {
        console.log(`\n📊 [${roundElapsed}] Dataset status:`);
        console.log(`   Total: ${stats.total} | Parsed: ${stats.parsed} (${((stats.parsed / stats.total) * 100).toFixed(1)}%)`);
        console.log(
          `   ISIN: ${((stats.withIsin / stats.total) * 100).toFixed(1)}% | Amount: ${((stats.withAmount / stats.total) * 100).toFixed(1)}%\n`
        );
      }
    }

    // Check if all parsed — if nothing improved in 3 consecutive rounds, slow down
    if (improved === 0 && errors === 0) {
      console.log(`   Nothing to process, waiting 5min...`);
      await new Promise((r) => setTimeout(r, 300000));
    } else {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

main().catch(console.error);

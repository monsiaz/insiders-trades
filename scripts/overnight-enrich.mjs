/**
 * Overnight enrichment script — runs indefinitely until Ctrl+C
 * Alternates between:
 *   1. Reparse (missing ISIN, unparsed, missing amount)
 *   2. Financial enrichment via Vercel cron
 *   3. Re-score signals
 *
 * Run: node scripts/overnight-enrich.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '../.env');

// Parse .env
const env = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)\s*=\s*"?(.+?)"?\s*$/);
  if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}

const SECRET = env.CRON_SECRET;
const BASE = 'https://insiders-trades-sigma.vercel.app';

let totalProcessed = 0;
let totalImproved = 0;
let round = 0;
const startTime = Date.now();

function elapsed() {
  const s = Math.floor((Date.now() - startTime) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${m.toString().padStart(2,'0')}m`;
}

async function post(path, body = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SECRET}`,
        'x-cron-secret': SECRET,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(290000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch (e) {
    return null;
  }
}

async function getStats() {
  try {
    const res = await fetch(`${BASE}/api/reparse`, {
      headers: { 'Authorization': `Bearer ${SECRET}` },
      signal: AbortSignal.timeout(10000),
    });
    return res.json();
  } catch { return null; }
}

async function printStats() {
  const s = await getStats();
  if (!s) return;
  console.log(`\n📊 [${elapsed()}] Dataset status:`);
  console.log(`   Total: ${s.total} | Parsed: ${s.parsed} (${s.coverage.parsed})`);
  console.log(`   ISIN: ${s.coverage.withIsin} | Amount: ${s.coverage.withAmount}`);
  console.log(`   Missing ISIN: ${s.missingIsin} | Unparsed: ${s.unparsed} | No amount: ${s.missingAmount}`);
}

async function runReparseBatch(mode) {
  const r = await post('/api/reparse', { mode, limit: 100 });
  if (!r) return { processed: 0, improved: 0 };
  totalProcessed += r.processed || 0;
  totalImproved += r.improved || 0;
  return r;
}

async function runFinancialEnrich() {
  const r = await post('/api/enrich-mcap', { limit: 50 });
  if (r) console.log(`   💰 Financial enrich: ${r.enriched ?? r.updated ?? '?'} companies updated`);
}

async function runScoring() {
  const r = await post('/api/score-signals', { force: false });
  if (r?.ok) console.log(`   📈 Signals scored`);
}

// Main loop
console.log(`🚀 Overnight enrichment started at ${new Date().toLocaleTimeString()}`);
console.log(`   Target: ${BASE}`);
console.log(`   Press Ctrl+C to stop\n`);

await printStats();

while (true) {
  round++;
  const now = new Date().toLocaleTimeString();
  process.stdout.write(`\r⚙️  [${elapsed()}] Round ${round} — processing...`);

  // Batch 1: Parse unparsed PDFs
  const r1 = await runReparseBatch('unparsed');
  
  // Batch 2: Fix missing ISIN
  const r2 = await runReparseBatch('missing-isin');
  
  // Batch 3: Fix missing amount
  const r3 = await runReparseBatch('missing-amount');

  const totalThisRound = (r1.processed || 0) + (r2.processed || 0) + (r3.processed || 0);
  process.stdout.write(`\r✅ [${elapsed()}] Round ${round} — ${totalThisRound} processed (total: ${totalProcessed})\n`);

  // Every 5 rounds: print stats + run financial enrichment
  if (round % 5 === 0) {
    await printStats();
    await runFinancialEnrich();
    await runScoring();
  }

  // If nothing to process, slow down and just maintain
  if (totalThisRound === 0) {
    console.log(`   ⏸️  Nothing to parse — sleeping 10 minutes then checking again...`);
    await new Promise(r => setTimeout(r, 10 * 60 * 1000));
    // Run financial enrichment instead
    await runFinancialEnrich();
    await runScoring();
    await printStats();
  } else {
    // Small delay between rounds
    await new Promise(r => setTimeout(r, 3000));
  }
}

#!/usr/bin/env node
/**
 * translate-i18n.mjs
 *
 * Reads src/lib/i18n/dictionaries/fr.json (source of truth),
 * sends every key to GPT-5.4-mini in parallel batches (≤50 concurrent),
 * writes src/lib/i18n/dictionaries/en.json.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node scripts/translate-i18n.mjs
 *   # or pass inline:
 *   node scripts/translate-i18n.mjs --key sk-...
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const FR_PATH = path.join(ROOT, "src/lib/i18n/dictionaries/fr.json");
const EN_PATH = path.join(ROOT, "src/lib/i18n/dictionaries/en.json");

const CONCURRENCY = 50;
const MODEL = "gpt-4o-mini"; // fallback if gpt-5.4-mini is unavailable
const PREFERRED_MODEL = "gpt-5.4-mini";

// ── Read API key ─────────────────────────────────────────────────────────────
const keyArg = process.argv.find((a) => a.startsWith("--key="))?.split("=")[1];
const OPENAI_KEY = keyArg ?? process.env.OPENAI_API_KEY ?? "";
if (!OPENAI_KEY) {
  console.error("✗ No OpenAI API key. Set OPENAI_API_KEY or pass --key=sk-...");
  process.exit(1);
}

// ── Load source ──────────────────────────────────────────────────────────────
const fr = JSON.parse(readFileSync(FR_PATH, "utf8"));

// ── Flatten nested JSON into dot-notation keys ───────────────────────────────
function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

// ── Unflatten dot-notation keys back to nested object ───────────────────────
function unflatten(flat) {
  const out = {};
  for (const [key, val] of Object.entries(flat)) {
    const parts = key.split(".");
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
  }
  return out;
}

const flat = flatten(fr);
const entries = Object.entries(flat);
console.log(`▶ ${entries.length} keys to translate (${CONCURRENCY} concurrent workers)`);

// ── Try preferred model, fallback to stable ──────────────────────────────────
async function detectModel() {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: PREFERRED_MODEL,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
    });
    if (res.ok) return PREFERRED_MODEL;
  } catch {}
  return MODEL;
}

// ── Translate a batch of {key, fr_text} pairs ────────────────────────────────
async function translateBatch(model, batch) {
  const payload = batch.map(([k, v]) => ({ key: k, fr: v }));
  const prompt = `You are a professional financial translator specializing in fintech/investing platforms.
Translate the following French UI strings to English. Preserve any {{variable}} placeholders, HTML entities, and punctuation exactly as-is.
Return ONLY a valid JSON object with key "translations" containing an array: {"translations":[{"key":"...","en":"..."},...]}

Input:
${JSON.stringify(payload, null, 2)}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GPT error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const raw = data.choices[0].message.content;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON: ${raw.slice(0, 200)}`);
  }

  const arr = parsed.translations ?? parsed.results ?? (Array.isArray(parsed) ? parsed : null);
  if (!Array.isArray(arr)) throw new Error(`Unexpected shape: ${JSON.stringify(parsed).slice(0, 200)}`);
  return arr;
}

// ── Run with concurrency limit ───────────────────────────────────────────────
async function runPool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const model = await detectModel();
  console.log(`▶ Using model: ${model}`);

  const BATCH_SIZE = 20; // keys per GPT call
  const batches = [];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    batches.push(entries.slice(i, i + BATCH_SIZE));
  }

  console.log(`▶ ${batches.length} batches of ≤${BATCH_SIZE} keys`);

  const enFlat = {};
  let done = 0;

  const tasks = batches.map((batch, batchIdx) => async () => {
    let retries = 3;
    while (retries-- > 0) {
      try {
        const translated = await translateBatch(model, batch);
        for (const item of translated) {
          if (item.key && item.en != null) enFlat[item.key] = item.en;
        }
        done++;
        process.stdout.write(`\r  Progress: ${done}/${batches.length} batches`);
        return;
      } catch (err) {
        if (retries === 0) {
          console.error(`\n✗ Batch ${batchIdx} failed: ${err.message}`);
          // Fallback: keep French for failed keys
          for (const [key, val] of batch) enFlat[key] = val;
        } else {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  });

  await runPool(tasks, CONCURRENCY);
  console.log("\n▶ All batches done. Building en.json...");

  // Fill any missing keys with French fallback
  for (const [key, val] of entries) {
    if (!(key in enFlat)) enFlat[key] = val;
  }

  const en = unflatten(enFlat);
  writeFileSync(EN_PATH, JSON.stringify(en, null, 2) + "\n", "utf8");
  console.log(`✓ Written ${EN_PATH}`);
  console.log(`  Keys translated: ${Object.keys(enFlat).length}/${entries.length}`);
})();

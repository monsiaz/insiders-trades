/**
 * fetch-logos-v3.mjs — Robust logo fetcher using Yahoo Finance + OG scraping
 *
 * Strategy:
 *   1. Yahoo Finance API → get official website URL
 *   2. Scrape website for OG image / header logo
 *   3. OpenAI gpt-4.1 Responses API → web search for logo URL (fallback)
 *
 * Usage:
 *   node scripts/fetch-logos-v3.mjs [--concurrency=10] [--limit=N]
 */

import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import { createRequire } from "module";
import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Load env ──────────────────────────────────────────────────────────────────
function loadEnv(f) {
  try {
    readFileSync(f, "utf8").split("\n").forEach(l => {
      const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    });
  } catch {}
}
loadEnv(path.join(__dirname, "../.env.local"));
loadEnv(path.join(__dirname, "../.env"));
loadEnv("/Users/simonazoulay/SurfCampSenegal/.env");

const args = process.argv.slice(2);
const LIMIT       = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "9999");
const CONCURRENCY = parseInt(args.find(a => a.startsWith("--concurrency="))?.split("=")[1] ?? "10");
const DRY_RUN     = args.includes("--dry-run");
const VERBOSE     = args.includes("--verbose");

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN ?? "";

if (!OPENAI_KEY) console.warn("⚠️  No OPENAI_API_KEY — OpenAI fallback disabled");
else console.log("✅ OpenAI:", OPENAI_KEY.slice(0, 8) + "...");
if (!BLOB_TOKEN && !DRY_RUN) { console.error("❌ No BLOB_READ_WRITE_TOKEN"); process.exit(1); }

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";
const prisma = new PrismaClient({ log: ["error"] });

// ── Known domains ─────────────────────────────────────────────────────────────
const KNOWN_WEBSITES = {
  // Already processed but kept for reference
  "TOTALENERGIES SE":               "https://totalenergies.com",
  "RENAULT":                         "https://www.renaultgroup.com",
  "TELEVISION FRANCAISE 1":          "https://www.tf1.fr",
  // Top missing
  "LVMH MOET HENNESSY-LOUIS VUITTON":"https://www.lvmh.com",
  "LVMH":                            "https://www.lvmh.com",
  "CEGEDIM":                         "https://www.cegedim.com",
  "ABC ARBITRAGE":                   "https://www.abc-arbitrage.com",
  "UNIBAIL-RODAMCO-WESTFIELD SE":    "https://www.urw.com",
  "VEOLIA ENVIRONNEMENT":            "https://www.veolia.com",
  "VIVENDI SE":                      "https://www.vivendi.com",
  "VIVENDI":                         "https://www.vivendi.com",
  "METROPOLE TELEVISION":            "https://www.m6groupe.fr",
  "HAULOTTE GROUP":                  "https://www.haulotte.com",
  "CATANA GROUP":                    "https://www.catana.fr",
  "INFOTEL":                         "https://www.infotel.com",
  "NEXITY":                          "https://www.nexity.fr",
  "GAUSSIN S.A.":                    "https://www.gaussin.com",
  "ISPD NETWORK":                    "https://www.ispd.net",
  "BIOSYNEX":                        "https://www.biosynex.com",
  "FDJ UNITED":                      "https://www.groupefdj.com",
  "ASHLER & MANSON":                 "https://www.ashler-manson.com",
  "COVIVIO HOTELS":                  "https://www.coviviohotels.com",
  "CASINO GUICHARD-PERRACHON":       "https://www.groupe-casino.fr",
  "ABEO":                            "https://www.abeo.fr",
  "BELIEVE":                         "https://www.believe.com",
  "REMY COINTREAU":                  "https://www.remy-cointreau.com",
  "BNP PARIBAS":                     "https://group.bnpparibas",
  "LEGRAND":                         "https://www.legrand.com",
  "BIOMERIEUX":                      "https://www.biomerieux.com",
  "WENDEL":                          "https://www.wendelgroup.com",
  "ALSTOM":                          "https://www.alstom.com",
  "ATOS SE":                         "https://atos.net",
  "VOLTALIA":                        "https://www.voltalia.com",
  "KERING":                          "https://www.kering.com",
  "L'OREAL":                         "https://www.loreal.com",
  "LOREAL":                          "https://www.loreal.com",
  "ABIVAX":                          "https://www.abivax.com",
  "KAUFMAN & BROAD SA":              "https://www.kb-home.com",
  "SCHNEIDER ELECTRIC SE":           "https://www.se.com",
  "WORLDLINE":                       "https://worldline.com",
  "EIFFAGE":                         "https://www.eiffage.com",
  "ILIAD":                           "https://www.iliad.fr",
  "SOITEC":                          "https://www.soitec.com",
  "INNATE PHARMA":                   "https://www.innate-pharma.com",
  "NACON":                           "https://www.nacongaming.com",
  "AUBAY":                           "https://www.aubay.com",
  "VUSIONGROUP":                     "https://www.vusiongroup.com",
  "CLARIANE SE":                     "https://www.clariane.com",
  "LISI":                            "https://www.lisi-group.com",
  "HAFFNER ENERGY":                  "https://www.haffner-energy.com",
  "SOCIETE FONCIERE LYONNAISE":      "https://www.fonciere-lyonnaise.com",
  "GROUPE LDLC":                     "https://www.ldlc.com",
  "EXOSENS":                         "https://www.exosens.com",
  "SODEXO":                          "https://www.sodexo.com",
  "FORSEE POWER":                    "https://www.forseepower.com",
  "QUADIENT S.A.":                   "https://www.quadient.com",
  "TECHNICOLOR CREATIVE STUDIOS":    "https://www.technicolorcreativestudios.com",
  "CLARANOVA":                       "https://www.claranova.com",
  "PULLUP ENTERTAINMENT":            "https://www.pullupentertainment.com",
  "KEYRUS":                          "https://www.keyrus.com",
  "VETOQUINOL SA":                   "https://www.vetoquinol.com",
  "DANONE":                          "https://www.danone.com",
  "ESI GROUP":                       "https://www.esi-group.com",
  "ARAMIS GROUP":                    "https://www.aramisgroup.com",
  "BONDUELLE":                       "https://www.bonduelle.com",
  "INVENTIVA":                       "https://www.inventivapharma.com",
  "CARMAT":                          "https://www.carmatsa.com",
  "WAGA ENERGY":                     "https://www.waga-energy.com",
  "MC PHY ENERGY":                   "https://www.mcphy.com",
  "THERACLION":                      "https://theraclion.com",
  "ORAPI":                           "https://www.orapi.com",
  "DNXCORP":                         "https://www.dnxcorp.com",
  "UMALIS GROUP":                    "https://www.umalis-group.com",
  "LA SAVONNERIE DE NYONS":          "https://www.savonnerienyons.com",
  "COMPAGNIE DE L'ODET":             "https://www.compagniedelodet.fr",
  "INNELEC MULTIMEDIA":              "https://www.innelec.com",
  "QWAMPLIFY":                       "https://www.qwamplify.com",
  "AFYREN":                          "https://www.afyren.com",
  "AGRIPOWER FRANCE SA":             "https://www.agripower.fr",
  "HERIGE":                          "https://www.herige.fr",
  "KKO INTERNATIONAL SA":            "https://www.kko-international.com",
  "ALPHA MOS":                       "https://www.alpha-mos.com",
  "OSMOZIS":                         "https://www.osmozis.com",
  "AMA CORPORATION PLC":             "https://www.amacorporation.com",
  "VANTIVA":                         "https://www.vantiva.com",
  "GOLD BY GOLD":                    "https://www.goldbygold.com",
  "KALEON S.P.A":                    "https://www.kaleon.it",
  "SPARTOO":                         "https://corporate.spartoo.com",
  "OBIZ":                            "https://www.obiz.fr",
  "MOULINVEST":                      "https://www.moulinvest.fr",
  "EKINOPS":                         "https://www.ekinops.com",
  "CHARWOOD ENERGY":                 "https://www.charwoodenergy.com",
  "VOYAGEURS DU MONDE":              "https://www.vdm.com",
  "SII":                             "https://www.sii.fr",
  "PREDILIFE":                       "https://www.predilife.com",
  "TELEVERBIER SA":                  "https://www.televerbier.ch",
  "MAAT PHARMA":                     "https://www.maatpharma.com",
  "VAZIVA":                          "https://www.vaziva.com",
  "ENTREPARTICULIERS.COM":           "https://www.entreparticuliers.com",
  "NATURE ET LOGIS":                 "https://www.natureetlogis.com",
  "PATRIMOINES ET COMMERCE":         "https://www.patrimoinesetcommerce.fr",
  "PATRIMOINE ET COMMERCE":          "https://www.patrimoinesetcommerce.fr",
  "KLEA HOLDING":                    "https://www.klea-holding.com",
  "MEXEDIA S.P.A. S.B.":             "https://www.mexedia.com",
  "REALITES":                        "https://www.realites.fr",
  "COURTOIS S.A.":                   "https://www.courtois.fr",
  "NEOLIFE":                         "https://www.neolife.fr",
  "INNELEC MULTIMEDIA":              "https://www.innelec.com",
  // Previously in mapping
  "SIDETRADE":                       "https://www.sidetrade.com",
  "TELEPERFORMANCE":                 "https://www.teleperformance.com",
  "EDENRED":                         "https://www.edenred.com",
  "TIKEHAU CAPITAL":                 "https://www.tikehaucapital.com",
  "FREY":                            "https://www.frey.fr",
  "LNA SANTE":                       "https://www.lna-sante.com",
  "SMART GOOD THINGS HOLDING S.A.":  "https://www.smartgoodthings.com",
  "THERMADOR GROUPE":                "https://www.thermador-groupe.fr",
  "ELIOR GROUP":                     "https://www.eliorgroup.com",
  "GUILLEMOT CORPORATION":           "https://www.guillemot.com",
  "GROUPE AIRWELL":                  "https://www.airwell.com",
  "AMOEBA":                          "https://www.amoeba.fr",
  "1000MERCIS":                      "https://www.1000mercis.com",
  "VERALLIA":                        "https://www.verallia.com",
  "ARKEMA":                          "https://www.arkema.com",
  "VICAT S.A.":                      "https://www.vicat.fr",
  "SMCP":                            "https://www.smcp.com",
  "BELIEVE":                         "https://www.believe.com",
  "GAUSSIN S.A.":                    "https://www.gaussin.com",
  "BIOSYNEX":                        "https://www.biosynex.com",
};

// ── Image helpers ─────────────────────────────────────────────────────────────

async function fetchImage(url, ms = 7000) {
  try {
    url = url.trim().replace(/[.,;!?)]+$/, "");
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "image/*,*/*;q=0.8" },
      signal: AbortSignal.timeout(ms), redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/html") && !url.endsWith(".svg")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 300) return null;
    return { buf, ct };
  } catch { return null; }
}

function isValidImage(buf, ct) {
  if (!buf || buf.length < 300) return false;
  if (ct.includes("svg")) return buf.length > 80;
  if (buf[0] === 0x89 && buf[1] === 0x50) return true; // PNG
  if (buf[0] === 0xff && buf[1] === 0xd8) return true; // JPEG
  if (buf.slice(0, 4).toString() === "RIFF") return true; // WEBP
  const head = buf.slice(0, 60).toString("utf8").toLowerCase();
  if (head.includes("<svg") || head.includes("<?xml")) return true;
  return false;
}

function isGoodLogoUrl(url) {
  const bad = ["wikipedia.org", "wikimedia.org", "google.com/s2/favicons",
    "logo.clearbit.com", "facebook.com", "twitter.com", "linkedin.com",
    "instagram.com", "youtube.com", "placeholder", "default"];
  return !bad.some(b => url.includes(b));
}

// ── Strategy 1: Yahoo Finance → website URL → scrape ──────────────────────────

async function getWebsiteFromYahoo(ticker) {
  if (!ticker) return null;
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=assetProfile`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.quoteSummary?.result?.[0]?.assetProfile?.website ?? null;
  } catch { return null; }
}

async function scrapeLogoFromWebsite(website) {
  if (!website) return null;
  try {
    const res = await fetch(website, {
      headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8" },
      signal: AbortSignal.timeout(9000), redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const base = new URL(res.url).origin;

    const candidates = [];

    // OG image (highest quality)
    const ogPatterns = [
      /<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/i,
    ];
    for (const pat of ogPatterns) {
      const m = html.match(pat);
      if (m?.[1]) { candidates.push({ url: m[1], priority: 10 }); break; }
    }

    // Header/nav logo imgs
    const headerBlock = html.match(/<header[^>]*>([\s\S]{0,5000}?)<\/header>/i)?.[1]
      ?? html.match(/<nav[^>]*>([\s\S]{0,3000}?)<\/nav>/i)?.[1]
      ?? html.slice(0, 8000);

    const imgRe = /<img[^>]+>/gi;
    let m;
    while ((m = imgRe.exec(headerBlock)) !== null) {
      const tag = m[0];
      const src = tag.match(/(?:src|data-src|data-lazy-src|data-original)=["']([^"']+)["']/i)?.[1];
      if (!src || src.startsWith("data:")) continue;
      if (/favicon|16x16|32x32|apple-touch|sprite|payment|social/i.test(src)) continue;
      const alt = tag.match(/alt=["']([^"']+)["']/i)?.[1] ?? "";
      const cls = tag.match(/class=["']([^"']+)["']/i)?.[1] ?? "";
      const combined = src + alt + cls;
      const prio = /logo|brand|marque/i.test(combined) ? 8 : 3;
      candidates.push({ url: src, priority: prio });
    }

    const seen = new Set();
    for (const { url: rawUrl } of candidates.sort((a, b) => b.priority - a.priority)) {
      let resolved;
      try {
        // Fix common HTML encoding issues
        let clean = rawUrl
          .replace(/&amp;/g, "&")
          .replace(/&#038;/g, "&")
          .replace(/\s+/g, "%20")
          .trim();
        resolved = clean.startsWith("http") ? clean
          : clean.startsWith("//") ? "https:" + clean
          : base + (clean.startsWith("/") ? "" : "/") + clean;
        // Validate URL
        new URL(resolved);
      } catch { continue; }
      if (seen.has(resolved) || !isGoodLogoUrl(resolved)) continue;
      seen.add(resolved);
      const r = await fetchImage(resolved, 6000);
      if (r && isValidImage(r.buf, r.ct)) return { ...r, source: "scraped", sourceUrl: resolved };
    }
  } catch {}
  return null;
}

// ── Strategy 2: OpenAI Responses API with web search ──────────────────────────

let oaiClient = null;
async function getOAI() {
  if (oaiClient || !OPENAI_KEY) return oaiClient;
  const { default: OpenAI } = await import("openai");
  oaiClient = new OpenAI({ apiKey: OPENAI_KEY });
  return oaiClient;
}

async function findLogoOpenAI(name, yahooSymbol) {
  const oai = await getOAI();
  if (!oai) return null;

  // Try multiple prompts
  const prompts = [
    `URL directe d'une image logo (.png .svg .webp .jpg) pour la société "${name}"${yahooSymbol ? ` (${yahooSymbol})` : ""}. Cherche sur le site officiel, brandfetch.io, ou CDN de l'entreprise. SEULEMENT l'URL, pas d'explications. Évite wikipedia et google.com/s2/favicons.`,
    `Logo image URL for French company "${name}"${yahooSymbol ? ` stock ${yahooSymbol}` : ""}. Return ONLY a direct image URL from the official website or CDN. No wikipedia, no google favicons.`,
  ];

  for (const prompt of prompts) {
    try {
      const resp = await oai.responses.create({
        model: "gpt-4.1",
        tools: [{ type: "web_search_preview", search_context_size: "low" }],
        input: prompt,
        max_output_tokens: 250,
      });

      const text = resp.output_text ?? "";
      const urls = [...text.matchAll(/https?:\/\/[^\s<>"'\)\]]+/gi)]
        .map(m => m[0].replace(/[.,;!?\)\]]+$/, ""))
        .filter(u => isGoodLogoUrl(u) && !u.includes("logo.clearbit.com"));

      // Prioritize image extension URLs
      const sorted = [
        ...urls.filter(u => /\.(png|jpg|jpeg|svg|webp)(\?.*)?$/i.test(u)),
        ...urls,
      ].filter((u, i, a) => a.indexOf(u) === i);

      for (const url of sorted.slice(0, 5)) {
        const r = await fetchImage(url, 8000);
        if (r && isValidImage(r.buf, r.ct)) {
          return { ...r, source: "openai", sourceUrl: url };
        }
      }
    } catch {}
  }
  return null;
}

// ── Blob upload ───────────────────────────────────────────────────────────────

async function uploadToBlob(slug, buf, ct) {
  if (DRY_RUN) return `https://blob.vercel-storage.com/dry-run/${slug}`;
  const ext = ct.includes("svg") ? "svg" : ct.includes("webp") ? "webp"
    : ct.includes("jpg") || ct.includes("jpeg") ? "jpg" : "png";
  const blob = await put(`logos/${slug}.${ext}`, buf, {
    access: "public", token: BLOB_TOKEN, contentType: ct,
    addRandomSuffix: false, allowOverwrite: true,
  });
  return blob.url;
}

// ── Process one company ───────────────────────────────────────────────────────

async function processCompany(co, stats) {
  try {
    // Step 1: Known domain mapping OR Yahoo Finance
    const knownWebsite = KNOWN_WEBSITES[co.name.toUpperCase()] ?? KNOWN_WEBSITES[co.name];
    const yahooWebsite = await getWebsiteFromYahoo(co.yahooSymbol);
    const website = knownWebsite ?? yahooWebsite;
    if (VERBOSE && website) console.log(`  [${co.name}] website: ${website} (${knownWebsite ? "known" : "yahoo"})`);

    // Step 2: Scrape logo from website
    if (website) {
      const r = await scrapeLogoFromWebsite(website);
      if (r) {
        const url = await uploadToBlob(co.slug, r.buf, r.ct);
        if (!DRY_RUN) {
          await prisma.company.update({
            where: { id: co.id },
            data: { logoUrl: url, logoSource: r.source },
          });
        }
        stats.found++;
        stats.bySource.scraped = (stats.bySource.scraped ?? 0) + 1;
        stats.samples.push({ name: co.name, source: "scraped", url: r.sourceUrl });
        if (VERBOSE) console.log(`  ✅ [scraped] ${co.name}`);
        return;
      }
    }

    // Step 3: OpenAI web search fallback
    const r2 = await findLogoOpenAI(co.name, co.yahooSymbol);
    if (r2) {
      const url = await uploadToBlob(co.slug, r2.buf, r2.ct);
      if (!DRY_RUN) {
        await prisma.company.update({
          where: { id: co.id },
          data: { logoUrl: url, logoSource: "openai" },
        });
      }
      stats.found++;
      stats.bySource.openai = (stats.bySource.openai ?? 0) + 1;
      stats.samples.push({ name: co.name, source: "openai", url: r2.sourceUrl });
      if (VERBOSE) console.log(`  ✅ [openai] ${co.name} — ${r2.sourceUrl.slice(0, 60)}`);
      return;
    }

    stats.notFound++;
    stats.failed.push(co.name);
  } catch (e) {
    stats.errors++;
    stats.failed.push(`${co.name} [err: ${e.message?.slice(0, 30)}]`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🖼️  fetch-logos-v3.mjs — Yahoo Finance + Scrape + OpenAI — ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`   concurrency=${CONCURRENCY}  limit=${LIMIT}\n`);

  const companies = await prisma.company.findMany({
    where: { logoUrl: null },
    select: { id: true, name: true, slug: true, yahooSymbol: true },
    orderBy: { declarations: { _count: "desc" } },
    take: LIMIT,
  });

  console.log(`📊  ${companies.length} companies without logo\n`);
  if (!companies.length) { console.log("✅ Done!"); await prisma.$disconnect(); return; }

  const stats = { found: 0, notFound: 0, errors: 0, bySource: {}, samples: [], failed: [] };
  let processed = 0;

  for (let i = 0; i < companies.length; i += CONCURRENCY) {
    const batch = companies.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(co => processCompany(co, stats)));
    processed += batch.length;
    const pct = Math.round(processed / companies.length * 100);
    const src = Object.entries(stats.bySource).map(([k,v]) => `${k}=${v}`).join(" ");
    process.stdout.write(`\r  ${processed}/${companies.length} (${pct}%)  found=${stats.found}  missing=${stats.notFound}  ${src}  `);
  }

  console.log("\n");
  const [total, withLogo] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { logoUrl: { not: null } } }),
  ]);

  console.log("══════════════════════════════════════════════════════");
  console.log(`✅ Found    : ${stats.found}`);
  console.log(`❌ Not found: ${stats.notFound}`);
  console.log(`💥 Errors   : ${stats.errors}`);
  console.log(`\nBy source:`);
  Object.entries(stats.bySource).forEach(([k, v]) => console.log(`  ${k.padEnd(12)}: ${v}`));
  console.log(`\n📊 Coverage : ${withLogo}/${total} (${(withLogo/total*100).toFixed(1)}%)`);

  if (stats.samples.length > 0) {
    console.log(`\n✅ Sample logos:`);
    stats.samples.slice(0, 15).forEach(s =>
      console.log(`  [${s.source}] ${s.name.padEnd(35)} ${s.url.slice(0, 55)}`));
  }
  if (stats.failed.length > 0) {
    console.log(`\n❌ Failed (${stats.failed.length}):`);
    stats.failed.slice(0, 20).forEach(n => console.log(`  - ${n}`));
  }
  console.log("══════════════════════════════════════════════════════\n");

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

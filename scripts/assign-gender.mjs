/**
 * Assign gender to all Insider records based on:
 *   1. Honorifics in their name (Mme / M.)
 *   2. Feminine function morphology (Administratrice, Directrice…)
 *   3. French first-name dictionary
 *
 * Usage: node scripts/assign-gender.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Gender inference (mirrored from src/lib/gender-utils.ts) ─────────────────

const FEMALE_HONORIFICS = /\b(mme\.?|madame|ms\.?|miss|mrs\.?)\b/i;
const MALE_HONORIFICS   = /\b(^m\.|monsieur|mr\.?)\b/i;

const FEMALE_FUNCTION_PATTERNS = [
  /\badministratrice\b/i,
  /\bdirectrice\b/i,
  /\bprésidente\b/i,
  /\bpresidente\b/i,
  /\bgérante\b/i,
  /\bgerante\b/i,
  /\breprésentante\b/i,
  /\brepresentante\b/i,
  /\bdirigeante\b/i,
  /\bactionnaire\b.*\bfemme\b/i,
];

const FEMALE_NAMES = new Set([
  "alice","aline","amelie","anastasia","andree","angelique","anita","anne","annick","antoinette","arielle","aurelie","axelle",
  "beatrice","benedicte","bernadette","brigitte",
  "camille","caroline","catherine","cecile","chantal","charlotte","christelle","christiane","christine","claire","clara","claudie","claudine","colette","constance","corinne",
  "delphine","diane","dominique","edith","eleonore","elise","elizabeth","emeline","emilie","emma","estelle","eva","evelyne",
  "fabienne","florence","francoise","frederique","gaelle","genevieve","geraldine","ghislaine","gwenaelle",
  "helene","henriette","ines","isabelle","jacqueline","jessica","jocelyne","joelle","judith","julie","juliette",
  "karen","laetitia","laure","laurence","lea","leila","leonore","liliane","lise","lorraine","louise","lucile","lucie","lydie",
  "madeleine","manon","marguerite","marie","marine","marlene","marthe","martine","mathilde","melanie","michelle","monique","muriel","murielle","myriam",
  "nadege","nadine","nathalie","nicole","noemie","nora","odette","odile","olivia",
  "pascale","patricia","pauline","perrine","sabine","sarah","severine","solange","sophie","stephanie","suzanne","sylvie",
  "tiphaine","valerie","vanessa","veronique","victoria","virginie","viviane","yolande","yvette","yvonne",
  // short
  "aude","axel","ayesha","bea","celia","chloe","cleo","elena","elsa","eve","fanny","grace","ingrid","irene","iris","jade","jane","jennifer","joy","julia","karin","katell","lena","lia","lisa","luna","maia","maite","malika","maya","mia","nina","nour","olga","pia","reine","rita","rose","rosa","ruth","sana","sara","sasha","silvia","simone","sonia","tara","thea","tina","vera","yael","yara","yasmine","zoe","zahra","zara",
]);

const MALE_NAMES = new Set([
  "aaron","adam","adrien","alexandre","alexis","alain","albert","alfred","antoine","arnaud","arthur","augustin",
  "baptiste","benjamin","bertrand","bruno",
  "cedric","charles","christian","christophe","clement","corentin",
  "damien","daniel","david","denis","didier","dylan",
  "edouard","emile","eric","etienne",
  "fabien","fabrice","florent","florian","francois","frederic","franck",
  "gabriel","gaetan","gautier","geoffrey","georges","gerard","gilbert","gregoire","guillaume",
  "henri","herve","hugo","hubert",
  "jean","jerome","joel","joseph","julien",
  "kevin","laurent","luc","lucas","ludovic",
  "marc","martin","mathieu","maxime","michael","michel","mickael","nicolas","noel","noah",
  "olivier","oscar","pascal","patrick","paul","philippe","pierre",
  "quentin","raphael","remy","renaud","rene","richard","robert","romain",
  "samuel","sebastien","serge","simon","stephane","sylvain",
  "thierry","thomas","tristan","valentin","victor","vincent",
  "william","xavier","yann","yannick","yves",
  // short
  "ali","amine","aymen","ben","eli","ethan","evan","felix","frank","guy","ian","jack","jan","jay","jean","joe","john","jon","josh","kai","ken","leo","luca","luis","matt","max","mike","noe","oli","pat","pete","phil","rob","ryan","sam","sean","ted","theo","tim","tom","tony","will",
]);

function deaccent(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function extractFirstName(fullName) {
  if (!fullName) return null;
  const cleaned = fullName.replace(/\b(m\.?|mme\.?|madame|monsieur|mr\.?|ms\.?|dr\.?|prof\.?)\s*/gi, "").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  for (const part of parts) {
    if (part === part.toUpperCase() && part.length > 2) continue;
    const n = deaccent(part).toLowerCase().split("-")[0];
    if (n.length > 2 && !/^\d/.test(n)) return n;
  }
  const first = deaccent(parts[0]).toLowerCase().split("-")[0];
  return first.length > 1 ? first : null;
}

function inferGender(name, fn) {
  if (FEMALE_HONORIFICS.test(name ?? "")) return "F";
  if (MALE_HONORIFICS.test(name ?? ""))   return "M";
  for (const pat of FEMALE_FUNCTION_PATTERNS) {
    if (pat.test(fn ?? "")) return "F";
  }
  const first = extractFirstName(name ?? "");
  if (first) {
    if (FEMALE_NAMES.has(first)) return "F";
    if (MALE_NAMES.has(first))   return "M";
  }
  return null;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 Loading insiders + their most common function…");

  // For each insider, get their most frequent insiderFunction from declarations
  const insiders = await prisma.insider.findMany({
    select: {
      id: true,
      name: true,
      gender: true,
      declarations: {
        select: { insiderFunction: true, insiderName: true },
        where: { insiderFunction: { not: null } },
        take: 10,
      },
    },
  });

  console.log(`Total insiders: ${insiders.length}`);

  let assigned = 0;
  let male = 0, female = 0, unknown = 0;

  const updates = [];
  for (const insider of insiders) {
    // Most common function
    const fnCounts = new Map();
    for (const d of insider.declarations) {
      if (d.insiderFunction) {
        fnCounts.set(d.insiderFunction, (fnCounts.get(d.insiderFunction) ?? 0) + 1);
      }
    }
    const topFn = [...fnCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Also check raw insiderName from declarations (may have Mme/M. prefix)
    const rawName = insider.declarations[0]?.insiderName ?? insider.name;

    const gender = inferGender(rawName, topFn);

    if (gender !== insider.gender) {
      updates.push({ id: insider.id, gender });
      assigned++;
    }

    if (gender === "M") male++;
    else if (gender === "F") female++;
    else unknown++;
  }

  // Bulk update
  console.log(`\nUpdating ${updates.length} insiders…`);
  for (const u of updates) {
    await prisma.insider.update({ where: { id: u.id }, data: { gender: u.gender } });
  }

  console.log(`\n✅ Done`);
  console.log(`   Male (M):    ${male} (${(male / insiders.length * 100).toFixed(1)}%)`);
  console.log(`   Female (F):  ${female} (${(female / insiders.length * 100).toFixed(1)}%)`);
  console.log(`   Unknown:     ${unknown} (${(unknown / insiders.length * 100).toFixed(1)}%)`);

  // Show sample females
  const females = insiders.filter(i => {
    const fn = i.declarations[0]?.insiderFunction ?? null;
    const rn = i.declarations[0]?.insiderName ?? i.name;
    return inferGender(rn, fn) === "F";
  }).slice(0, 10);
  console.log("\n📊 Sample female insiders:");
  females.forEach(f => {
    const fn = f.declarations[0]?.insiderFunction ?? "—";
    console.log(`  ${f.name} | ${fn}`);
  });

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

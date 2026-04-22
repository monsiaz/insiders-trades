/**
 * Gender inference for French insider names and function titles.
 *
 * Strategy (in priority order):
 *  1. Explicit honorific in raw insiderName   (Mme / Madame → F, M. / Monsieur → M)
 *  2. Feminine morphology in insiderFunction  (Administratrice, Directrice, Présidente…)
 *  3. French female first-name dictionary     (Marie, Sophie, Claire…)
 *  4. null · could not determine
 */

type Gender = "M" | "F" | null;

// ── 1. Honorifics ────────────────────────────────────────────────────────────

const FEMALE_HONORIFICS = /\b(mme\.?|madame|ms\.?|miss|mrs\.?)\b/i;
const MALE_HONORIFICS   = /\b(m\.?|monsieur|mr\.?)\b/i;

// ── 2. Feminine function morphology (French grammar) ─────────────────────────
// Feminine endings or explicit feminine titles

const FEMALE_FUNCTION_PATTERNS = [
  /\badministratrice\b/i,
  /\bdirectrice\b/i,
  /\bprésidente\b/i,
  /\bpresidente\b/i,        // unaccented form
  /\bgérante\b/i,
  /\bgerante\b/i,
  /\bassocié?e\b/i,
  /\bcenseure?\b/i,
  /\bmembre\b.*\bsurveillance\b/i,  // not gender-specific but common in F
  /\breprésentante\b/i,
  /\brepresentante\b/i,
  /\bactionnaire\b.*\bfemme\b/i,
  /\bdirigeante\b/i,
];

// ── 3. Common French female first names (curated list, high precision) ───────

const FEMALE_FIRST_NAMES = new Set([
  // A
  "alice","aline","amelie","ameline","anastasia","andree","angelique","anita","anne","annick","antoinette","arielle","aurelie","axelle",
  // B
  "beatrice","benedicte","bernadette","brigitte",
  // C
  "camille","caroline","catherine","cecile","chantal","charlotte","christelle","christiane","christine","claire","clara","claudie","claudine","colette","constance","corinne",
  // D-E
  "delphine","diane","dominique","edith","eleonore","elise","eliseth","elizabeth","emeline","emilie","emma","estelle","eva","evelyne",
  // F-G
  "fabienne","florence","francoise","frederique","gaelle","genevieve","geraldine","ghislaine","gwenaelle",
  // H-I-J
  "helene","henriette","ines","isabelle","jacqueline","jessica","jocelyne","joelle","judith","julie","juliette",
  // K-L
  "karen","laetitia","laure","laurence","lea","leila","leonore","liliane","lilou","lise","lorraine","louise","lucile","lucie","lucie","lydie",
  // M
  "madeleine","manon","marguerite","marie","marie-christine","marie-france","marie-helene","marie-laure","marie-line","marie-noelle","marie-pierre","marine","marlene","marthe","martine","mathilde","melanie","michelle","monique","muriel","murielle","myriam",
  // N-O
  "nadege","nadine","nathalie","nicole","noemie","nora","odette","odile","olivia",
  // P-R
  "pascale","patricia","pauline","perrine","sabine","sarah","severine","solange","sophie","stephanie","suzanne","sylvie",
  // T-V-Y
  "tiphaine","valerie","vanessa","veronique","victoria","virginie","viviane","yolande","yvette","yvonne",
  // Short/uncommon but confident
  "aude","axel","ayesha","bea","celia","celie","chloe","cleo","elena","elsa","emilou","eve","fanny","gayle","gigi","gina","gita","grace","ines","ingrid","irene","iris","ivy","jade","jane","jana","jennifer","jessy","jill","jin","joan","johanna","joy","julia","june","karin","katell","lea","leila","lena","leni","leo","leonie","lia","lisa","lora","luce","luisa","luna","maia","maite","malika","malia","mara","maria","marise","maya","mia","mimi","minh","mira","mora","myra","naima","nana","nathalie","nelly","nena","nia","nina","nora","nour","olga","ora","oria","pia","pilar","pola","reine","rina","rita","rose","rosa","ruth","sana","sara","sasha","selin","sera","silvia","simone","sina","sonia","soraya","sou","steph","tara","tea","thea","tina","vera","vera","vika","vita","wilma","yael","yara","yasmine","yolande","zahra","zara","zoe",
]);

// ── 4. Very common male first names (for tie-breaking) ────────────────────────

const MALE_FIRST_NAMES = new Set([
  "aaron","adam","adrien","alexandre","alexis","alain","albert","alfred","antoine","arnaud","arthur","augustin","axel",
  "baptiste","benjamin","bertrand","bruno",
  "cedric","charles","christian","christophe","claude","clement","corentin",
  "damien","daniel","david","denis","didier","dominique","dylan",
  "edouard","emile","eric","etienne",
  "fabien","fabrice","florent","florian","francois","frederic","franck",
  "gabriel","gaetan","gautier","geoffrey","georges","gerard","gilbert","gregoire","guillaume",
  "henri","herve","hugo","hubert",
  "isidore","ivan",
  "jean","jerome","joao","joel","jonatan","jordan","jose","joseph","julien",
  "kevin","kieran",
  "laurent","leo","luc","lucas","ludovic",
  "marc","martin","mathieu","matthieu","maxime","maxim","michael","michel","mickael","nicolas",
  "noel","noah",
  "olivier","oscar",
  "pascal","patrick","paul","peter","philippe","pierre",
  "quentin","raphael","remy","renaud","rene","richard","robert","rodrigo","roland","romain",
  "samuel","sebastien","serge","simon","stephane","sylvain",
  "theodore","thierry","thomas","tim","tomas","tristan",
  "valentin","victor","vincent","vivien",
  "william","xavier","yann","yannick","yves",
  // common short
  "ali","amine","aymen","aziz","ben","bob","ed","eli","eric","ethan","evan","felix","frank","guy","ian","igor","jack","jake","jake","jan","jas","jay","jeff","jim","jo","joe","john","jon","jose","josh","kai","ken","lars","leo","lev","luca","luis","luka","matt","max","mike","nao","ned","neil","nick","noah","noe","oli","pat","pete","phil","raj","rob","ryan","sam","sean","ted","theo","tim","tom","tony","uri","val","victor","will","yuan",
]);

// ── Main function ────────────────────────────────────────────────────────────

export function inferGender(
  insiderName: string | null | undefined,
  insiderFunction: string | null | undefined,
): Gender {
  const name = (insiderName ?? "").trim();
  const fn   = (insiderFunction ?? "").trim();

  // 1. Honorific in name
  if (FEMALE_HONORIFICS.test(name)) return "F";
  if (MALE_HONORIFICS.test(name))   return "M";

  // 2. Feminine function morphology
  for (const pat of FEMALE_FUNCTION_PATTERNS) {
    if (pat.test(fn)) return "F";
  }

  // 3. First name lookup
  const firstName = extractFirstName(name);
  if (firstName) {
    if (FEMALE_FIRST_NAMES.has(firstName)) return "F";
    if (MALE_FIRST_NAMES.has(firstName))   return "M";
  }

  return null;
}

/**
 * Extract likely first name from a full name string.
 * Handles "DUPONT Marie", "Marie DUPONT", "Jean-Pierre MARTIN"
 */
function extractFirstName(fullName: string): string | null {
  if (!fullName) return null;

  // Remove honorifics
  const cleaned = fullName
    .replace(/\b(m\.?|mme\.?|madame|monsieur|mr\.?|ms\.?|dr\.?|prof\.?)\s*/gi, "")
    .trim();

  // Split on spaces
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  // AMF names are often "LASTNAME Firstname" or "Firstname LASTNAME"
  // Uppercase = last name, mixed/lower = first name
  for (const part of parts) {
    if (part === part.toUpperCase() && part.length > 2) continue; // skip uppercase (last name)
    const normalized = part.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    // Only return if it's a plausible first name (not an abbreviation)
    if (normalized.length > 2 && !/^\d/.test(normalized)) {
      return normalized.split("-")[0]; // handle "Jean-Pierre" → "jean"
    }
  }

  // Fallback: first token normalized
  const first = parts[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return first.length > 1 ? first.split("-")[0] : null;
}

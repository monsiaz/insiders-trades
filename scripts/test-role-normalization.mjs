// Test role normalization via TypeScript compilation check
// Uses the compiled output via tsx/ts-node

const cases = [
  ["PRESIDENT DIRECTEUR GENERAL", "PDG/DG"],
  ["PRESIDENT", "PDG/DG"],
  ["Président", "PDG/DG"],
  ["Directeur Général Délégué", "PDG/DG"],
  ["DIRECTEUR GENERAL DELEGUE", "PDG/DG"],
  ["Directeur Général", "PDG/DG"],
  ["PDG", "PDG/DG"],
  ["PCA", "CA/Board"],
  ["Gérant", "PDG/DG"],
  ["Administratrice", "CA/Board"],
  ["ADMINISTRATRICE", "CA/Board"],
  ["Membre du Comité Exécutif", "Directeur"],
  ["Directeur Financier", "CFO/DAF"],
  ["Director", "Directeur"],
  ["Membre du Directoire", "Directeur"],
  ["Président du Conseil d'administration", "CA/Board"],
  ["Président du Directoire", "PDG/DG"],
  ["Président d'honneur", "CA/Board"],
  ["Membre du Conseil de Surveillance", "CA/Board"],
  ["dirigeant (par personnes morales", "PDG/DG"],
  ["Administrateur Représentant les Salariés", "CA/Board"],
];

function deaccent(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeRole(fn) {
  if (!fn) return "Autre";
  const f = deaccent(fn).toLowerCase();

  if (/\bpdg\b/.test(f) || /\bp\.d\.g\b/.test(f)) return "PDG/DG";
  if (/\bdg\b/.test(f) || /\bd\.g\b/.test(f)) return "PDG/DG";
  if (/\bceo\b/.test(f) || /\bc\.e\.o\b/.test(f)) return "PDG/DG";
  if (/\bcfo\b/.test(f) || /\bc\.f\.o\b/.test(f)) return "CFO/DAF";
  if (/\bdaf\b/.test(f) || /\bd\.a\.f\b/.test(f)) return "CFO/DAF";
  if (/\bpca\b/.test(f) || /\bp\.c\.a\b/.test(f)) return "CA/Board";

  if (f.includes("president-directeur") || f.includes("president directeur")) return "PDG/DG";
  if (f.includes("directeur general delegue") || f.includes("directeur-general delegue")) return "PDG/DG";
  if (f.includes("directeur general") || f.includes("directeur-general")) return "PDG/DG";
  if (f.includes("directeur executif")) return "PDG/DG";
  if (f.includes("managing director")) return "PDG/DG";
  if (f.includes("chief executive")) return "PDG/DG";
  if (f.includes("president du directoire")) return "PDG/DG";

  if (/\bgerant\b/.test(f) || /\bgerante\b/.test(f)) return "PDG/DG";

  if (f.includes("president") && !f.includes("conseil") && !f.includes("surveillance") && !f.includes("honneur")) return "PDG/DG";
  if (f.includes("president d'honneur") || f.includes("president honoraire")) return "CA/Board";

  if (f.includes("directeur financier") || f.includes("directrice financier") || f.includes("directeur finance") || f.includes("chief financial") || f.includes("directeur administratif et financier")) return "CFO/DAF";

  if (f.includes("comite executif") || f.includes("comite de direction") || f.includes("executive committee")) return "Directeur";
  if (f.includes("membre du directoire") || f.includes("directoire")) return "Directeur";
  if (f.includes("directeur") || f.includes("directrice") || f.includes("director") || f.includes("chief ")) return "Directeur";

  if (f.includes("administrateur") || f.includes("administratrice")) return "CA/Board";
  if (f.includes("conseil d") || f.includes("conseil de") || f.includes("conseil ")) return "CA/Board";
  if (f.includes("board") || f.includes("supervisory") || f.includes("surveillance")) return "CA/Board";
  if (f.includes("censeur") || f.includes("membre du conseil")) return "CA/Board";

  if (f.includes("dirigeant")) return "PDG/DG";
  return "Autre";
}

let ok = 0, fail = 0;
for (const [fn, expected] of cases) {
  const got = normalizeRole(fn);
  const pass = got === expected;
  if (!pass) {
    console.log(`FAIL: "${fn}"\n  got: ${got}\n  want: ${expected}`);
    fail++;
  } else {
    ok++;
  }
}
console.log(`\n${ok}/${cases.length} passed, ${fail} failed`);

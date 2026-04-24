// Simulate the pdfjs-dist output: missing \n after "LIEE :"
import { parsePdfText } from "../src/lib/pdf-parser";

// Case 1: Label text and name separated by SPACE (pdfjs-dist bug)
const case1 = `
NOM /FONCTION DE LA PERSONNE EXERCANT DES RESPONSABILITES DIRIGEANTES OU DE LA PERSONNE ETROITEMENT LIEE : Claude GUILLEMOT, PRESIDENT DIRECTEUR GENERAL
NOTIFICATION INITIALE / MODIFICATION: Notification initiale
COORDONNEES DE L'EMETTEUR
NOM : GUILLEMOT CORPORATION
DETAIL DE LA TRANSACTION
DATE DE LA TRANSACTION : 06 mai 2024
LIEU DE LA TRANSACTION : Euronext Paris
NATURE DE LA TRANSACTION : Acquisition
DESCRIPTION DE L'INSTRUMENT FINANCIER : Action
CODE D'IDENTIFICATION DE L'INSTRUMENT FINANCIER : FR0000066722
INFORMATIONS AGREGEES
PRIX : 5.8678 Euro
VOLUME : 30 733.0000
`;

// Case 2: Multiline like the good pdftotext output (should still work)
const case2 = `
NOM /FONCTION DE LA PERSONNE EXERCANT DES RESPONSABILITES DIRIGEANTES OU DE LA
PERSONNE ETROITEMENT LIEE :

Claude GUILLEMOT, PRESIDENT DIRECTEUR GENERAL


NOTIFICATION INITIALE / MODIFICATION: Notification initiale
NATURE DE LA TRANSACTION : Acquisition
`;

// Case 3: Name without comma (pdfjs sometimes loses it)
const case3 = `
NOM /FONCTION DE LA PERSONNE EXERCANT DES RESPONSABILITES DIRIGEANTES OU DE LA
PERSONNE ETROITEMENT LIEE :
Claude GUILLEMOT PRESIDENT DIRECTEUR GENERAL
NATURE DE LA TRANSACTION : Acquisition
`;

// Case 4: Value escaping into next label (the "long nature" bug)
const case4 = `
NOM /FONCTION DE LA PERSONNE EXERCANT DES RESPONSABILITES DIRIGEANTES OU DE LA
PERSONNE ETROITEMENT LIEE :
Jean MARTIN, ADMINISTRATEUR
NATURE DE LA TRANSACTION : Acquisition DESCRIPTION DE L'INSTRUMENT FINANCIER : Action CODE D'IDENTIFICATION : FR0001234567
`;

const cases = [
  { label: "Case 1: pdfjs flat (space instead of \\n)", text: case1 },
  { label: "Case 2: multi-line classic", text: case2 },
  { label: "Case 3: no comma between name and function", text: case3 },
  { label: "Case 4: field bleed (old bug)", text: case4 },
];

for (const c of cases) {
  console.log(`\n═══ ${c.label} ═══`);
  const p = parsePdfText(c.text);
  console.log(`  insiderName     : "${p.insiderName ?? "∅"}"`);
  console.log(`  insiderFunction : "${p.insiderFunction ?? "∅"}"`);
  console.log(`  transactionNature: "${p.transactionNature ?? "∅"}"`);
}

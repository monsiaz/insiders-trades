// Test the actual parser against a real PETL PDF's text
import { readFileSync } from "fs";
import { parsePdfText } from "../src/lib/pdf-parser";

const text = readFileSync("/tmp/real-petl.txt", "utf-8");
console.log("═══ Input text (first 1000 chars) ═══");
console.log(text.slice(0, 1000));
console.log("\n═══ Parser output ═══");
const parsed = parsePdfText(text, "/tmp/real-petl.pdf");
console.log(JSON.stringify(parsed, null, 2));

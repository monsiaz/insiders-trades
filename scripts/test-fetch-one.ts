import { fetchDeclarationDetail } from "../src/lib/amf-detail";
(async () => {
  console.log("Fetching 2024DD964878...");
  const d = await fetchDeclarationDetail("2024DD964878");
  console.log("Result:", JSON.stringify(d, null, 2));
})();

/**
 * /docs · Public API reference (editorial, Sigma DA).
 *
 * Long-form reference covering:
 *   - Authentification
 *   - Concepts (freshness, pagination, errors)
 *   - 14 endpoints, each with cURL + example response
 *   - Data model
 *   - Rate limits
 *   - Code samples (cURL, Node, Python)
 *
 * Public (beta-unlocked) · whitelisted in middleware.
 */

import Link from "next/link";
import { headers } from "next/headers";
import { LogoMark } from "@/components/Logo";
import { Endpoint, MethodBadge } from "./_components/Endpoint";
import { CodeBlock, CodeTabs } from "./_components/CodeBlock";
import { TOC } from "./_components/TOC";

export const dynamic = "force-dynamic"; // locale-aware

export async function generateMetadata() {
  const hdrs = await headers();
  const locale = (hdrs.get("x-locale") ?? "en") as "en" | "fr";
  const isFr = locale === "fr";
  return {
    title: isFr
      ? "Documentation API · Insiders Trades Sigma"
      : "API Documentation · Insiders Trades Sigma",
    description: isFr
      ? "Référence complète de l'API REST publique d'Insiders Trades Sigma : déclarations AMF, signaux scorés, backtests, fondamentaux Yahoo. Exemples en cURL, Python, JavaScript."
      : "Complete reference for the Insiders Trades Sigma public REST API: AMF filings, scored signals, backtests, Yahoo fundamentals. Examples in cURL, Python, JavaScript.",
  };
}

// ── Constants used across examples ───────────────────────────────────────────

const BASE_URL = "https://insiders-trades-sigma.vercel.app";
const EX_KEY = "sit_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

// ═══════════════════════════════════════════════════════════════════════════════

export default async function DocsPage() {
  const hdrs = await headers();
  const locale = (hdrs.get("x-locale") ?? "en") as "en" | "fr";
  const isFr = locale === "fr";

  const T = isFr ? {
    heroH1: <>Documentation <span style={{ fontStyle: "italic", color: "var(--gold)" }}>API</span></>,
    heroBody: <>Accès programmatique à toutes les données publiques AMF enrichies :
      déclarations de dirigeants, signaux scorés, backtests T+30 à T+730,
      fondamentaux Yahoo. 14 endpoints REST, authentification par clé API,
      métadonnées de fraîcheur sur chaque réponse.</>,
    btnSwagger: "Swagger UI interactive ↗",
    btnMcp: "Serveur MCP pour IA ↗",
    btnApiKey: "Générer une clé API ↗",
    btnOpenApi: "Spec OpenAPI JSON ↗",
    quickstartEyebrow: "Démarrage",
    quickstartTitle: "Quickstart",
    quickstartIntro: "Trois étapes pour faire votre première requête :",
    quickstartStep1: <>Créez un compte, puis rendez-vous sur{" "}<Link href="/account/api-keys" style={linkGold}>Mon compte → Clés API</Link>.</>,
    quickstartStep2: <>Générez une clé nommée (ex : &laquo; Production bot &raquo;). Copiez-la immédiatement, elle ne sera plus affichée.</>,
    quickstartStep3: <>Ajoutez le header <code style={codeInline}>Authorization: Bearer &lt;key&gt;</code> à chaque requête.</>,
    authEyebrow: "Sécurité",
    authTitle: "Authentification",
    authBody: <>Chaque requête doit inclure <strong>exactement une</strong> clé API valide et non révoquée. Deux formats sont acceptés, au choix :</>,
    authLi1: <><code style={codeInline}>Authorization: Bearer &lt;key&gt;</code> · standard, recommandé.</>,
    authLi2: <><code style={codeInline}>X-Api-Key: &lt;key&gt;</code> · alternative si votre client HTTP ne gère pas bien le header Authorization.</>,
    authCallout: <><strong>La clé est affichée une seule fois</strong> à la création. En cas de perte, révoquez-la et générez-en une nouvelle. Limite : 10 clés actives par compte. Les clés révoquées restent visibles en historique.</>,
    authKeyFormatH4: "Format des clés",
    authInvalidH4: "Clé invalide, expirée ou révoquée",
    authInvalidBody: <>Toute erreur d&apos;authentification renvoie un <code style={codeInline}>HTTP 401</code> au format uniforme :</>,
    conceptsEyebrow: "Fondamentaux",
    conceptsTitle: "Concepts clés",
    conceptsBaseUrlH4: "Base URL",
    conceptsMetaH4: "Métadonnées universelles",
    conceptsMetaBody: <>Chaque réponse 200 inclut un objet <code style={codeInline}>meta</code>. Il contient la latence serveur et un mini-dictionnaire <code style={codeInline}>dataFreshness</code> avec la date de dernière mise à jour de chaque bloc de données, permettant à votre client de décider s&apos;il doit invalider son cache.</>,
    conceptsPagH4: "Pagination",
    conceptsPagBody: <>Les endpoints listing supportent <code style={codeInline}>?limit</code> (défaut 50, max 200) et <code style={codeInline}>?offset</code> (défaut 0). Le champ <code style={codeInline}>total</code> retourné permet de paginer jusqu&apos;au bout.</>,
    conceptsTsH4: "Format des timestamps",
    conceptsTsBody: <>Tous les timestamps sont en <strong>ISO 8601</strong> UTC (<code style={codeInline}>2026-04-20T18:32:11.123Z</code>).</>,
    conceptsNullH4: "Champs nullable",
    conceptsNullBody: <>Un champ manquant dans la BDD est sérialisé en <code style={codeInline}>null</code> (jamais omis). Cela permet de distinguer &laquo; donnée absente &raquo; d&apos;une erreur de champ.</>,
    conceptsBigIntH4: "BigInt (montants)",
    conceptsBigIntBody: <>Les champs comme <code style={codeInline}>marketCap</code>,{" "}<code style={codeInline}>revenue</code>, <code style={codeInline}>totalAmount</code>{" "}peuvent dépasser la capacité du nombre flottant JS (2<sup>53</sup>). Ils sont retournés comme des <em>nombres</em>, mais pour les sommes globales (L&apos;Oréal à 195 Md€…) votre code client doit utiliser des BigInt si la précision vaut plus de 1 €.</>,
    endpointsEyebrow: "API Reference",
    endpointsTitle: "Endpoints",
    endpointsIntro: "14 endpoints, tous en lecture seule. Groupés par domaine.",
    groupAuth: "Authentification",
    groupHealth: "Santé & stats",
    groupCompanies: "Sociétés",
    groupInsiders: "Dirigeants",
    groupDeclarations: "Déclarations",
    groupSignals: "Signaux",
    groupBacktest: "Backtest",
    groupSearch: "Recherche",
    meSum: "Vérifier une clé et obtenir l'identité",
    meDesc: "Renvoie les informations de l'utilisateur propriétaire de la clé + métadonnées de la clé elle-même. Utilisez-le comme ping pour valider qu'une clé est toujours active.",
    healthSum: "État du système",
    healthDesc: "Ping de la base de données (avec latence mesurée), horodatage de chaque étape de la pipeline. Utile pour détecter un arrêt du cron horaire ou du scoring.",
    healthH5: "Réponse (extraits)",
    statsSum: "Compteurs globaux",
    statsDesc: "Nombre total de déclarations, de sociétés, d'initiés, de backtests, ventilations par fenêtre temporelle (24h / 7j / 30j), score moyen global.",
    companiesSum: "Lister les sociétés",
    companiesDesc: "Retourne les sociétés filtrées. 585 sociétés trackées au total.",
    companiesH5: "Réponse (tronquée)",
    companyDetailSum: "Détail d'une société (fondamentaux complets)",
    companyDetailDesc: "Renvoie l'intégralité du profil : income statement, bilan, valorisation (P/E, P/B, beta), consensus analyste (reco, target mean/high/low), technicals (52-week, 50/200 DMA, dividend yield).",
    companyDetailCallout: <>Les champs Yahoo (<code style={codeInline}>trailingPE</code>, <code style={codeInline}>analystReco</code>, <code style={codeInline}>targetMean</code>…) peuvent être <code style={codeInline}>null</code> pour les micro-caps non couvertes par les analystes.</>,
    companyDeclSum: "Déclarations AMF d'une société",
    companyDeclDesc: "Historique complet des transactions de dirigeants sur une société, triées par pubDate desc.",
    insidersSum: "Lister les dirigeants",
    insidersDesc: "2 091 dirigeants trackés. Recherche fuzzy par nom.",
    insiderDetailSum: "Détail d'un dirigeant",
    insiderDetailDesc: "Profil + sociétés auxquelles il/elle est rattaché(e) avec sa fonction + score moyen et max de ses déclarations.",
    insiderDeclSum: "Historique transactions d'un dirigeant",
    insiderDeclDesc: "Chaîne complète des trades, toutes sociétés confondues, triée par pubDate desc.",
    declsSum: "Recherche avancée de déclarations",
    declsDesc: "Endpoint généraliste avec 12 filtres combinables. C'est le point d'entrée principal pour exporter un corpus historique ou analyser par critère.",
    declDetailSum: "Détail d'une déclaration (avec backtest)",
    declDetailDesc: "Objet complet incluant le backtest T+30/60/90/160/365/730 si calculé. Inclut prix d'exécution, prix au T+X et retour %.",
    declDetailH5: "Extrait du bloc backtest",
    signalsSum: "Top signaux (achats / ventes)",
    signalsDesc: "Raccourci pour obtenir les meilleurs scores sur une fenêtre glissante. Idéal pour un dashboard ou un bot de notification.",
    backtestSum: "Statistiques backtest globales",
    backtestDesc: "Retours moyens par horizon (T+30, T+60, T+90, T+160, T+365, T+730) et win rate à T+90. Filtrable par direction / score / période.",
    backtestH5: "Réponse type",
    searchSum: "Recherche cross-entités",
    searchDesc: "Recherche fuzzy dans les sociétés + dirigeants en un seul appel. Utilisé par le autocomplete du site.",
    dataModelEyebrow: "Schéma",
    dataModelTitle: "Modèle de données",
    dataModelIntro: <>Cinq entités principales. Voici les champs exposés dans l&apos;API (certains champs internes comme les index ou timestamps techniques ne sont pas inclus).</>,
    errorsEyebrow: "Erreurs",
    errorsTitle: "Gestion des erreurs",
    errorsIntro: "Toutes les erreurs suivent un format uniforme (RFC-7807-like) :",
    errorsH4: "Codes d'erreur",
    errorRows: [
      ["401", "missing_api_key", "Aucun header Authorization ni X-Api-Key"],
      ["401", "invalid_api_key", "Clé mal formée, inconnue, ou révoquée. User banni = idem."],
      ["404", "company_not_found", "Slug de société inexistant"],
      ["404", "insider_not_found", "Slug de dirigeant inexistant"],
      ["404", "declaration_not_found", "amfId inexistant"],
      ["500", "internal_error", "Erreur serveur, remontez-nous l'URL + heure"],
    ] as [string, string, string][],
    errorsCallout: <>Retryez toute réponse ≥ 500 avec un back-off exponentiel (ex : 1 s, 2 s, 4 s max 5 tentatives). Ne retryez jamais 401 / 404.</>,
    errorsTableHeaders: ["Status", "Code", "Quand"],
    rateLimitsEyebrow: "Quotas",
    rateLimitsTitle: "Rate limits & bonnes pratiques",
    rateLimitsIntro: "Plafonds par défaut durant la phase beta :",
    rateLimitsLi1: <><strong>5 000 requêtes / jour</strong> par clé (compteur reset 00:00 UTC).</>,
    rateLimitsLi2: <><strong>10 req/seconde</strong> (burst) · suffisant pour la plupart des usages.</>,
    rateLimitsLi3: <><strong>10 clés actives maximum</strong> par compte. Au-delà, révoquez-en une depuis <Link href="/account/api-keys" style={linkGold}>votre page de clés</Link>.</>,
    rateLimitsLi4: <>Les compteurs d&apos;usage sont visibles en temps réel par l&apos;utilisateur (total + aujourd&apos;hui) et par l&apos;admin (avec Top consommateurs).</>,
    rateLimitsBPH4: "Bonnes pratiques",
    rateLimitsBP1: <><strong>Respectez la fraîcheur.</strong> Les données ne bougent pas toutes les secondes. Les cours Yahoo sont rafraîchis 1×/jour (4 h UTC), les déclarations AMF 1×/heure. Consultez <code style={codeInline}>meta.dataFreshness</code> pour adapter votre fréquence de polling.</>,
    rateLimitsBP2: <><strong>Cachez agressivement.</strong> Un détail société change rarement, cachez-le côté client jusqu&apos;au <code style={codeInline}>priceAt + 1h</code>.</>,
    rateLimitsBP3: <><strong>Paginez correctement.</strong> Utilisez <code style={codeInline}>limit</code>{" "}raisonnable (20-50) et <code style={codeInline}>offset</code> pour les gros datasets.</>,
    rateLimitsBP4: <><strong>Retryez les 5xx.</strong> Avec back-off exponentiel, max 5 tentatives.</>,
    rateLimitsBP5: <><strong>Stockez la clé en secret.</strong> Jamais en clair dans un repo Git, dans le frontend, ou dans les logs.</>,
    samplesEyebrow: "Exemples",
    samplesTitle: "Code samples",
    samplesH4Top: "Récupérer les top signaux du jour",
    samplesH4Csv: <>Export CSV de toutes les déclarations d&apos;une société</>,
    changelogEyebrow: "Versioning",
    changelogTitle: "Changelog",
    changelogLi1: "Lancement de l'API publique.",
    changelogLi2: "14 endpoints, authentification par clé API, métadonnées de fraîcheur.",
    changelogLi3: <>Swagger UI interactive disponible sur <Link href="/api/docs" style={linkGold}>/api/docs</Link>.</>,
    supportEyebrow: "Support",
    supportTitle: "Aide, retours, SLA",
    supportBody: <>L&apos;API est en <strong>beta privée</strong>. L&apos;accès est sur invitation. Aucun SLA contractuel n&apos;est fourni pendant la beta, mais l&apos;équipe veille quotidiennement à la fraîcheur des données (cron horaire AMF + quotidien Yahoo).</>,
    supportLi1: <><strong>Demande d&apos;accès beta</strong> ou <strong>quota augmenté</strong> : contactez{" "}<a href="mailto:simon.azoulay.pro@gmail.com" style={linkGold}>simon.azoulay.pro@gmail.com</a>.</>,
    supportLi2: <><strong>Bug / anomalie</strong> : mentionnez l&apos;URL exacte, l&apos;heure (UTC), et le <code style={codeInline}>prefix</code> de la clé utilisée.</>,
    supportLi3: <><strong>Roadmap</strong> : endpoints POST pour notifications push, webhooks sur nouveaux signaux, scopes granulaires.</>,
    supportCallout: <><strong>Usage éthique.</strong> Les données AMF sont publiques, mais le rate limit sert aussi à éviter de surcharger les serveurs amont (Yahoo Finance, BDIF). Les patterns abusifs entraînent la révocation immédiate de la clé.</>,
    ctaH2: <>Prêt à intégrer <span style={{ fontStyle: "italic", color: "var(--gold)" }}>le signal des initiés</span> ?</>,
    ctaBody: <>Générez une clé en 10 secondes, copiez l&apos;exemple cURL du quickstart, et explorez les endpoints en direct avec Swagger.</>,
    ctaBtn1: "Générer ma clé →",
    ctaBtn2: "Ouvrir Swagger ↗",
    tocSections: [
      { id: "quickstart", label: "Quickstart" },
      { id: "auth", label: "Authentification" },
      { id: "concepts", label: "Concepts clés" },
      {
        id: "endpoints", label: "Endpoints",
        children: [
          { id: "me",                     label: "GET /me" },
          { id: "health",                 label: "GET /health" },
          { id: "stats",                  label: "GET /stats" },
          { id: "companies-list",         label: "GET /companies" },
          { id: "company-detail",         label: "GET /companies/{slug}" },
          { id: "company-declarations",   label: "GET /companies/{slug}/declarations" },
          { id: "insiders-list",          label: "GET /insiders" },
          { id: "insider-detail",         label: "GET /insiders/{slug}" },
          { id: "insider-declarations",   label: "GET /insiders/{slug}/decls" },
          { id: "declarations-list",      label: "GET /declarations" },
          { id: "declaration-detail",     label: "GET /declarations/{amfId}" },
          { id: "signals",                label: "GET /signals" },
          { id: "backtest",               label: "GET /backtest" },
          { id: "search",                 label: "GET /search" },
        ],
      },
      { id: "data-model",  label: "Modèle de données" },
      { id: "errors",      label: "Erreurs" },
      { id: "rate-limits", label: "Rate limits" },
      { id: "samples",     label: "Code samples" },
      { id: "changelog",   label: "Changelog" },
      { id: "support",     label: "Support" },
    ] as typeof TOC_SECTIONS,
  } : {
    heroH1: <>API <span style={{ fontStyle: "italic", color: "var(--gold)" }}>Documentation</span></>,
    heroBody: <>Programmatic access to all enriched public AMF data:
      executive filings, scored signals, T+30 to T+730 backtests,
      Yahoo fundamentals. 14 REST endpoints, API key authentication,
      freshness metadata on every response.</>,
    btnSwagger: "Interactive Swagger UI ↗",
    btnMcp: "MCP server for AI ↗",
    btnApiKey: "Generate an API key ↗",
    btnOpenApi: "OpenAPI JSON spec ↗",
    quickstartEyebrow: "Getting started",
    quickstartTitle: "Quickstart",
    quickstartIntro: "Three steps to make your first request:",
    quickstartStep1: <>Create an account, then go to{" "}<Link href="/account/api-keys" style={linkGold}>My account → API keys</Link>.</>,
    quickstartStep2: <>Generate a named key (e.g. &quot;Production bot&quot;). Copy it immediately — it won&apos;t be shown again.</>,
    quickstartStep3: <>Add the header <code style={codeInline}>Authorization: Bearer &lt;key&gt;</code> to every request.</>,
    authEyebrow: "Security",
    authTitle: "Authentication",
    authBody: <>Every request must include <strong>exactly one</strong> valid, non-revoked API key. Two formats are accepted:</>,
    authLi1: <><code style={codeInline}>Authorization: Bearer &lt;key&gt;</code> · standard, recommended.</>,
    authLi2: <><code style={codeInline}>X-Api-Key: &lt;key&gt;</code> · alternative if your HTTP client doesn&apos;t handle the Authorization header well.</>,
    authCallout: <><strong>The key is shown only once</strong> at creation. If lost, revoke it and generate a new one. Limit: 10 active keys per account. Revoked keys remain visible in history.</>,
    authKeyFormatH4: "Key format",
    authInvalidH4: "Invalid, expired or revoked key",
    authInvalidBody: <>Any authentication error returns an <code style={codeInline}>HTTP 401</code> in a uniform format:</>,
    conceptsEyebrow: "Fundamentals",
    conceptsTitle: "Key concepts",
    conceptsBaseUrlH4: "Base URL",
    conceptsMetaH4: "Universal metadata",
    conceptsMetaBody: <>Every 200 response includes a <code style={codeInline}>meta</code> object. It contains the server latency and a <code style={codeInline}>dataFreshness</code> mini-dictionary with the last update date of each data block, letting your client decide whether to invalidate its cache.</>,
    conceptsPagH4: "Pagination",
    conceptsPagBody: <>Listing endpoints support <code style={codeInline}>?limit</code> (default 50, max 200) and <code style={codeInline}>?offset</code> (default 0). The returned <code style={codeInline}>total</code> field allows paginating through all results.</>,
    conceptsTsH4: "Timestamp format",
    conceptsTsBody: <>All timestamps are in <strong>ISO 8601</strong> UTC (<code style={codeInline}>2026-04-20T18:32:11.123Z</code>).</>,
    conceptsNullH4: "Nullable fields",
    conceptsNullBody: <>A missing field in the database is serialised as <code style={codeInline}>null</code> (never omitted). This lets you distinguish between &quot;absent data&quot; and a field error.</>,
    conceptsBigIntH4: "BigInt (amounts)",
    conceptsBigIntBody: <>Fields like <code style={codeInline}>marketCap</code>,{" "}<code style={codeInline}>revenue</code>, <code style={codeInline}>totalAmount</code>{" "}can exceed JS float capacity (2<sup>53</sup>). They are returned as <em>numbers</em>, but for large totals (L&apos;Oréal at €195bn…) your client code should use BigInt if precision matters below €1.</>,
    endpointsEyebrow: "API Reference",
    endpointsTitle: "Endpoints",
    endpointsIntro: "14 endpoints, all read-only. Grouped by domain.",
    groupAuth: "Authentication",
    groupHealth: "Health & stats",
    groupCompanies: "Companies",
    groupInsiders: "Executives",
    groupDeclarations: "Filings",
    groupSignals: "Signals",
    groupBacktest: "Backtest",
    groupSearch: "Search",
    meSum: "Verify a key and retrieve identity",
    meDesc: "Returns the information of the key owner + metadata about the key itself. Use it as a ping to validate that a key is still active.",
    healthSum: "System status",
    healthDesc: "Pings the database (with measured latency), timestamps each pipeline stage. Useful for detecting a stopped hourly cron or scoring job.",
    healthH5: "Response (excerpt)",
    statsSum: "Global counters",
    statsDesc: "Total number of filings, companies, insiders, backtests, breakdowns by time window (24h / 7d / 30d), global average score.",
    companiesSum: "List companies",
    companiesDesc: "Returns filtered companies. 585 companies tracked in total.",
    companiesH5: "Response (truncated)",
    companyDetailSum: "Company detail (full fundamentals)",
    companyDetailDesc: "Returns the complete profile: income statement, balance sheet, valuation (P/E, P/B, beta), analyst consensus (reco, target mean/high/low), technicals (52-week, 50/200 DMA, dividend yield).",
    companyDetailCallout: <>Yahoo fields (<code style={codeInline}>trailingPE</code>, <code style={codeInline}>analystReco</code>, <code style={codeInline}>targetMean</code>…) may be <code style={codeInline}>null</code> for micro-caps not covered by analysts.</>,
    companyDeclSum: "AMF filings for a company",
    companyDeclDesc: "Complete transaction history of executives for a company, sorted by pubDate desc.",
    insidersSum: "List executives",
    insidersDesc: "2,091 executives tracked. Fuzzy name search.",
    insiderDetailSum: "Executive detail",
    insiderDetailDesc: "Profile + companies they are associated with and their role + average and max score of their filings.",
    insiderDeclSum: "Transaction history for an executive",
    insiderDeclDesc: "Complete trade chain, all companies combined, sorted by pubDate desc.",
    declsSum: "Advanced filing search",
    declsDesc: "General-purpose endpoint with 12 combinable filters. The main entry point for exporting a historical corpus or analysing by criterion.",
    declDetailSum: "Filing detail (with backtest)",
    declDetailDesc: "Complete object including the T+30/60/90/160/365/730 backtest if computed. Includes execution price, price at T+X and return %.",
    declDetailH5: "Backtest block excerpt",
    signalsSum: "Top signals (buys / sells)",
    signalsDesc: "Shortcut to get the best scores over a rolling window. Ideal for a dashboard or notification bot.",
    backtestSum: "Global backtest statistics",
    backtestDesc: "Average returns by horizon (T+30, T+60, T+90, T+160, T+365, T+730) and win rate at T+90. Filterable by direction / score / period.",
    backtestH5: "Sample response",
    searchSum: "Cross-entity search",
    searchDesc: "Fuzzy search across companies + executives in one call. Used by the site autocomplete.",
    dataModelEyebrow: "Schema",
    dataModelTitle: "Data model",
    dataModelIntro: <>Five main entities. Here are the fields exposed in the API (some internal fields such as indexes or technical timestamps are not included).</>,
    errorsEyebrow: "Errors",
    errorsTitle: "Error handling",
    errorsIntro: "All errors follow a uniform format (RFC-7807-like):",
    errorsH4: "Error codes",
    errorRows: [
      ["401", "missing_api_key", "No Authorization or X-Api-Key header"],
      ["401", "invalid_api_key", "Malformed, unknown, or revoked key. Banned user = same."],
      ["404", "company_not_found", "Non-existent company slug"],
      ["404", "insider_not_found", "Non-existent executive slug"],
      ["404", "declaration_not_found", "Non-existent amfId"],
      ["500", "internal_error", "Server error — please share the URL + time with us"],
    ] as [string, string, string][],
    errorsCallout: <>Retry any response ≥ 500 with exponential back-off (e.g. 1 s, 2 s, 4 s, max 5 attempts). Never retry 401 / 404.</>,
    errorsTableHeaders: ["Status", "Code", "When"],
    rateLimitsEyebrow: "Quotas",
    rateLimitsTitle: "Rate limits & best practices",
    rateLimitsIntro: "Default limits during the beta phase:",
    rateLimitsLi1: <><strong>5,000 requests / day</strong> per key (counter resets at 00:00 UTC).</>,
    rateLimitsLi2: <><strong>10 req/second</strong> (burst) · sufficient for most use cases.</>,
    rateLimitsLi3: <><strong>10 active keys maximum</strong> per account. Beyond that, revoke one from <Link href="/account/api-keys" style={linkGold}>your keys page</Link>.</>,
    rateLimitsLi4: <>Usage counters are visible in real-time by the user (total + today) and by the admin (with top consumers).</>,
    rateLimitsBPH4: "Best practices",
    rateLimitsBP1: <><strong>Respect freshness.</strong> Data doesn&apos;t change every second. Yahoo prices are refreshed 1×/day (4 AM UTC), AMF filings 1×/hour. Check <code style={codeInline}>meta.dataFreshness</code> to adapt your polling frequency.</>,
    rateLimitsBP2: <><strong>Cache aggressively.</strong> A company detail rarely changes — cache it client-side until <code style={codeInline}>priceAt + 1h</code>.</>,
    rateLimitsBP3: <><strong>Paginate correctly.</strong> Use a reasonable <code style={codeInline}>limit</code>{" "}(20–50) and <code style={codeInline}>offset</code> for large datasets.</>,
    rateLimitsBP4: <><strong>Retry 5xx.</strong> With exponential back-off, max 5 attempts.</>,
    rateLimitsBP5: <><strong>Store your key securely.</strong> Never in plain text in a Git repo, in the frontend, or in logs.</>,
    samplesEyebrow: "Examples",
    samplesTitle: "Code samples",
    samplesH4Top: "Fetch today's top signals",
    samplesH4Csv: "CSV export of all filings for a company",
    changelogEyebrow: "Versioning",
    changelogTitle: "Changelog",
    changelogLi1: "Public API launch.",
    changelogLi2: "14 endpoints, API key authentication, freshness metadata.",
    changelogLi3: <>Interactive Swagger UI available at <Link href="/api/docs" style={linkGold}>/api/docs</Link>.</>,
    supportEyebrow: "Support",
    supportTitle: "Help, feedback, SLA",
    supportBody: <>The API is in <strong>private beta</strong>. Access is by invitation. No contractual SLA is provided during the beta, but the team monitors data freshness daily (hourly AMF cron + daily Yahoo).</>,
    supportLi1: <><strong>Beta access request</strong> or <strong>quota increase</strong>: contact{" "}<a href="mailto:simon.azoulay.pro@gmail.com" style={linkGold}>simon.azoulay.pro@gmail.com</a>.</>,
    supportLi2: <><strong>Bug / anomaly</strong>: include the exact URL, the time (UTC), and the <code style={codeInline}>prefix</code> of the key used.</>,
    supportLi3: <><strong>Roadmap</strong>: POST endpoints for push notifications, webhooks on new signals, granular scopes.</>,
    supportCallout: <><strong>Ethical use.</strong> AMF data is public, but the rate limit also prevents overloading upstream servers (Yahoo Finance, BDIF). Abusive patterns result in immediate key revocation.</>,
    ctaH2: <>Ready to integrate <span style={{ fontStyle: "italic", color: "var(--gold)" }}>the insider signal</span>?</>,
    ctaBody: <>Generate a key in 10 seconds, copy the cURL example from the quickstart, and explore the endpoints live with Swagger.</>,
    ctaBtn1: "Generate my key →",
    ctaBtn2: "Open Swagger ↗",
    tocSections: [
      { id: "quickstart", label: "Quickstart" },
      { id: "auth", label: "Authentication" },
      { id: "concepts", label: "Key concepts" },
      {
        id: "endpoints", label: "Endpoints",
        children: [
          { id: "me",                     label: "GET /me" },
          { id: "health",                 label: "GET /health" },
          { id: "stats",                  label: "GET /stats" },
          { id: "companies-list",         label: "GET /companies" },
          { id: "company-detail",         label: "GET /companies/{slug}" },
          { id: "company-declarations",   label: "GET /companies/{slug}/declarations" },
          { id: "insiders-list",          label: "GET /insiders" },
          { id: "insider-detail",         label: "GET /insiders/{slug}" },
          { id: "insider-declarations",   label: "GET /insiders/{slug}/decls" },
          { id: "declarations-list",      label: "GET /declarations" },
          { id: "declaration-detail",     label: "GET /declarations/{amfId}" },
          { id: "signals",                label: "GET /signals" },
          { id: "backtest",               label: "GET /backtest" },
          { id: "search",                 label: "GET /search" },
        ],
      },
      { id: "data-model",  label: "Data model" },
      { id: "errors",      label: "Errors" },
      { id: "rate-limits", label: "Rate limits" },
      { id: "samples",     label: "Code samples" },
      { id: "changelog",   label: "Changelog" },
      { id: "support",     label: "Support" },
    ] as typeof TOC_SECTIONS,
  };

  return (
    <div className="content-wrapper" style={{ maxWidth: "1280px" }}>
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section
        style={{
          paddingTop: "24px",
          paddingBottom: "32px",
          textAlign: "center",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "18px" }}>
          <LogoMark size={48} />
        </div>
        <Eyebrow>API Reference · v1</Eyebrow>
        <h1
          style={{
            fontFamily: "var(--font-dm-serif), Georgia, serif",
            fontSize: "clamp(2rem, 5vw, 3.4rem)",
            fontWeight: 400,
            letterSpacing: "-0.015em",
            lineHeight: 1.05,
            color: "var(--tx-1)",
            marginBottom: "14px",
          }}
        >
          {T.heroH1}
        </h1>
        <p
          style={{
            fontSize: "clamp(0.95rem, 2vw, 1.1rem)",
            color: "var(--tx-2)",
            maxWidth: "720px",
            margin: "0 auto 22px",
            lineHeight: 1.65,
          }}
        >
          {T.heroBody}
        </p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/api/docs" style={btnGold}>{T.btnSwagger}</Link>
          <Link href="/docs/mcp" style={btnGhost}>{T.btnMcp}</Link>
          <Link href="/account/api-keys" style={btnGhost}>{T.btnApiKey}</Link>
          <Link href="/api/openapi.json" style={btnGhost}>{T.btnOpenApi}</Link>
        </div>
      </section>

      {/* ── TWO-COLUMN LAYOUT (TOC + content) ─────────────────────────────── */}
      <div className="docs-layout">
        {/* Sidebar TOC · desktop only */}
        <aside className="docs-sidebar">
          <TOC sections={T.tocSections} />
        </aside>

        {/* Main content */}
        <main className="docs-content">

          {/* ── QUICKSTART ──────────────────────────────────────────────── */}
          <Section id="quickstart" eyebrow={T.quickstartEyebrow} title={T.quickstartTitle}>
            <p style={pBody}>
              {T.quickstartIntro}
            </p>
            <ol
              style={{
                paddingLeft: "1.4em",
                margin: "12px 0 20px",
                fontSize: "0.95rem",
                color: "var(--tx-2)",
                lineHeight: 1.8,
              }}
            >
              <li>{T.quickstartStep1}</li>
              <li>{T.quickstartStep2}</li>
              <li>{T.quickstartStep3}</li>
            </ol>
            <CodeTabs
              tabs={[
                {
                  label: "cURL",
                  language: "bash",
                  code: `curl ${BASE_URL}/api/v1/me \\
  -H "Authorization: Bearer ${EX_KEY}"`,
                },
                {
                  label: "Node.js",
                  language: "javascript",
                  code: `const res = await fetch("${BASE_URL}/api/v1/me", {
  headers: { Authorization: "Bearer ${EX_KEY}" },
});
const { user, meta } = await res.json();
console.log(user.email, "latency:", meta.latencyMs, "ms");`,
                },
                {
                  label: "Python",
                  language: "python",
                  code: `import requests

r = requests.get(
    "${BASE_URL}/api/v1/me",
    headers={"Authorization": "Bearer ${EX_KEY}"},
    timeout=10,
)
r.raise_for_status()
print(r.json())`,
                },
              ]}
            />
          </Section>

          {/* ── AUTH ─────────────────────────────────────────────────────── */}
          <Section id="auth" eyebrow={T.authEyebrow} title={T.authTitle}>
            <p style={pBody}>{T.authBody}</p>
            <ul style={ulBody}>
              <li>{T.authLi1}</li>
              <li>{T.authLi2}</li>
            </ul>

            <Callout tone="warn">{T.authCallout}</Callout>

            <h4 style={h4}>{T.authKeyFormatH4}</h4>
            <CodeBlock
              language="text"
              code={isFr
                ? `sit_live_<32 caractères base62>\n\nExemple de préfixe visible (safe pour logs) : sit_live_Ab1C\nLa clé complète fait ~40 caractères. Stockée hashée (SHA-256) côté serveur,\njamais retrouvable en clair.`
                : `sit_live_<32 base62 characters>\n\nExample visible prefix (safe for logs): sit_live_Ab1C\nThe full key is ~40 characters. Stored hashed (SHA-256) server-side,\nnever retrievable in plain text.`}
            />

            <h4 style={h4}>{T.authInvalidH4}</h4>
            <p style={pBody}>{T.authInvalidBody}</p>
            <CodeBlock
              language="json"
              code={`{
  "error": {
    "code": "invalid_api_key",
    "message": "${isFr ? "Clé API invalide, inconnue ou révoquée. Générez une nouvelle clé depuis votre compte." : "Invalid, unknown or revoked API key. Generate a new key from your account."}",
    "status": 401
  }
}`}
            />
          </Section>

          {/* ── CONCEPTS ─────────────────────────────────────────────────── */}
          <Section id="concepts" eyebrow={T.conceptsEyebrow} title={T.conceptsTitle}>
            <h4 style={h4}>{T.conceptsBaseUrlH4}</h4>
            <CodeBlock language="text" code={BASE_URL} />

            <h4 style={h4}>{T.conceptsMetaH4}</h4>
            <p style={pBody}>{T.conceptsMetaBody}</p>
            <CodeBlock
              language="json"
              code={`{
  "items": [ /* ... */ ],
  "meta": {
    "requestedAt": "2026-04-20T18:32:11.123Z",
    "latencyMs": 47,
    "dataFreshness": {
      "priceAt":      "2026-04-20T16:01:45.120Z",
      "financialsAt": "2026-04-20T15:04:10.940Z"
    }
  }
}`}
            />

            <h4 style={h4}>{T.conceptsPagH4}</h4>
            <p style={pBody}>{T.conceptsPagBody}</p>

            <h4 style={h4}>{T.conceptsTsH4}</h4>
            <p style={pBody}>{T.conceptsTsBody}</p>

            <h4 style={h4}>{T.conceptsNullH4}</h4>
            <p style={pBody}>{T.conceptsNullBody}</p>

            <h4 style={h4}>{T.conceptsBigIntH4}</h4>
            <p style={pBody}>{T.conceptsBigIntBody}</p>
          </Section>

          {/* ── ENDPOINTS ───────────────────────────────────────────────── */}
          <Section id="endpoints" eyebrow={T.endpointsEyebrow} title={T.endpointsTitle}>
            <p style={pBody}>{T.endpointsIntro}</p>

            {/* Authentication group */}
            <GroupHeader id="auth-endpoints" label={T.groupAuth} />
            <Endpoint
              id="me"
              method="GET"
              path="/api/v1/me"
              summary={T.meSum}
              description={T.meDesc}
            >
              <CodeTabs
                tabs={[
                  { label: "cURL", language: "bash", code: `curl ${BASE_URL}/api/v1/me -H "Authorization: Bearer ${EX_KEY}"` },
                  { label: isFr ? "Réponse" : "Response", language: "json", code: `{
  "key": {
    "id":            "cm...",
    "name":          "Production bot",
    "prefix":        "sit_live_7dTu",
    "scopes":        "read",
    "totalRequests": 19
  },
  "user": {
    "id":        "cm...",
    "email":     "you@example.com",
    "firstName": "Simon",
    "lastName":  null,
    "role":      "user"
  },
  "meta": { "requestedAt": "...", "latencyMs": 670, "dataFreshness": { "now": "2026-04-20T..." } }
}` },
                ]}
              />
            </Endpoint>

            {/* Health group */}
            <GroupHeader id="health-endpoints" label={T.groupHealth} />
            <Endpoint
              id="health"
              method="GET"
              path="/api/v1/health"
              summary={T.healthSum}
              description={T.healthDesc}
            >
              <CodeBlock
                language="bash"
                code={`curl ${BASE_URL}/api/v1/health -H "Authorization: Bearer ${EX_KEY}"`}
              />
              <h5 style={h5}>{T.healthH5}</h5>
              <CodeBlock
                language="json"
                code={`{
  "status": "ok",
  "database":  { "reachable": true, "latencyMs": 187 },
  "lastAmfPublicationAt": "2026-04-20T16:20:03.577Z",
  "lastIngestAt":         "2026-04-20T16:59:53.841Z",
  "lastScoringAt":        "2026-04-20T17:59:59.061Z",
  "lastBacktestAt":       "2026-04-19T20:13:54.245Z",
  "lastFinancialsAt":     "2026-04-20T15:04:10.940Z",
  "lastPriceAt":          "2026-04-20T16:01:45.120Z"
}`}
              />
            </Endpoint>

            <Endpoint
              id="stats"
              method="GET"
              path="/api/v1/stats"
              summary={T.statsSum}
              description={T.statsDesc}
            >
              <CodeBlock
                language="bash"
                code={`curl ${BASE_URL}/api/v1/stats -H "Authorization: Bearer ${EX_KEY}"`}
              />
            </Endpoint>

            {/* Companies group */}
            <GroupHeader id="companies-endpoints" label={T.groupCompanies} />
            <Endpoint
              id="companies-list"
              method="GET"
              path="/api/v1/companies"
              summary={T.companiesSum}
              description={T.companiesDesc}
              queryParams={[
                { name: "q",       type: "string",  description: isFr ? "Recherche insensitive sur le nom" : "Case-insensitive name search" },
                { name: "isin",    type: "string",  description: isFr ? "Filtre exact par ISIN" : "Exact ISIN filter" },
                { name: "market",  type: "string",  description: isFr ? "Filtre marché (ex : Euronext Paris)" : "Market filter (e.g. Euronext Paris)" },
                { name: "hasLogo", type: "boolean", description: isFr ? "Ne retourne que celles avec (true) ou sans (false) logo" : "Return only companies with (true) or without (false) a logo" },
                { name: "sort",    type: "enum",    default: "name", description: "name | marketCap | recent" },
                { name: "order",   type: "enum",    default: "asc",  description: "asc | desc" },
                { name: "limit",   type: "integer", default: "50",   description: "1 → 200" },
                { name: "offset",  type: "integer", default: "0",    description: isFr ? "Pagination" : "Pagination offset" },
              ]}
            >
              <CodeBlock
                language="bash"
                code={`curl "${BASE_URL}/api/v1/companies?q=lvmh&limit=3" \\
  -H "Authorization: Bearer ${EX_KEY}"`}
              />
              <h5 style={h5}>{T.companiesH5}</h5>
              <CodeBlock
                language="json"
                code={`{
  "total": 585, "offset": 0, "limit": 3,
  "items": [
    {
      "name":              "LVMH MOET HENNESSY-LOUIS VUITTON",
      "slug":              "lvmh-moet-hennessy-louis-vuitton-0042",
      "isin":              "FR0000121014",
      "market":            "Euronext Paris",
      "yahooSymbol":       "MC.PA",
      "marketCap":         320200000000,
      "currentPrice":      643.40,
      "trailingPE":        22.43,
      "analystReco":       "buy",
      "targetMean":        595.72,
      "logoUrl":           "https://.../lvmh.webp",
      "declarationsCount": 147,
      "priceAt":           "2026-04-20T16:01:45.120Z",
      "financialsAt":      "2026-04-20T15:04:10.940Z"
    }
  ],
  "meta": { "requestedAt": "...", "latencyMs": 650, "dataFreshness": { ... } }
}`}
              />
            </Endpoint>

            <Endpoint
              id="company-detail"
              method="GET"
              path="/api/v1/companies/{slug}"
              summary={T.companyDetailSum}
              description={T.companyDetailDesc}
              pathParams={[{ name: "slug", type: "string", required: true, description: isFr ? "Identifiant URL unique de la société (présent dans la liste)" : "Unique URL identifier for the company (present in the list)" }]}
            >
              <CodeBlock
                language="bash"
                code={`curl ${BASE_URL}/api/v1/companies/bouygues-1454 \\
  -H "Authorization: Bearer ${EX_KEY}"`}
              />
              <Callout tone="info">{T.companyDetailCallout}</Callout>
            </Endpoint>

            <Endpoint
              id="company-declarations"
              method="GET"
              path="/api/v1/companies/{slug}/declarations"
              summary={T.companyDeclSum}
              description={T.companyDeclDesc}
              pathParams={[{ name: "slug", type: "string", required: true, description: isFr ? "Slug société" : "Company slug" }]}
              queryParams={[
                { name: "direction", type: "enum",    description: isFr ? "BUY | SELL (défaut: toutes)" : "BUY | SELL (default: all)" },
                { name: "minScore",  type: "number",  description: isFr ? "Seuil signalScore" : "signalScore threshold" },
                { name: "limit",     type: "integer", default: "50", description: "1 → 200" },
                { name: "offset",    type: "integer", default: "0",  description: isFr ? "Pagination" : "Pagination offset" },
              ]}
            >
              <CodeBlock
                language="bash"
                code={`curl "${BASE_URL}/api/v1/companies/bouygues-1454/declarations?direction=BUY&minScore=40&limit=5" \\
  -H "Authorization: Bearer ${EX_KEY}"`}
              />
            </Endpoint>

            {/* Insiders group */}
            <GroupHeader id="insiders-endpoints" label={T.groupInsiders} />
            <Endpoint
              id="insiders-list"
              method="GET"
              path="/api/v1/insiders"
              summary={T.insidersSum}
              description={T.insidersDesc}
              queryParams={[
                { name: "q",      type: "string",  description: isFr ? "Recherche insensitive sur le nom" : "Case-insensitive name search" },
                { name: "limit",  type: "integer", default: "50", description: "1 → 200" },
                { name: "offset", type: "integer", default: "0",  description: isFr ? "Pagination" : "Pagination offset" },
              ]}
            >
              <CodeBlock
                language="bash"
                code={`curl "${BASE_URL}/api/v1/insiders?q=arnault&limit=5" \\
  -H "Authorization: Bearer ${EX_KEY}"`}
              />
            </Endpoint>

            <Endpoint
              id="insider-detail"
              method="GET"
              path="/api/v1/insiders/{slug}"
              summary={T.insiderDetailSum}
              description={T.insiderDetailDesc}
              pathParams={[{ name: "slug", type: "string", required: true, description: isFr ? "Slug dirigeant" : "Executive slug" }]}
            >
              <CodeBlock
                language="bash"
                code={`curl ${BASE_URL}/api/v1/insiders/bernard-arnault \\
  -H "Authorization: Bearer ${EX_KEY}"`}
              />
            </Endpoint>

            <Endpoint
              id="insider-declarations"
              method="GET"
              path="/api/v1/insiders/{slug}/declarations"
              summary={T.insiderDeclSum}
              description={T.insiderDeclDesc}
              pathParams={[{ name: "slug", type: "string", required: true, description: isFr ? "Slug dirigeant" : "Executive slug" }]}
              queryParams={[
                { name: "limit",  type: "integer", default: "50", description: "Max 200" },
                { name: "offset", type: "integer", default: "0",  description: isFr ? "Pagination" : "Pagination offset" },
              ]}
            >
              <CodeBlock
                language="bash"
                code={`curl ${BASE_URL}/api/v1/insiders/bernard-arnault/declarations \\
  -H "Authorization: Bearer ${EX_KEY}"`}
              />
            </Endpoint>

            {/* Declarations group */}
            <GroupHeader id="declarations-endpoints" label={T.groupDeclarations} />
            <Endpoint
              id="declarations-list"
              method="GET"
              path="/api/v1/declarations"
              summary={T.declsSum}
              description={T.declsDesc}
              queryParams={[
                { name: "from",      type: "ISO date", description: isFr ? "Filtre pubDate >= from" : "Filter pubDate >= from" },
                { name: "to",        type: "ISO date", description: isFr ? "Filtre pubDate <= to" : "Filter pubDate <= to" },
                { name: "minScore",  type: "number",   description: isFr ? "Seuil signalScore minimum" : "Minimum signalScore threshold" },
                { name: "maxScore",  type: "number",   description: isFr ? "Seuil signalScore maximum" : "Maximum signalScore threshold" },
                { name: "direction", type: "enum",     description: "BUY | SELL" },
                { name: "cluster",   type: "boolean",  description: isFr ? "true = uniquement trades groupés" : "true = cluster trades only" },
                { name: "minAmount", type: "number",   description: isFr ? "Montant minimum en €" : "Minimum amount in €" },
                { name: "company",   type: "string",   description: isFr ? "Recherche nom société" : "Company name search" },
                { name: "insider",   type: "string",   description: isFr ? "Recherche nom dirigeant" : "Executive name search" },
                { name: "isin",      type: "string",   description: isFr ? "Filtre ISIN exact" : "Exact ISIN filter" },
                { name: "sort",      type: "enum",     default: "pubDate", description: "pubDate | signalScore | amount" },
                { name: "order",     type: "enum",     default: "desc",    description: "asc | desc" },
                { name: "limit",     type: "integer",  default: "50",      description: "1 → 200" },
                { name: "offset",    type: "integer",  default: "0",       description: isFr ? "Pagination" : "Pagination offset" },
              ]}
            >
              <CodeBlock
                language="bash"
                code={`# ${isFr ? "Top 20 signaux d'achat avec score v3 ≥ 50 (conviction élevée) sur 30 derniers jours" : "Top 20 buy signals with v3 score ≥ 50 (high conviction) over the last 30 days"}
curl "${BASE_URL}/api/v1/declarations?direction=BUY&minScore=50&from=2026-03-20&sort=signalScore&order=desc&limit=20" \\
  -H "Authorization: Bearer ${EX_KEY}"`}
              />
            </Endpoint>

            <Endpoint
              id="declaration-detail"
              method="GET"
              path="/api/v1/declarations/{amfId}"
              summary={T.declDetailSum}
              description={T.declDetailDesc}
              pathParams={[{ name: "amfId", type: "string", required: true, description: isFr ? "Identifiant AMF (ex: 2026DD1108988)" : "AMF identifier (e.g. 2026DD1108988)" }]}
            >
              <CodeBlock
                language="bash"
                code={`curl ${BASE_URL}/api/v1/declarations/2026DD1108988 \\
  -H "Authorization: Bearer ${EX_KEY}"`}
              />
              <h5 style={h5}>{T.declDetailH5}</h5>
              <CodeBlock
                language="json"
                code={`"backtest": {
  "direction":    "BUY",
  "priceAtTrade": 32.45,
  "price30d":     33.80,
  "price90d":     35.12,
  "price365d":    38.90,
  "return30d":    4.16,
  "return90d":    8.23,
  "return365d":   19.88,
  "computedAt":   "2026-04-19T20:13:54.245Z"
}`}
              />
            </Endpoint>

            {/* Signals group */}
            <GroupHeader id="signals-endpoints" label={T.groupSignals} />
            <Endpoint
              id="signals"
              method="GET"
              path="/api/v1/signals"
              summary={T.signalsSum}
              description={T.signalsDesc}
              queryParams={[
                { name: "direction",    type: "enum",    default: "BUY", description: "BUY | SELL" },
                { name: "lookbackDays", type: "integer", default: "7",   description: isFr ? "Fenêtre (1 → 90)" : "Window (1 → 90)" },
                { name: "minScore",     type: "integer", default: "40",  description: isFr ? "Score minimum (0 → 100)" : "Minimum score (0 → 100)" },
                { name: "limit",        type: "integer", default: "20",  description: "Max 100" },
              ]}
            >
              <CodeBlock
                language="bash"
                code={`curl "${BASE_URL}/api/v1/signals?direction=BUY&minScore=50&lookbackDays=7&limit=5" \\
  -H "Authorization: Bearer ${EX_KEY}"`}
              />
            </Endpoint>

            {/* Backtest group */}
            <GroupHeader id="backtest-endpoints" label={T.groupBacktest} />
            <Endpoint
              id="backtest"
              method="GET"
              path="/api/v1/backtest"
              summary={T.backtestSum}
              description={T.backtestDesc}
              queryParams={[
                { name: "direction", type: "enum",    description: isFr ? "BUY | SELL (défaut : les deux)" : "BUY | SELL (default: both)" },
                { name: "minScore",  type: "number",  description: isFr ? "Filtre sur signalScore de la déclaration sous-jacente" : "Filter on the underlying declaration's signalScore" },
                { name: "from",      type: "ISO",     description: isFr ? "Filtre pubDate >= from" : "Filter pubDate >= from" },
                { name: "to",        type: "ISO",     description: isFr ? "Filtre pubDate <= to" : "Filter pubDate <= to" },
              ]}
            >
              <CodeBlock
                language="bash"
                code={`curl "${BASE_URL}/api/v1/backtest?direction=BUY&minScore=50" \\
  -H "Authorization: Bearer ${EX_KEY}"`}
              />
              <h5 style={h5}>{T.backtestH5}</h5>
              <CodeBlock
                language="json"
                code={`{
  "filters": { "direction": "BUY", "minScore": "50", "from": null, "to": null },
  "total":   2 340,
  "byDirection": { "BUY": 2340 },
  "averageReturnsPct": {
    "T30":  1.24, "T60":  2.88, "T90":  4.62,
    "T160": 6.10, "T365": 9.85, "T730": 13.40
  },
  "sampleCounts": {
    "T30":  2340, "T60":  2320, "T90":  2290,
    "T160": 2180, "T365": 1940, "T730": 1620
  },
  "winRates90d": { "BUY": 0.582, "SELL": null }
}`}
              />
            </Endpoint>

            {/* Search group */}
            <GroupHeader id="search-endpoints" label={T.groupSearch} />
            <Endpoint
              id="search"
              method="GET"
              path="/api/v1/search"
              summary={T.searchSum}
              description={T.searchDesc}
              queryParams={[
                { name: "q",     type: "string",  required: true, description: isFr ? "Requête (min 2 caractères)" : "Query (min 2 characters)" },
                { name: "limit", type: "integer", default: "8",   description: isFr ? "Max par bucket (1 → 50)" : "Max per bucket (1 → 50)" },
              ]}
            >
              <CodeBlock
                language="bash"
                code={`curl "${BASE_URL}/api/v1/search?q=total" \\
  -H "Authorization: Bearer ${EX_KEY}"`}
              />
            </Endpoint>
          </Section>

          {/* ── DATA MODEL ──────────────────────────────────────────────── */}
          <Section id="data-model" eyebrow={T.dataModelEyebrow} title={T.dataModelTitle}>
            <p style={pBody}>{T.dataModelIntro}</p>

            <h4 style={h4}>Company</h4>
            <EntityCard
              color="var(--gold)"
              rows={[
                ["slug", "string", isFr ? "Identifiant URL, ex: bouygues-1454" : "URL identifier, e.g. bouygues-1454"],
                ["name", "string", isFr ? "Raison sociale (source AMF)" : "Company name (AMF source)"],
                ["isin", "string | null", "International Securities ID Number"],
                ["market", "string | null", isFr ? "Ex: Euronext Paris" : "E.g. Euronext Paris"],
                ["yahooSymbol", "string | null", isFr ? "Ticker Yahoo pour prix / fondamentaux" : "Yahoo ticker for prices / fundamentals"],
                ["marketCap", "number | null", isFr ? "Capitalisation en €" : "Market capitalisation in €"],
                ["currentPrice", "number | null", isFr ? "Dernier cours connu" : "Latest known price"],
                ["trailingPE, forwardPE, priceToBook, beta", "number | null", isFr ? "Valorisation Yahoo" : "Yahoo valuation metrics"],
                ["analystReco, analystScore, targetMean, targetHigh, targetLow", "mixed", isFr ? "Consensus analystes" : "Analyst consensus"],
                ["dividendYield, fiftyTwoWeekHigh/Low, fiftyDayAverage, twoHundredDayAverage", "number | null", "Technicals"],
                ["logoUrl", "string | null", "CDN Vercel Blob"],
                ["priceAt, financialsAt, analystAt", "ISO date-time", isFr ? "Fraîcheur par bloc" : "Freshness per data block"],
              ]}
            />

            <h4 style={h4}>Insider</h4>
            <EntityCard
              color="var(--c-indigo-2)"
              rows={[
                ["slug", "string", isFr ? "Identifiant URL" : "URL identifier"],
                ["name", "string", isFr ? "Nom du dirigeant (source AMF)" : "Executive name (AMF source)"],
                ["gender", "string | null", isFr ? "M / F inféré par IA" : "M / F inferred by AI"],
                ["declarationsCount", "integer", isFr ? "Nombre de transactions totales" : "Total number of transactions"],
                ["companies", "Company[]", isFr ? "Sociétés liées avec fonction occupée" : "Associated companies with held role"],
              ]}
            />

            <h4 style={h4}>Declaration</h4>
            <EntityCard
              color="var(--c-emerald)"
              rows={[
                ["amfId", "string", isFr ? "Identifiant AMF unique (ex: 2026DD1108988)" : "Unique AMF identifier (e.g. 2026DD1108988)"],
                ["pubDate", "ISO date-time", isFr ? "Date publication AMF" : "AMF publication date"],
                ["transactionDate", "ISO date-time | null", isFr ? "Date effective de la transaction" : "Effective transaction date"],
                ["pdfUrl", "string", isFr ? "Lien vers le PDF officiel AMF" : "Link to official AMF PDF"],
                ["transaction", "object", "nature, instrument, isin, unitPrice, volume, totalAmount, currency, venue"],
                ["insider", "object", "name, slug, function"],
                ["company", "object", "name, slug, yahooSymbol, marketCap"],
                ["signal", "object", "score (0-100), pctOfMarketCap, pctOfInsiderFlow, insiderCumNet, isCluster, scoredAt"],
              ]}
            />

            <h4 style={h4}>{isFr ? "BacktestResult (imbriqué dans Declaration.backtest)" : "BacktestResult (nested in Declaration.backtest)"}</h4>
            <EntityCard
              color="var(--c-violet)"
              rows={[
                ["direction", "string", "BUY | SELL | OTHER"],
                ["priceAtTrade", "number | null", isFr ? "Prix d'exécution (cours Yahoo le plus proche)" : "Execution price (nearest Yahoo price)"],
                ["price30d / price60d / price90d / price160d / price365d / price730d", "number | null", isFr ? "Cours aux 6 horizons" : "Price at 6 horizons"],
                ["return30d / return60d / return90d / return160d / return365d / return730d", "number | null", isFr ? "Retour % correspondant" : "Corresponding % return"],
                ["computedAt", "ISO date-time", isFr ? "Quand le calcul a eu lieu" : "When the computation ran"],
              ]}
            />

            <h4 style={h4}>{isFr ? "Signal (composant de scoring v3, calculé à la volée)" : "Signal (v3 scoring component, computed on the fly)"}</h4>
            <EntityCard
              color="var(--gold)"
              rows={[
                ["score", "number (0-100)", isFr ? "Score composite v3 (10 composantes · voir /methodologie)" : "v3 composite score (10 components · see /methodologie)"],
                ["pctOfMarketCap", "number | null", isFr ? "Ratio montant / capitalisation (%)" : "Amount / market cap ratio (%)"],
                ["pctOfInsiderFlow", "number | null", isFr ? "Part dans le flux total du dirigeant" : "Share of the executive's total flow"],
                ["insiderCumNet", "number | null", isFr ? "Net cumulé (buy - sell) jusqu'au trade" : "Cumulative net (buy - sell) up to this trade"],
                ["isCluster", "boolean", isFr ? "≥ 2 dirigeants dans le MÊME sens ±30j (directionnel v3)" : "≥ 2 executives in the SAME direction ±30d (v3 directional)"],
              ]}
            />
          </Section>

          {/* ── ERRORS ──────────────────────────────────────────────────── */}
          <Section id="errors" eyebrow={T.errorsEyebrow} title={T.errorsTitle}>
            <p style={pBody}>{T.errorsIntro}</p>
            <CodeBlock
              language="json"
              code={`{
  "error": {
    "code":    "<machine_readable_slug>",
    "message": "${isFr ? "<human-readable French description>" : "<human-readable description>"}",
    "status":  <http_status>
  }
}`}
            />
            <h4 style={h4}>{T.errorsH4}</h4>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {T.errorsTableHeaders.map((h) => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {T.errorRows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={td}><code style={codeInline}>{r[0]}</code></td>
                      <td style={td}><code style={codeInline}>{r[1]}</code></td>
                      <td style={td}>{r[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Callout tone="info">{T.errorsCallout}</Callout>
          </Section>

          {/* ── RATE LIMITS ─────────────────────────────────────────────── */}
          <Section id="rate-limits" eyebrow={T.rateLimitsEyebrow} title={T.rateLimitsTitle}>
            <p style={pBody}>{T.rateLimitsIntro}</p>
            <ul style={ulBody}>
              <li>{T.rateLimitsLi1}</li>
              <li>{T.rateLimitsLi2}</li>
              <li>{T.rateLimitsLi3}</li>
              <li>{T.rateLimitsLi4}</li>
            </ul>
            <h4 style={h4}>{T.rateLimitsBPH4}</h4>
            <ul style={ulBody}>
              <li>{T.rateLimitsBP1}</li>
              <li>{T.rateLimitsBP2}</li>
              <li>{T.rateLimitsBP3}</li>
              <li>{T.rateLimitsBP4}</li>
              <li>{T.rateLimitsBP5}</li>
            </ul>
          </Section>

          {/* ── CODE SAMPLES ────────────────────────────────────────────── */}
          <Section id="samples" eyebrow={T.samplesEyebrow} title={T.samplesTitle}>
            <h4 style={h4}>{T.samplesH4Top}</h4>
            <CodeTabs
              tabs={[
                {
                  label: "Node.js",
                  language: "javascript",
                  code: `const API = "${BASE_URL}";
const KEY = process.env.INSIDERS_API_KEY;

async function topSignals(direction = "BUY", days = 1) {
  const url = new URL(API + "/api/v1/signals");
  url.searchParams.set("direction", direction);
  url.searchParams.set("lookbackDays", String(days));
  url.searchParams.set("minScore", "50");
  url.searchParams.set("limit", "10");

  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + KEY },
  });
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  const { items, meta } = await res.json();

  console.log(\`\${items.length} signals · latency \${meta.latencyMs}ms\`);
  for (const s of items) {
    console.log(
      \`[\${s.signal.score}] \${s.company.name.padEnd(32)} \${s.insider.name} · \${s.transaction.amount}€\`
    );
  }
}

topSignals();`,
                },
                {
                  label: "Python",
                  language: "python",
                  code: `import os, requests

API = "${BASE_URL}"
KEY = os.environ["INSIDERS_API_KEY"]

def top_signals(direction="BUY", days=1):
    r = requests.get(
        f"{API}/api/v1/signals",
        params={"direction": direction, "lookbackDays": days,
                "minScore": 50, "limit": 10},
        headers={"Authorization": f"Bearer {KEY}"},
        timeout=15,
    )
    r.raise_for_status()
    data = r.json()
    print(f"{len(data['items'])} signals · latency {data['meta']['latencyMs']}ms")
    for s in data["items"]:
        print(f"[{s['signal']['score']}] {s['company']['name']:32} "
              f"{s['insider']['name']} · {s['transaction']['amount']}€")

if __name__ == "__main__":
    top_signals()`,
                },
                {
                  label: "cURL",
                  language: "bash",
                  code: `curl -sS "${BASE_URL}/api/v1/signals?direction=BUY&minScore=50&limit=10" \\
  -H "Authorization: Bearer $INSIDERS_API_KEY" \\
  | jq '.items[] | "\\(.signal.score) \\(.company.name) \\(.insider.name)"'`,
                },
              ]}
            />

            <h4 style={h4}>{T.samplesH4Csv}</h4>
            <CodeTabs
              tabs={[
                {
                  label: "Python",
                  language: "python",
                  code: `import csv, os, requests

API = "${BASE_URL}"
KEY = os.environ["INSIDERS_API_KEY"]

def fetch_all(slug):
    items, offset = [], 0
    while True:
        r = requests.get(
            f"{API}/api/v1/companies/{slug}/declarations",
            params={"limit": 100, "offset": offset},
            headers={"Authorization": f"Bearer {KEY}"},
        )
        r.raise_for_status()
        page = r.json()
        items.extend(page["items"])
        if offset + 100 >= page["total"]:
            break
        offset += 100
    return items

with open("bouygues_declarations.csv", "w", newline="") as f:
    rows = fetch_all("bouygues-1454")
    w = csv.writer(f)
    w.writerow(["pubDate", "insider", "role", "nature",
                "isin", "unitPrice", "volume", "amount", "score"])
    for d in rows:
        w.writerow([
            d["pubDate"],
            d["insider"]["name"],
            d["insider"]["function"],
            d["transaction"]["nature"],
            d["transaction"]["isin"],
            d["transaction"]["unitPrice"],
            d["transaction"]["volume"],
            d["transaction"]["totalAmount"],
            d["signal"]["score"],
        ])
print(f"Wrote {len(rows)} rows")`,
                },
                {
                  label: "Node.js",
                  language: "javascript",
                  code: `import fs from "node:fs";

const API = "${BASE_URL}";
const KEY = process.env.INSIDERS_API_KEY;

async function fetchAll(slug) {
  let items = [], offset = 0;
  while (true) {
    const url = new URL(\`\${API}/api/v1/companies/\${slug}/declarations\`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("offset", String(offset));
    const r = await fetch(url, { headers: { Authorization: \`Bearer \${KEY}\` } });
    const page = await r.json();
    items.push(...page.items);
    if (offset + 100 >= page.total) break;
    offset += 100;
  }
  return items;
}

const rows = await fetchAll("bouygues-1454");
const csv = [
  "pubDate,insider,role,nature,isin,unitPrice,volume,amount,score",
  ...rows.map((d) => [
    d.pubDate,
    d.insider.name,
    d.insider.function,
    d.transaction.nature,
    d.transaction.isin,
    d.transaction.unitPrice,
    d.transaction.volume,
    d.transaction.totalAmount,
    d.signal.score,
  ].map((v) => JSON.stringify(v ?? "")).join(",")),
].join("\\n");
fs.writeFileSync("bouygues_declarations.csv", csv);
console.log(\`Wrote \${rows.length} rows\`);`,
                },
              ]}
            />
          </Section>

          {/* ── CHANGELOG ────────────────────────────────────────────────── */}
          <Section id="changelog" eyebrow={T.changelogEyebrow} title={T.changelogTitle}>
            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-med)",
                borderLeft: "3px solid var(--gold)",
                borderRadius: "3px",
                padding: "14px 18px",
                fontSize: "0.88rem",
                color: "var(--tx-2)",
                lineHeight: 1.75,
              }}
            >
              <div style={{ marginBottom: "10px" }}>
                <strong style={{ color: "var(--tx-1)" }}>v1.0.0</strong>{" "}
                <span style={{ color: "var(--tx-3)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.76rem" }}>
                  · 2026-04-20
                </span>
              </div>
              <ul style={{ margin: 0, paddingLeft: "1.3em" }}>
                <li>{T.changelogLi1}</li>
                <li>{T.changelogLi2}</li>
                <li>{T.changelogLi3}</li>
              </ul>
            </div>
          </Section>

          {/* ── SUPPORT ─────────────────────────────────────────────────── */}
          <Section id="support" eyebrow={T.supportEyebrow} title={T.supportTitle}>
            <p style={pBody}>{T.supportBody}</p>
            <ul style={ulBody}>
              <li>{T.supportLi1}</li>
              <li>{T.supportLi2}</li>
              <li>{T.supportLi3}</li>
            </ul>
            <Callout tone="warn">{T.supportCallout}</Callout>
          </Section>

          {/* ── FINAL CTA ───────────────────────────────────────────────── */}
          <section
            className="docs-cta"
            style={{
              marginTop: "60px",
              padding: "40px 32px",
              textAlign: "center",
              background: "linear-gradient(135deg, var(--corporate-bg) 0%, var(--gold-bg) 100%)",
              border: "1px solid var(--corporate-bd)",
              borderRadius: "3px",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-dm-serif), Georgia, serif",
                fontSize: "clamp(1.6rem, 3.5vw, 2.2rem)",
                fontWeight: 400,
                letterSpacing: "-0.012em",
                color: "var(--tx-1)",
                marginBottom: "12px",
                lineHeight: 1.15,
              }}
            >
              {T.ctaH2}
            </h2>
            <p
              style={{
                fontSize: "0.98rem",
                color: "var(--tx-2)",
                maxWidth: "520px",
                margin: "0 auto 22px",
                lineHeight: 1.6,
              }}
            >
              {T.ctaBody}
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/account/api-keys" style={btnGold}>{T.ctaBtn1}</Link>
              <Link href="/api/docs" style={btnGhost}>{T.ctaBtn2}</Link>
            </div>
          </section>
        </main>
      </div>

      {/* Layout CSS */}
      <style>{`
        .docs-layout {
          display: grid;
          grid-template-columns: 240px minmax(0, 1fr);
          gap: 48px;
          margin-top: 28px;
        }
        .docs-sidebar {
          position: relative;
          font-size: 0.85rem;
        }
        @media (max-width: 960px) {
          .docs-layout { grid-template-columns: 1fr; gap: 20px; }
          .docs-sidebar { display: none; }
        }
        @media (max-width: 640px) {
          .docs-cta { padding: 24px 16px !important; }
        }
        .docs-content h4 { scroll-margin-top: 90px; }
      `}</style>
    </div>
  );
}

// ── TOC structure ───────────────────────────────────────────────────────────

const TOC_SECTIONS = [
  { id: "quickstart", label: "Quickstart" },
  { id: "auth", label: "Authentification" },
  { id: "concepts", label: "Concepts clés" },
  {
    id: "endpoints",
    label: "Endpoints",
    children: [
      { id: "me",                     label: "GET /me" },
      { id: "health",                 label: "GET /health" },
      { id: "stats",                  label: "GET /stats" },
      { id: "companies-list",         label: "GET /companies" },
      { id: "company-detail",         label: "GET /companies/{slug}" },
      { id: "company-declarations",   label: "GET /companies/{slug}/declarations" },
      { id: "insiders-list",          label: "GET /insiders" },
      { id: "insider-detail",         label: "GET /insiders/{slug}" },
      { id: "insider-declarations",   label: "GET /insiders/{slug}/decls" },
      { id: "declarations-list",      label: "GET /declarations" },
      { id: "declaration-detail",     label: "GET /declarations/{amfId}" },
      { id: "signals",                label: "GET /signals" },
      { id: "backtest",               label: "GET /backtest" },
      { id: "search",                 label: "GET /search" },
    ],
  },
  { id: "data-model",  label: "Modèle de données" },
  { id: "errors",      label: "Erreurs" },
  { id: "rate-limits", label: "Rate limits" },
  { id: "samples",     label: "Code samples" },
  { id: "changelog",   label: "Changelog" },
  { id: "support",     label: "Support" },
];

// ── Layout primitives ───────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "0.66rem",
        fontWeight: 700,
        color: "var(--gold)",
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        marginBottom: "10px",
      }}
    >
      {children}
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      style={{
        paddingTop: "40px",
        paddingBottom: "12px",
        scrollMarginTop: "80px",
      }}
    >
      <div style={{ marginBottom: "18px", borderBottom: "1px solid var(--border)", paddingBottom: "10px" }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2
          style={{
            fontFamily: "var(--font-dm-serif), Georgia, serif",
            fontSize: "clamp(1.6rem, 3.5vw, 2.2rem)",
            fontWeight: 400,
            letterSpacing: "-0.012em",
            color: "var(--tx-1)",
            lineHeight: 1.2,
          }}
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function GroupHeader({ id, label }: { id: string; label: string }) {
  return (
    <div
      id={id}
      style={{
        marginTop: "28px",
        marginBottom: "6px",
        paddingBottom: "6px",
        borderBottom: "1px dashed var(--border-med)",
        scrollMarginTop: "80px",
      }}
    >
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.68rem",
          fontWeight: 700,
          color: "var(--gold)",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        ── {label}
      </span>
    </div>
  );
}

function Callout({
  tone,
  children,
}: {
  tone: "info" | "warn" | "danger";
  children: React.ReactNode;
}) {
  const colors = {
    info:   { bd: "var(--c-indigo-2)", bg: "rgba(23,48,92,0.05)" },
    warn:   { bd: "var(--gold)",       bg: "var(--gold-bg)" },
    danger: { bd: "var(--c-crimson)",  bg: "var(--c-crimson-bg)" },
  }[tone];
  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.bd}`,
        borderLeft: `3px solid ${colors.bd}`,
        padding: "12px 16px",
        borderRadius: "3px",
        margin: "14px 0",
        fontSize: "0.88rem",
        color: "var(--tx-2)",
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}

function EntityCard({
  color,
  rows,
}: {
  color: string;
  rows: [string, string, string][];
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-med)",
        borderLeft: `3px solid ${color}`,
        borderRadius: "3px",
        marginBottom: "14px",
        overflowX: "auto",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", minWidth: "480px" }}>
        <tbody>
          {rows.map(([field, type, desc], i) => (
            <tr key={i} style={{ borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--border)" }}>
              <td style={{ padding: "8px 12px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.82rem", color: "var(--tx-1)", fontWeight: 600 }}>
                  {field}
                </code>
              </td>
              <td style={{ padding: "8px 12px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem", color: "var(--gold)" }}>
                  {type}
                </code>
              </td>
              <td style={{ padding: "8px 12px", color: "var(--tx-2)", lineHeight: 1.55 }}>
                {desc}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Inline styles (reused across the page) ──────────────────────────────────

const pBody: React.CSSProperties = {
  fontSize: "0.95rem",
  color: "var(--tx-2)",
  lineHeight: 1.7,
  marginBottom: "12px",
};
const ulBody: React.CSSProperties = {
  paddingLeft: "1.3em",
  margin: "10px 0 16px",
  fontSize: "0.92rem",
  color: "var(--tx-2)",
  lineHeight: 1.85,
};
const h4: React.CSSProperties = {
  fontFamily: "var(--font-dm-serif), Georgia, serif",
  fontSize: "1.2rem",
  fontWeight: 400,
  letterSpacing: "-0.01em",
  color: "var(--tx-1)",
  marginTop: "22px",
  marginBottom: "10px",
};
const h5: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "var(--tx-3)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  marginTop: "14px",
  marginBottom: "6px",
};
const codeInline: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: "0.82em",
  background: "var(--bg-raised)",
  padding: "1px 6px",
  borderRadius: "2px",
  color: "var(--gold)",
  border: "1px solid var(--border)",
};
const linkGold: React.CSSProperties = {
  color: "var(--gold)",
  fontWeight: 600,
  textDecoration: "underline",
  textUnderlineOffset: "2px",
};
const btnGold: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", minHeight: "44px",
  padding: "12px 22px",
  background: "var(--gold)",
  color: "#0A0C10",
  fontWeight: 700,
  fontSize: "0.9rem",
  borderRadius: "3px",
  textDecoration: "none",
  letterSpacing: "0.01em",
  boxShadow: "0 4px 16px rgba(184,149,90,0.30)",
};
const btnGhost: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", minHeight: "44px",
  padding: "12px 22px",
  border: "1px solid var(--border-strong)",
  color: "var(--tx-2)",
  fontWeight: 600,
  fontSize: "0.9rem",
  borderRadius: "3px",
  textDecoration: "none",
  letterSpacing: "0.01em",
  background: "transparent",
};
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.88rem",
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "3px",
  overflow: "hidden",
};
const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontSize: "0.66rem",
  fontWeight: 700,
  color: "var(--tx-3)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  background: "var(--bg-raised)",
  borderBottom: "1px solid var(--border-med)",
  fontFamily: "'JetBrains Mono', monospace",
};
const td: React.CSSProperties = {
  padding: "8px 12px",
  color: "var(--tx-2)",
  verticalAlign: "top",
};

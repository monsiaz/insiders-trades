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
import { LogoMark } from "@/components/Logo";
import { Endpoint, MethodBadge } from "./_components/Endpoint";
import { CodeBlock, CodeTabs } from "./_components/CodeBlock";
import { TOC } from "./_components/TOC";

export const revalidate = 3600;

export const metadata = {
  title: "Documentation API · Insiders Trades Sigma",
  description:
    "Référence complète de l'API REST publique d'Insiders Trades Sigma : déclarations AMF, signaux scorés, backtests, fondamentaux Yahoo. Exemples en cURL, Python, JavaScript.",
};

// ── Constants used across examples ───────────────────────────────────────────

const BASE_URL = "https://insiders-trades-sigma.vercel.app";
const EX_KEY = "sit_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

// ═══════════════════════════════════════════════════════════════════════════════

export default function DocsPage() {
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
          Documentation <span style={{ fontStyle: "italic", color: "var(--gold)" }}>API</span>
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
          Accès programmatique à toutes les données publiques AMF enrichies :
          déclarations de dirigeants, signaux scorés, backtests T+30 à T+730,
          fondamentaux Yahoo. 14 endpoints REST, authentification par clé API,
          métadonnées de fraîcheur sur chaque réponse.
        </p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/api/docs" style={btnGold}>Swagger UI interactive ↗</Link>
          <Link href="/docs/mcp" style={btnGhost}>Serveur MCP pour IA ↗</Link>
          <Link href="/account/api-keys" style={btnGhost}>Générer une clé API ↗</Link>
          <Link href="/api/openapi.json" style={btnGhost}>Spec OpenAPI JSON ↗</Link>
        </div>
      </section>

      {/* ── TWO-COLUMN LAYOUT (TOC + content) ─────────────────────────────── */}
      <div className="docs-layout">
        {/* Sidebar TOC · desktop only */}
        <aside className="docs-sidebar">
          <TOC sections={TOC_SECTIONS} />
        </aside>

        {/* Main content */}
        <main className="docs-content">

          {/* ── QUICKSTART ──────────────────────────────────────────────── */}
          <Section id="quickstart" eyebrow="Démarrage" title="Quickstart">
            <p style={pBody}>
              Trois étapes pour faire votre première requête :
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
              <li>
                Créez un compte, puis rendez-vous sur{" "}
                <Link href="/account/api-keys" style={linkGold}>Mon compte → Clés API</Link>.
              </li>
              <li>
                Générez une clé nommée (ex : &laquo; Production bot &raquo;). Copiez-la
                immédiatement, elle ne sera plus affichée.
              </li>
              <li>
                Ajoutez le header <code style={codeInline}>Authorization: Bearer &lt;key&gt;</code> à
                chaque requête.
              </li>
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
          <Section id="auth" eyebrow="Sécurité" title="Authentification">
            <p style={pBody}>
              Chaque requête doit inclure <strong>exactement une</strong> clé API valide et non
              révoquée. Deux formats sont acceptés, au choix :
            </p>
            <ul style={ulBody}>
              <li>
                <code style={codeInline}>Authorization: Bearer &lt;key&gt;</code> · standard,
                recommandé.
              </li>
              <li>
                <code style={codeInline}>X-Api-Key: &lt;key&gt;</code> · alternative si votre
                client HTTP ne gère pas bien le header Authorization.
              </li>
            </ul>

            <Callout tone="warn">
              <strong>La clé est affichée une seule fois</strong> à la création.
              En cas de perte, révoquez-la et générez-en une nouvelle.
              Limite : 10 clés actives par compte. Les clés révoquées restent visibles en historique.
            </Callout>

            <h4 style={h4}>Format des clés</h4>
            <CodeBlock
              language="text"
              code={`sit_live_<32 caractères base62>

Exemple de préfixe visible (safe pour logs) : sit_live_Ab1C
La clé complète fait ~40 caractères. Stockée hashée (SHA-256) côté serveur,
jamais retrouvable en clair.`}
            />

            <h4 style={h4}>Clé invalide, expirée ou révoquée</h4>
            <p style={pBody}>Toute erreur d&apos;authentification renvoie un <code style={codeInline}>HTTP 401</code> au format uniforme :</p>
            <CodeBlock
              language="json"
              code={`{
  "error": {
    "code": "invalid_api_key",
    "message": "Clé API invalide, inconnue ou révoquée. Générez une nouvelle clé depuis votre compte.",
    "status": 401
  }
}`}
            />
          </Section>

          {/* ── CONCEPTS ─────────────────────────────────────────────────── */}
          <Section id="concepts" eyebrow="Fondamentaux" title="Concepts clés">
            <h4 style={h4}>Base URL</h4>
            <CodeBlock language="text" code={BASE_URL} />

            <h4 style={h4}>Métadonnées universelles</h4>
            <p style={pBody}>
              Chaque réponse 200 inclut un objet <code style={codeInline}>meta</code>. Il contient la
              latence serveur et un mini-dictionnaire <code style={codeInline}>dataFreshness</code>
              avec la date de dernière mise à jour de chaque bloc de données, permettant à votre
              client de décider s&apos;il doit invalider son cache.
            </p>
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

            <h4 style={h4}>Pagination</h4>
            <p style={pBody}>
              Les endpoints listing supportent <code style={codeInline}>?limit</code> (défaut 50,
              max 200) et <code style={codeInline}>?offset</code> (défaut 0). Le champ
              <code style={codeInline}>total</code> retourné permet de paginer jusqu&apos;au bout.
            </p>

            <h4 style={h4}>Format des timestamps</h4>
            <p style={pBody}>
              Tous les timestamps sont en <strong>ISO 8601</strong> UTC
              (<code style={codeInline}>2026-04-20T18:32:11.123Z</code>).
            </p>

            <h4 style={h4}>Champs nullable</h4>
            <p style={pBody}>
              Un champ manquant dans la BDD est sérialisé en <code style={codeInline}>null</code>
              (jamais omis). Cela permet de distinguer &laquo; donnée absente &raquo; d&apos;une
              erreur de champ.
            </p>

            <h4 style={h4}>BigInt (montants)</h4>
            <p style={pBody}>
              Les champs comme <code style={codeInline}>marketCap</code>,{" "}
              <code style={codeInline}>revenue</code>, <code style={codeInline}>totalAmount</code>{" "}
              peuvent dépasser la capacité du nombre flottant JS (2<sup>53</sup>). Ils sont
              retournés comme des <em>nombres</em>, mais pour les sommes globales (L&apos;Oréal à
              195 Md€…) votre code client doit utiliser des BigInt si la précision vaut plus de 1
              €.
            </p>
          </Section>

          {/* ── ENDPOINTS ───────────────────────────────────────────────── */}
          <Section id="endpoints" eyebrow="API Reference" title="Endpoints">
            <p style={pBody}>
              14 endpoints, tous en lecture seule. Groupés par domaine.
            </p>

            {/* Authentication group */}
            <GroupHeader id="auth-endpoints" label="Authentification" />
            <Endpoint
              id="me"
              method="GET"
              path="/api/v1/me"
              summary="Vérifier une clé et obtenir l'identité"
              description="Renvoie les informations de l'utilisateur propriétaire de la clé + métadonnées de la clé elle-même. Utilisez-le comme ping pour valider qu'une clé est toujours active."
            >
              <CodeTabs
                tabs={[
                  { label: "cURL", language: "bash", code: `curl ${BASE_URL}/api/v1/me -H "Authorization: Bearer ${EX_KEY}"` },
                  { label: "Réponse", language: "json", code: `{
  "key": {
    "id":            "cm...",
    "name":          "Production bot",
    "prefix":        "sit_live_7dTu",
    "scopes":        "read",
    "totalRequests": 19
  },
  "user": {
    "id":        "cm...",
    "email":     "vous@exemple.com",
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
            <GroupHeader id="health-endpoints" label="Santé & stats" />
            <Endpoint
              id="health"
              method="GET"
              path="/api/v1/health"
              summary="État du système"
              description="Ping de la base de données (avec latence mesurée), horodatage de chaque étape de la pipeline. Utile pour détecter un arrêt du cron horaire ou du scoring."
            >
              <CodeBlock
                language="bash"
                code={`curl ${BASE_URL}/api/v1/health -H "Authorization: Bearer ${EX_KEY}"`}
              />
              <h5 style={h5}>Réponse (extraits)</h5>
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
              summary="Compteurs globaux"
              description="Nombre total de déclarations, de sociétés, d'initiés, de backtests, ventilations par fenêtre temporelle (24h / 7j / 30j), score moyen global."
            >
              <CodeBlock
                language="bash"
                code={`curl ${BASE_URL}/api/v1/stats -H "Authorization: Bearer ${EX_KEY}"`}
              />
            </Endpoint>

            {/* Companies group */}
            <GroupHeader id="companies-endpoints" label="Sociétés" />
            <Endpoint
              id="companies-list"
              method="GET"
              path="/api/v1/companies"
              summary="Lister les sociétés"
              description="Retourne les sociétés filtrées. 585 sociétés trackées au total."
              queryParams={[
                { name: "q",       type: "string",  description: "Recherche insensitive sur le nom" },
                { name: "isin",    type: "string",  description: "Filtre exact par ISIN" },
                { name: "market",  type: "string",  description: "Filtre marché (ex : Euronext Paris)" },
                { name: "hasLogo", type: "boolean", description: "Ne retourne que celles avec (true) ou sans (false) logo" },
                { name: "sort",    type: "enum",    default: "name", description: "name | marketCap | recent" },
                { name: "order",   type: "enum",    default: "asc",  description: "asc | desc" },
                { name: "limit",   type: "integer", default: "50",   description: "1 → 200" },
                { name: "offset",  type: "integer", default: "0",    description: "Pagination" },
              ]}
            >
              <CodeBlock
                language="bash"
                code={`curl "${BASE_URL}/api/v1/companies?q=lvmh&limit=3" \\
  -H "Authorization: Bearer ${EX_KEY}"`}
              />
              <h5 style={h5}>Réponse (tronquée)</h5>
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
              summary="Détail d'une société (fondamentaux complets)"
              description="Renvoie l'intégralité du profil : income statement, bilan, valorisation (P/E, P/B, beta), consensus analyste (reco, target mean/high/low), technicals (52-week, 50/200 DMA, dividend yield)."
              pathParams={[{ name: "slug", type: "string", required: true, description: "Identifiant URL unique de la société (présent dans la liste)" }]}
            >
              <CodeBlock
                language="bash"
                code={`curl ${BASE_URL}/api/v1/companies/bouygues-1454 \\
  -H "Authorization: Bearer ${EX_KEY}"`}
              />
              <Callout tone="info">
                Les champs Yahoo (<code style={codeInline}>trailingPE</code>, <code style={codeInline}>analystReco</code>,
                <code style={codeInline}>targetMean</code>…) peuvent être <code style={codeInline}>null</code> pour les micro-caps
                non couvertes par les analystes.
              </Callout>
            </Endpoint>

            <Endpoint
              id="company-declarations"
              method="GET"
              path="/api/v1/companies/{slug}/declarations"
              summary="Déclarations AMF d'une société"
              description="Historique complet des transactions de dirigeants sur une société, triées par pubDate desc."
              pathParams={[{ name: "slug", type: "string", required: true, description: "Slug société" }]}
              queryParams={[
                { name: "direction", type: "enum",    description: "BUY | SELL (défaut: toutes)" },
                { name: "minScore",  type: "number",  description: "Seuil signalScore" },
                { name: "limit",     type: "integer", default: "50", description: "1 → 200" },
                { name: "offset",    type: "integer", default: "0",  description: "Pagination" },
              ]}
            >
              <CodeBlock
                language="bash"
                code={`curl "${BASE_URL}/api/v1/companies/bouygues-1454/declarations?direction=BUY&minScore=40&limit=5" \\
  -H "Authorization: Bearer ${EX_KEY}"`}
              />
            </Endpoint>

            {/* Insiders group */}
            <GroupHeader id="insiders-endpoints" label="Dirigeants" />
            <Endpoint
              id="insiders-list"
              method="GET"
              path="/api/v1/insiders"
              summary="Lister les dirigeants"
              description="2 091 dirigeants trackés. Recherche fuzzy par nom."
              queryParams={[
                { name: "q",      type: "string",  description: "Recherche insensitive sur le nom" },
                { name: "limit",  type: "integer", default: "50", description: "1 → 200" },
                { name: "offset", type: "integer", default: "0",  description: "Pagination" },
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
              summary="Détail d'un dirigeant"
              description="Profil + sociétés auxquelles il/elle est rattaché(e) avec sa fonction + score moyen et max de ses déclarations."
              pathParams={[{ name: "slug", type: "string", required: true, description: "Slug dirigeant" }]}
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
              summary="Historique transactions d'un dirigeant"
              description="Chaîne complète des trades, toutes sociétés confondues, triée par pubDate desc."
              pathParams={[{ name: "slug", type: "string", required: true, description: "Slug dirigeant" }]}
              queryParams={[
                { name: "limit",  type: "integer", default: "50", description: "Max 200" },
                { name: "offset", type: "integer", default: "0",  description: "Pagination" },
              ]}
            >
              <CodeBlock
                language="bash"
                code={`curl ${BASE_URL}/api/v1/insiders/bernard-arnault/declarations \\
  -H "Authorization: Bearer ${EX_KEY}"`}
              />
            </Endpoint>

            {/* Declarations group */}
            <GroupHeader id="declarations-endpoints" label="Déclarations" />
            <Endpoint
              id="declarations-list"
              method="GET"
              path="/api/v1/declarations"
              summary="Recherche avancée de déclarations"
              description="Endpoint généraliste avec 12 filtres combinables. C'est le point d'entrée principal pour exporter un corpus historique ou analyser par critère."
              queryParams={[
                { name: "from",      type: "ISO date", description: "Filtre pubDate >= from" },
                { name: "to",        type: "ISO date", description: "Filtre pubDate <= to" },
                { name: "minScore",  type: "number",   description: "Seuil signalScore minimum" },
                { name: "maxScore",  type: "number",   description: "Seuil signalScore maximum" },
                { name: "direction", type: "enum",     description: "BUY | SELL" },
                { name: "cluster",   type: "boolean",  description: "true = uniquement trades groupés" },
                { name: "minAmount", type: "number",   description: "Montant minimum en €" },
                { name: "company",   type: "string",   description: "Recherche nom société" },
                { name: "insider",   type: "string",   description: "Recherche nom dirigeant" },
                { name: "isin",      type: "string",   description: "Filtre ISIN exact" },
                { name: "sort",      type: "enum",     default: "pubDate", description: "pubDate | signalScore | amount" },
                { name: "order",     type: "enum",     default: "desc",    description: "asc | desc" },
                { name: "limit",     type: "integer",  default: "50",      description: "1 → 200" },
                { name: "offset",    type: "integer",  default: "0",       description: "Pagination" },
              ]}
            >
              <CodeBlock
                language="bash"
                code={`# Top 20 signaux d'achat scorés >= 60 sur les 30 derniers jours
curl "${BASE_URL}/api/v1/declarations?direction=BUY&minScore=60&from=2026-03-20&sort=signalScore&order=desc&limit=20" \\
  -H "Authorization: Bearer ${EX_KEY}"`}
              />
            </Endpoint>

            <Endpoint
              id="declaration-detail"
              method="GET"
              path="/api/v1/declarations/{amfId}"
              summary="Détail d'une déclaration (avec backtest)"
              description="Objet complet incluant le backtest T+30/60/90/160/365/730 si calculé. Inclut prix d'exécution, prix au T+X et retour %."
              pathParams={[{ name: "amfId", type: "string", required: true, description: "Identifiant AMF (ex: 2026DD1108988)" }]}
            >
              <CodeBlock
                language="bash"
                code={`curl ${BASE_URL}/api/v1/declarations/2026DD1108988 \\
  -H "Authorization: Bearer ${EX_KEY}"`}
              />
              <h5 style={h5}>Extrait du bloc backtest</h5>
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
            <GroupHeader id="signals-endpoints" label="Signaux" />
            <Endpoint
              id="signals"
              method="GET"
              path="/api/v1/signals"
              summary="Top signaux (achats / ventes)"
              description="Raccourci pour obtenir les meilleurs scores sur une fenêtre glissante. Idéal pour un dashboard ou un bot de notification."
              queryParams={[
                { name: "direction",    type: "enum",    default: "BUY", description: "BUY | SELL" },
                { name: "lookbackDays", type: "integer", default: "7",   description: "Fenêtre (1 → 90)" },
                { name: "minScore",     type: "integer", default: "40",  description: "Score minimum (0 → 100)" },
                { name: "limit",        type: "integer", default: "20",  description: "Max 100" },
              ]}
            >
              <CodeBlock
                language="bash"
                code={`curl "${BASE_URL}/api/v1/signals?direction=BUY&minScore=60&lookbackDays=7&limit=5" \\
  -H "Authorization: Bearer ${EX_KEY}"`}
              />
            </Endpoint>

            {/* Backtest group */}
            <GroupHeader id="backtest-endpoints" label="Backtest" />
            <Endpoint
              id="backtest"
              method="GET"
              path="/api/v1/backtest"
              summary="Statistiques backtest globales"
              description="Retours moyens par horizon (T+30, T+60, T+90, T+160, T+365, T+730) et win rate à T+90. Filtrable par direction / score / période."
              queryParams={[
                { name: "direction", type: "enum",    description: "BUY | SELL (défaut : les deux)" },
                { name: "minScore",  type: "number",  description: "Filtre sur signalScore de la déclaration sous-jacente" },
                { name: "from",      type: "ISO",     description: "Filtre pubDate >= from" },
                { name: "to",        type: "ISO",     description: "Filtre pubDate <= to" },
              ]}
            >
              <CodeBlock
                language="bash"
                code={`curl "${BASE_URL}/api/v1/backtest?direction=BUY&minScore=60" \\
  -H "Authorization: Bearer ${EX_KEY}"`}
              />
              <h5 style={h5}>Réponse type</h5>
              <CodeBlock
                language="json"
                code={`{
  "filters": { "direction": "BUY", "minScore": "60", "from": null, "to": null },
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
            <GroupHeader id="search-endpoints" label="Recherche" />
            <Endpoint
              id="search"
              method="GET"
              path="/api/v1/search"
              summary="Recherche cross-entités"
              description="Recherche fuzzy dans les sociétés + dirigeants en un seul appel. Utilisé par le autocomplete du site."
              queryParams={[
                { name: "q",     type: "string",  required: true, description: "Requête (min 2 caractères)" },
                { name: "limit", type: "integer", default: "8",   description: "Max par bucket (1 → 50)" },
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
          <Section id="data-model" eyebrow="Schéma" title="Modèle de données">
            <p style={pBody}>
              Cinq entités principales. Voici les champs exposés dans l&apos;API (certains champs
              internes comme les index ou timestamps techniques ne sont pas inclus).
            </p>

            <h4 style={h4}>Company</h4>
            <EntityCard
              color="var(--gold)"
              rows={[
                ["slug", "string", "Identifiant URL, ex: bouygues-1454"],
                ["name", "string", "Raison sociale (source AMF)"],
                ["isin", "string | null", "International Securities ID Number"],
                ["market", "string | null", "Ex: Euronext Paris"],
                ["yahooSymbol", "string | null", "Ticker Yahoo pour prix / fondamentaux"],
                ["marketCap", "number | null", "Capitalisation en €"],
                ["currentPrice", "number | null", "Dernier cours connu"],
                ["trailingPE, forwardPE, priceToBook, beta", "number | null", "Valorisation Yahoo"],
                ["analystReco, analystScore, targetMean, targetHigh, targetLow", "mixed", "Consensus analystes"],
                ["dividendYield, fiftyTwoWeekHigh/Low, fiftyDayAverage, twoHundredDayAverage", "number | null", "Technicals"],
                ["logoUrl", "string | null", "CDN Vercel Blob"],
                ["priceAt, financialsAt, analystAt", "ISO date-time", "Fraîcheur par bloc"],
              ]}
            />

            <h4 style={h4}>Insider</h4>
            <EntityCard
              color="var(--c-indigo-2)"
              rows={[
                ["slug", "string", "Identifiant URL"],
                ["name", "string", "Nom du dirigeant (source AMF)"],
                ["gender", "string | null", "M / F inféré par IA"],
                ["declarationsCount", "integer", "Nombre de transactions totales"],
                ["companies", "Company[]", "Sociétés liées avec fonction occupée"],
              ]}
            />

            <h4 style={h4}>Declaration</h4>
            <EntityCard
              color="var(--c-emerald)"
              rows={[
                ["amfId", "string", "Identifiant AMF unique (ex: 2026DD1108988)"],
                ["pubDate", "ISO date-time", "Date publication AMF"],
                ["transactionDate", "ISO date-time | null", "Date effective de la transaction"],
                ["pdfUrl", "string", "Lien vers le PDF officiel AMF"],
                ["transaction", "object", "nature, instrument, isin, unitPrice, volume, totalAmount, currency, venue"],
                ["insider", "object", "name, slug, function"],
                ["company", "object", "name, slug, yahooSymbol, marketCap"],
                ["signal", "object", "score (0-100), pctOfMarketCap, pctOfInsiderFlow, insiderCumNet, isCluster, scoredAt"],
              ]}
            />

            <h4 style={h4}>BacktestResult (imbriqué dans Declaration.backtest)</h4>
            <EntityCard
              color="var(--c-violet)"
              rows={[
                ["direction", "string", "BUY | SELL | OTHER"],
                ["priceAtTrade", "number | null", "Prix d'exécution (cours Yahoo le plus proche)"],
                ["price30d / price60d / price90d / price160d / price365d / price730d", "number | null", "Cours aux 6 horizons"],
                ["return30d / return60d / return90d / return160d / return365d / return730d", "number | null", "Retour % correspondant"],
                ["computedAt", "ISO date-time", "Quand le calcul a eu lieu"],
              ]}
            />

            <h4 style={h4}>Signal (composant de scoring, calculé à la volée)</h4>
            <EntityCard
              color="var(--gold)"
              rows={[
                ["score", "number (0-100)", "Score composite"],
                ["pctOfMarketCap", "number | null", "Ratio montant / capitalisation (%)"],
                ["pctOfInsiderFlow", "number | null", "Part dans le flux total du dirigeant"],
                ["insiderCumNet", "number | null", "Net cumulé (buy - sell) jusqu'au trade"],
                ["isCluster", "boolean", "≥ 2 dirigeants ±30j"],
              ]}
            />
          </Section>

          {/* ── ERRORS ──────────────────────────────────────────────────── */}
          <Section id="errors" eyebrow="Erreurs" title="Gestion des erreurs">
            <p style={pBody}>
              Toutes les erreurs suivent un format uniforme (RFC-7807-like) :
            </p>
            <CodeBlock
              language="json"
              code={`{
  "error": {
    "code":    "<machine_readable_slug>",
    "message": "<human-readable French description>",
    "status":  <http_status>
  }
}`}
            />
            <h4 style={h4}>Codes d&apos;erreur</h4>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>Status</th>
                    <th style={th}>Code</th>
                    <th style={th}>Quand</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["401", "missing_api_key", "Aucun header Authorization ni X-Api-Key"],
                    ["401", "invalid_api_key", "Clé mal formée, inconnue, ou révoquée. User banni = idem."],
                    ["404", "company_not_found", "Slug de société inexistant"],
                    ["404", "insider_not_found", "Slug de dirigeant inexistant"],
                    ["404", "declaration_not_found", "amfId inexistant"],
                    ["500", "internal_error", "Erreur serveur, remontez-nous l'URL + heure"],
                  ].map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={td}><code style={codeInline}>{r[0]}</code></td>
                      <td style={td}><code style={codeInline}>{r[1]}</code></td>
                      <td style={td}>{r[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Callout tone="info">
              Retryez toute réponse ≥ 500 avec un back-off exponentiel (ex : 1 s, 2 s, 4 s max 5 tentatives).
              Ne retryez jamais 401 / 404.
            </Callout>
          </Section>

          {/* ── RATE LIMITS ─────────────────────────────────────────────── */}
          <Section id="rate-limits" eyebrow="Quotas" title="Rate limits & bonnes pratiques">
            <p style={pBody}>
              Plafonds par défaut durant la phase beta :
            </p>
            <ul style={ulBody}>
              <li><strong>5 000 requêtes / jour</strong> par clé (compteur reset 00:00 UTC).</li>
              <li><strong>10 req/seconde</strong> (burst) · suffisant pour la plupart des usages.</li>
              <li>
                <strong>10 clés actives maximum</strong> par compte. Au-delà, révoquez-en une
                depuis <Link href="/account/api-keys" style={linkGold}>votre page de clés</Link>.
              </li>
              <li>
                Les compteurs d&apos;usage sont visibles en temps réel par l&apos;utilisateur
                (total + aujourd&apos;hui) et par l&apos;admin (avec Top consommateurs).
              </li>
            </ul>
            <h4 style={h4}>Bonnes pratiques</h4>
            <ul style={ulBody}>
              <li>
                <strong>Respectez la fraîcheur.</strong> Les données ne bougent pas toutes les
                secondes. Les cours Yahoo sont rafraîchis 1×/jour (4 h UTC), les déclarations
                AMF 1×/heure. Consultez <code style={codeInline}>meta.dataFreshness</code> pour
                adapter votre fréquence de polling.
              </li>
              <li>
                <strong>Cachez agressivement.</strong> Un détail société change rarement, cachez-le
                côté client jusqu&apos;au <code style={codeInline}>priceAt + 1h</code>.
              </li>
              <li>
                <strong>Paginez correctement.</strong> Utilisez <code style={codeInline}>limit</code>{" "}
                raisonnable (20-50) et <code style={codeInline}>offset</code> pour les gros datasets.
              </li>
              <li>
                <strong>Retryez les 5xx.</strong> Avec back-off exponentiel, max 5 tentatives.
              </li>
              <li>
                <strong>Stockez la clé en secret.</strong> Jamais en clair dans un repo Git, dans
                le frontend, ou dans les logs.
              </li>
            </ul>
          </Section>

          {/* ── CODE SAMPLES ────────────────────────────────────────────── */}
          <Section id="samples" eyebrow="Exemples" title="Code samples">
            <h4 style={h4}>Récupérer les top signaux du jour</h4>
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

            <h4 style={h4}>Export CSV de toutes les déclarations d&apos;une société</h4>
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
          <Section id="changelog" eyebrow="Versioning" title="Changelog">
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
                <li>Lancement de l&apos;API publique.</li>
                <li>14 endpoints, authentification par clé API, métadonnées de fraîcheur.</li>
                <li>Swagger UI interactive disponible sur <Link href="/api/docs" style={linkGold}>/api/docs</Link>.</li>
              </ul>
            </div>
          </Section>

          {/* ── SUPPORT ─────────────────────────────────────────────────── */}
          <Section id="support" eyebrow="Support" title="Aide, retours, SLA">
            <p style={pBody}>
              L&apos;API est en <strong>beta privée</strong>. L&apos;accès est sur invitation.
              Aucun SLA contractuel n&apos;est fourni pendant la beta, mais l&apos;équipe veille
              quotidiennement à la fraîcheur des données (cron horaire AMF + quotidien Yahoo).
            </p>
            <ul style={ulBody}>
              <li>
                <strong>Demande d&apos;accès beta</strong> ou <strong>quota augmenté</strong> :
                contactez{" "}
                <a href="mailto:simon.azoulay.pro@gmail.com" style={linkGold}>
                  simon.azoulay.pro@gmail.com
                </a>.
              </li>
              <li>
                <strong>Bug / anomalie</strong> : mentionnez l&apos;URL exacte, l&apos;heure (UTC),
                et le <code style={codeInline}>prefix</code> de la clé utilisée.
              </li>
              <li>
                <strong>Roadmap</strong> : endpoints POST pour notifications push, webhooks sur
                nouveaux signaux, scopes granulaires.
              </li>
            </ul>
            <Callout tone="warn">
              <strong>Usage éthique.</strong> Les données AMF sont publiques, mais le rate limit
              sert aussi à éviter de surcharger les serveurs amont (Yahoo Finance, BDIF).
              Les patterns abusifs entraînent la révocation immédiate de la clé.
            </Callout>
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
              Prêt à intégrer <span style={{ fontStyle: "italic", color: "var(--gold)" }}>le signal des initiés</span> ?
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
              Générez une clé en 10 secondes, copiez l&apos;exemple cURL du quickstart, et
              explorez les endpoints en direct avec Swagger.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/account/api-keys" style={btnGold}>Générer ma clé →</Link>
              <Link href="/api/docs" style={btnGhost}>Ouvrir Swagger ↗</Link>
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

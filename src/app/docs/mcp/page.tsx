/**
 * /docs/mcp — Public MCP (Model Context Protocol) documentation.
 *
 * Long-form reference covering:
 *   - What MCP is + value prop
 *   - Architecture (JSON-RPC flow, methods supported)
 *   - Catalog of 20 tools grouped by family
 *   - Install guide for 6 clients (Claude Desktop, Cursor, VS Code, Windsurf, ChatGPT, cURL)
 *   - FAQ
 *
 * Sigma DA: editorial tear-sheet, gold accents, DM Serif headings, code blocks.
 */

import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { CodeBlock, CodeTabs } from "../_components/CodeBlock";
import { TOC } from "../_components/TOC";
import { ClientTabs } from "./_components/ClientTabs";
import { TOOLS } from "@/lib/mcp/tools";

export const revalidate = 3600;

export const metadata = {
  title: "MCP Server — Insiders Trades Sigma",
  description:
    "Serveur MCP (Model Context Protocol) pour Insiders Trades Sigma. 20 outils donnant à Claude, Cursor, Windsurf et tout agent IA l'accès aux données AMF, signaux scorés et backtests.",
};

const MCP_URL = "https://insiders-trades-sigma.vercel.app/api/mcp";
const APP_URL = "https://insiders-trades-sigma.vercel.app";

// ── TOC ──────────────────────────────────────────────────────────────────────
const TOC_SECTIONS = [
  { id: "why",          label: "Pourquoi MCP ?" },
  { id: "architecture", label: "Architecture" },
  { id: "protocol",     label: "Protocole JSON-RPC" },
  { id: "auth",         label: "Authentification" },
  {
    id: "tools",
    label: "Catalogue (20 outils)",
    children: [
      { id: "tools-discovery",  label: "Discovery (5)" },
      { id: "tools-enrichment", label: "Enrichment (5)" },
      { id: "tools-system",     label: "System (4)" },
      { id: "tools-composite",  label: "Composite (6)" },
    ],
  },
  { id: "install",   label: "Installation" },
  { id: "verify",    label: "Vérifier l'installation" },
  { id: "errors",    label: "Codes d'erreur" },
  { id: "faq",       label: "FAQ" },
];

export default function McpDocsPage() {
  const byCategory = {
    discovery:  TOOLS.filter((t) => t.category === "discovery"),
    enrichment: TOOLS.filter((t) => t.category === "enrichment"),
    system:     TOOLS.filter((t) => t.category === "system"),
    composite:  TOOLS.filter((t) => t.category === "composite"),
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
        <Eyebrow>MCP Server · v1.0.0 · 2024-11-05</Eyebrow>
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
          Connectez votre IA<br />
          à <span style={{ fontStyle: "italic", color: "var(--gold)" }}>25 500 déclarations AMF</span>
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
          Notre serveur MCP (Model Context Protocol) donne à Claude, Cursor, VS Code,
          Windsurf et à tout agent IA compatible l&apos;accès temps réel aux signaux
          d&apos;initiés, fondamentaux Yahoo, backtests historiques et déclarations AMF.
          Zéro setup local : une URL, une clé, c&apos;est en ligne.
        </p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
          <a href="#install" style={btnGold}>Guide d&apos;installation ↓</a>
          <Link href="/account/api-keys" style={btnGhost}>Générer une clé API ↗</Link>
          <Link href="/docs" style={btnGhost}>Référence API REST ↗</Link>
        </div>

        {/* Key figures */}
        <div
          style={{
            marginTop: "36px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "12px",
            maxWidth: "720px",
            marginInline: "auto",
          }}
        >
          {[
            { v: "20",     l: "outils MCP",       s: "JSON-RPC 2.0" },
            { v: "< 200ms",l: "latence typique",  s: "Vercel Edge" },
            { v: "25 564", l: "déclarations",     s: "10 ans d'historique" },
            { v: "22 231", l: "backtests",        s: "T+30 à T+730" },
          ].map((f) => (
            <KeyFig key={f.l} {...f} />
          ))}
        </div>
      </section>

      {/* ── TWO-COLUMN LAYOUT ─────────────────────────────────────────────── */}
      <div className="docs-layout">
        <aside className="docs-sidebar">
          <TOC sections={TOC_SECTIONS} />
        </aside>

        <main className="docs-content">

          {/* ── WHY MCP ────────────────────────────────────────────────── */}
          <Section id="why" eyebrow="Contexte" title="Pourquoi un serveur MCP ?">
            <p style={pBody}>
              <strong>MCP (Model Context Protocol)</strong> est le standard ouvert
              publié par Anthropic en 2024 pour connecter des agents IA à des sources
              de données externes. Pensez USB-C : votre IA se branche une fois sur le
              serveur et accède à tout ce qu&apos;il expose, sans glue code.
            </p>
            <p style={pBody}>
              Sur Insiders Trades Sigma, le serveur MCP convertit nos 14 endpoints REST
              en 20 outils richement documentés (avec schémas JSON Schema),
              optimisés pour la consommation par un LLM :
            </p>
            <ul style={ulBody}>
              <li>
                <strong>Descriptions en français</strong> qui expliquent précisément
                quand appeler chaque outil.
              </li>
              <li>
                <strong>Schémas d&apos;entrée stricts</strong> (type + contraintes min/max)
                pour que le modèle ne passe jamais de paramètres invalides.
              </li>
              <li>
                <strong>Outils composites</strong> qui combinent plusieurs endpoints en
                un appel (ex : <code style={codeInline}>get_company_full_profile</code>
                {" "}renvoie identité + derniers trades + stats backtest d&apos;un seul coup).
              </li>
              <li>
                <strong>Métadonnées temporelles</strong> sur chaque réponse
                (<code style={codeInline}>latencyMs</code>, <code style={codeInline}>generatedAt</code>)
                pour que l&apos;agent raisonne sur la fraîcheur.
              </li>
            </ul>

            <Callout tone="info">
              Tout ce que fait l&apos;API REST (<Link href="/docs" style={linkGold}>voir docs</Link>)
              est aussi exposé en MCP. Mais en plus, vous y gagnez 6 outils composites
              qui enchaînent plusieurs requêtes — optimisés pour les prompts vagues du style
              <em>&laquo; donne-moi tout sur LVMH &raquo;</em>.
            </Callout>
          </Section>

          {/* ── ARCHITECTURE ────────────────────────────────────────────── */}
          <Section id="architecture" eyebrow="Architecture" title="Flux de communication">
            <p style={pBody}>
              Le serveur tourne à <code style={codeInline}>POST {MCP_URL}</code>.
              Transport HTTP classique (pas de stdio), enveloppe JSON-RPC 2.0,
              CORS ouvert (<code style={codeInline}>Access-Control-Allow-Origin: *</code>).
            </p>

            <pre
              style={{
                background:
                  "radial-gradient(ellipse at top, var(--corporate-bg) 0%, transparent 60%), var(--bg-surface)",
                border: "1px solid var(--border-med)",
                borderRadius: "4px",
                padding: "24px",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.74rem",
                color: "var(--tx-2)",
                overflow: "auto",
                lineHeight: 1.5,
                marginBottom: "18px",
                whiteSpace: "pre",
              }}
            >
{`┌─────────────────┐    1. initialize      ┌────────────────────┐
│                 │ ────────────────────▶ │                    │
│   Client IA     │    2. tools/list      │   Serveur MCP      │
│   (Claude,      │ ────────────────────▶ │   POST /api/mcp    │
│    Cursor,      │    3. tools/call      │   JSON-RPC 2.0     │
│    Windsurf…)   │ ────────────────────▶ │                    │
│                 │       +arguments      │    executeTool()   │
└────────▲────────┘                       │    routing + auth  │
         │                                │         │          │
         │                                │         ▼          │
         │  content[0].text               │   Bearer <key>     │
         │  (JSON stringifié)             │         │          │
         │                                │         ▼          │
         └────────────────────────────────┤  Prisma / Postgres │
                                          │  (read-only)       │
                                          └────────────────────┘`}
            </pre>

            <p style={pBody}>
              Côté client, rien à coder : Claude Desktop / Cursor / Windsurf / VS Code
              (+ extension Continue) gèrent nativement JSON-RPC MCP. Il suffit d&apos;ajouter
              l&apos;URL à leur fichier de config.
            </p>
          </Section>

          {/* ── PROTOCOL ───────────────────────────────────────────────── */}
          <Section id="protocol" eyebrow="JSON-RPC 2.0" title="Enveloppe de protocole">
            <h4 style={h4}>Méthodes supportées</h4>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>Méthode</th>
                    <th style={th}>Type</th>
                    <th style={th}>Auth requise</th>
                    <th style={th}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["initialize",      "request",      "non",  "Handshake initial — échange des versions de protocole et capacités"],
                    ["initialized",     "notification", "non",  "Confirmation client (aucune réponse, HTTP 204)"],
                    ["tools/list",      "request",      "oui",  "Retourne les 20 outils avec leur inputSchema JSON Schema"],
                    ["tools/call",      "request",      "oui",  "Exécute un outil et retourne le résultat dans content[0].text"],
                    ["ping",            "request",      "non",  "Heartbeat — retourne {}"],
                  ].map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={td}><code style={codeInline}>{r[0]}</code></td>
                      <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem", color: "var(--tx-3)" }}>{r[1]}</td>
                      <td style={{ ...td, color: r[2] === "oui" ? "var(--gold)" : "var(--tx-3)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem" }}>{r[2]}</td>
                      <td style={td}>{r[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h4 style={h4}>Exemple d&apos;appel tools/call</h4>
            <CodeTabs
              tabs={[
                {
                  label: "Requête",
                  language: "json",
                  code: `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_top_signals",
    "arguments": {
      "direction": "BUY",
      "lookbackDays": 7,
      "minScore": 50,
      "limit": 5
    }
  }
}`,
                },
                {
                  label: "Réponse",
                  language: "json",
                  code: `{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\\"direction\\":\\"BUY\\",\\"count\\":5,\\"results\\":[...]}"
      }
    ],
    "isError": false
  }
}`,
                },
              ]}
            />

            <Callout tone="info">
              Le résultat est une chaîne JSON dans <code style={codeInline}>content[0].text</code>
              (convention MCP — les modèles parsent nativement le texte).
              L&apos;objet parsé contient toujours un champ <code style={codeInline}>meta</code> avec la latence.
            </Callout>
          </Section>

          {/* ── AUTH ───────────────────────────────────────────────────── */}
          <Section id="auth" eyebrow="Sécurité" title="Authentification">
            <p style={pBody}>
              Chaque appel <code style={codeInline}>tools/list</code> et <code style={codeInline}>tools/call</code>
              {" "}doit inclure votre clé API Insiders Trades. Trois formats acceptés,
              par ordre de priorité :
            </p>
            <ol style={ulBody}>
              <li><code style={codeInline}>Authorization: Bearer &lt;key&gt;</code> — préféré, supporté par les clients MCP modernes (Claude Desktop ≥ 3.7, Cursor, Windsurf).</li>
              <li><code style={codeInline}>X-Api-Key: &lt;key&gt;</code> — alternative header.</li>
              <li><code style={codeInline}>?apiKey=&lt;key&gt;</code> — dans l&apos;URL (fallback pour clients MCP simples qui ne supportent pas les headers — rare).</li>
            </ol>
            <CodeBlock
              filename="URL complète avec clé inline (fallback)"
              language="text"
              code={`${MCP_URL}?apiKey=sit_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`}
            />

            <Callout tone="warn">
              <strong>Ne partagez jamais votre clé en clair dans une config versionée.</strong>
              Utilisez les variables d&apos;environnement ou un gestionnaire de secrets.
              La plupart des clients MCP acceptent l&apos;injection via <code style={codeInline}>${"{{env:VAR}}"}</code>.
            </Callout>

            <p style={pBody}>
              Pour <strong>générer une clé</strong>, rendez-vous sur{" "}
              <Link href="/account/api-keys" style={linkGold}>
                /account/api-keys
              </Link>{" "}
              (5 secondes). La clé s&apos;affiche une seule fois — copiez-la immédiatement.
              Elle partage le même quota que l&apos;API REST (5 000 requêtes/jour en beta).
            </p>
          </Section>

          {/* ── TOOLS CATALOG ──────────────────────────────────────────── */}
          <Section id="tools" eyebrow="Catalogue" title={`${TOOLS.length} outils disponibles`}>
            <p style={pBody}>
              Groupés en 4 familles selon leur usage. Chaque outil retourne un JSON
              auto-suffisant avec des métadonnées de latence.
            </p>

            {/* Discovery */}
            <CategoryBlock
              id="tools-discovery"
              title="Discovery"
              subtitle="5 outils · retournent des listes"
              description="Votre premier point d'entrée. Utilisés par l'IA quand l'utilisateur formule une question floue ('y a-t-il des mouvements chez LVMH ?')."
              accent="var(--gold)"
              tools={byCategory.discovery}
            />

            {/* Enrichment */}
            <CategoryBlock
              id="tools-enrichment"
              title="Enrichment"
              subtitle="5 outils · une entité → données complètes"
              description="Approfondissent une entité identifiée. Typiquement appelés après un outil Discovery (slug → get_company)."
              accent="var(--c-indigo-2)"
              tools={byCategory.enrichment}
            />

            {/* System */}
            <CategoryBlock
              id="tools-system"
              title="System"
              subtitle="4 outils · état de la plateforme"
              description="Santé, fraîcheur, stats globales, usage de la clé courante. L'IA les utilise quand on lui demande 'les données sont-elles à jour ?' ou 'combien me reste-t-il de crédits ?'"
              accent="var(--c-emerald)"
              tools={byCategory.system}
            />

            {/* Composite */}
            <CategoryBlock
              id="tools-composite"
              title="Composite"
              subtitle="6 outils · cross-sources en 1 appel"
              description="Optimisés pour les prompts vagues ou les analyses multi-étapes. Chaque outil compose 3 à 6 requêtes internes et renvoie un JSON agrégé."
              accent="var(--c-violet)"
              tools={byCategory.composite}
            />
          </Section>

          {/* ── INSTALL ────────────────────────────────────────────────── */}
          <Section id="install" eyebrow="Setup" title="Guide d'installation">
            <p style={pBody}>
              5 minutes, 3 étapes, aucun code :
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "10px",
                marginBottom: "22px",
              }}
            >
              {[
                { n: "1", t: "Copiez l'URL MCP", s: "Ci-dessous" },
                { n: "2", t: "Générez une clé API", s: "/account/api-keys" },
                { n: "3", t: "Collez dans votre IA", s: "Claude, Cursor, …" },
              ].map((x) => (
                <div
                  key={x.n}
                  style={{
                    padding: "14px 16px",
                    border: "1px solid var(--border-med)",
                    borderLeft: "3px solid var(--gold)",
                    borderRadius: "3px",
                    background: "var(--bg-surface)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "0.62rem",
                      color: "var(--gold)",
                      letterSpacing: "0.12em",
                      fontWeight: 700,
                    }}
                  >
                    ÉTAPE {x.n}
                  </div>
                  <div style={{ fontSize: "0.9rem", color: "var(--tx-1)", fontWeight: 700, marginTop: "4px" }}>
                    {x.t}
                  </div>
                  <div style={{ fontSize: "0.76rem", color: "var(--tx-3)", marginTop: "2px", fontFamily: "'JetBrains Mono', monospace" }}>
                    {x.s}
                  </div>
                </div>
              ))}
            </div>

            <h4 style={h4}>L&apos;URL à copier</h4>
            <CodeBlock code={MCP_URL} language="text" filename="URL du serveur MCP" />

            <h4 style={h4}>Tutoriel par client</h4>
            <ClientTabs
              tabs={[
                {
                  id: "claude",
                  label: "Claude Desktop",
                  badge: "NATIF MCP",
                  intro:
                    "Application desktop Anthropic (Mac & Windows) — support MCP natif depuis Claude 3.7+. La version web ne le supporte pas.",
                  steps: [
                    { title: "Installez Claude Desktop", body: <>Téléchargez sur <a href="https://claude.ai/download" target="_blank" rel="noopener noreferrer" style={linkGold}>claude.ai/download</a>.</> },
                    { title: "Ouvrez le fichier de configuration",
                      body: (
                        <>
                          Menu Claude → Réglages → Développeur → <em>Modifier la configuration</em>. Sinon, accédez-y directement :<br />
                          <code style={codeInline}>~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS)<br />
                          <code style={codeInline}>%APPDATA%\Claude\claude_desktop_config.json</code> (Windows)
                        </>
                      ),
                    },
                    { title: "Collez la configuration", body: <>Ajoutez le bloc ci-dessous. Si le fichier contient déjà d&apos;autres serveurs, fusionnez dans <code style={codeInline}>mcpServers</code>.</> },
                    { title: "Redémarrez Claude", body: <>Quittez et rouvrez complètement l&apos;application. Une icône plug 🔌 apparaît dans la barre.</> },
                  ],
                  config: {
                    filename: "claude_desktop_config.json",
                    code: `{
  "mcpServers": {
    "insiders-trades": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer sit_live_VOTRE_CLE_ICI"
      }
    }
  }
}`,
                  },
                },
                {
                  id: "cursor",
                  label: "Cursor",
                  badge: "NATIF MCP",
                  intro:
                    "L'éditeur IA de Cursor supporte MCP via Settings → MCP. Les outils apparaissent automatiquement dans les agents.",
                  steps: [
                    { title: "Ouvrez les réglages Cursor", body: <>Cmd+Shift+J → onglet <strong>MCP</strong>.</> },
                    { title: "Cliquez sur + Add new MCP server", body: <>Choisissez type <code style={codeInline}>http</code>.</> },
                    { title: "Remplissez les champs", body: <>Name : <code style={codeInline}>insiders-trades</code> · URL : collez l&apos;URL MCP · Headers : <code style={codeInline}>Authorization</code> = <code style={codeInline}>Bearer sit_live_...</code></> },
                    { title: "Activez le serveur", body: <>Toggle sur ON. Ouvrez le chat agent — les 20 outils sont disponibles.</> },
                  ],
                  config: {
                    filename: "~/.cursor/mcp.json (alternative via fichier)",
                    code: `{
  "mcpServers": {
    "insiders-trades": {
      "url": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer sit_live_VOTRE_CLE_ICI"
      }
    }
  }
}`,
                  },
                },
                {
                  id: "vscode",
                  label: "VS Code (Continue)",
                  badge: "VIA CONTINUE",
                  intro:
                    "L'extension Continue apporte le support MCP dans VS Code. Installez-la depuis le marketplace.",
                  steps: [
                    { title: "Installez Continue", body: <>Marketplace VS Code → rechercher <strong>Continue</strong> → Install.</> },
                    { title: "Ouvrez la config Continue", body: <>Cmd+L → icône ⚙️ → <em>Open config.json</em>.</> },
                    { title: "Ajoutez le serveur MCP", body: <>Dans la section <code style={codeInline}>experimental.modelContextProtocolServers</code>, collez le bloc ci-dessous.</> },
                    { title: "Rechargez VS Code", body: <>Cmd+Shift+P → <em>Developer: Reload Window</em>. Les outils apparaissent dans le chat Continue.</> },
                  ],
                  config: {
                    filename: "~/.continue/config.json",
                    code: `{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "http",
          "url": "${MCP_URL}",
          "headers": {
            "Authorization": "Bearer sit_live_VOTRE_CLE_ICI"
          }
        }
      }
    ]
  }
}`,
                  },
                },
                {
                  id: "windsurf",
                  label: "Windsurf (Codeium)",
                  badge: "NATIF MCP",
                  intro:
                    "Windsurf de Codeium supporte MCP nativement dans Cascade. Configuration JSON unique.",
                  steps: [
                    { title: "Ouvrez les réglages Cascade", body: <>Cascade → Settings → MCP Servers.</> },
                    { title: "Cliquez + Add Server", body: <>Type : <code style={codeInline}>http</code>.</> },
                    { title: "Collez la config JSON", body: <>Dans le fichier <code style={codeInline}>~/.codeium/windsurf/mcp_config.json</code>.</> },
                    { title: "Relancez Windsurf", body: <>Les outils apparaissent automatiquement.</> },
                  ],
                  config: {
                    filename: "~/.codeium/windsurf/mcp_config.json",
                    code: `{
  "mcpServers": {
    "insiders-trades": {
      "serverUrl": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer sit_live_VOTRE_CLE_ICI"
      }
    }
  }
}`,
                  },
                },
                {
                  id: "chatgpt",
                  label: "ChatGPT / Custom GPT",
                  badge: "VIA ACTIONS",
                  intro:
                    "ChatGPT ne supporte pas MCP nativement. Utilisez plutôt notre API REST classique via le panneau Actions d'un Custom GPT, ou le système de plugins.",
                  steps: [
                    { title: "Ouvrez un Custom GPT", body: <>Dans ChatGPT → &laquo; My GPTs &raquo; → <em>Create</em>.</> },
                    { title: "Configurez une Action", body: <>Onglet <em>Configure</em> → bloc <strong>Actions</strong> → <em>Create new action</em>.</> },
                    { title: "Importez notre schéma OpenAPI", body: <>Importez depuis <code style={codeInline}>{APP_URL}/api/openapi.json</code></> },
                    { title: "Ajoutez l'authentification", body: <>Type : <em>API Key</em> → Auth Type : <em>Bearer</em> → collez votre <code style={codeInline}>sit_live_...</code>.</> },
                  ],
                },
                {
                  id: "curl",
                  label: "cURL / script",
                  badge: "TEST MANUEL",
                  intro:
                    "Pour débugger ou appeler le serveur depuis un script / n8n / Zapier / LangChain, utilisez directement l'HTTP JSON-RPC.",
                  steps: [
                    { title: "Initialize", body: <>Handshake — retourne <code style={codeInline}>protocolVersion</code> et <code style={codeInline}>serverInfo</code>.</> },
                    { title: "tools/list", body: <>Catalog complet des 20 outils. Nécessite l&apos;auth.</> },
                    { title: "tools/call", body: <>Exécute un outil. Réponse dans <code style={codeInline}>content[0].text</code>.</> },
                  ],
                  config: {
                    filename: "test.sh",
                    code: `#!/usr/bin/env bash
export KEY=sit_live_VOTRE_CLE_ICI
URL=${MCP_URL}

# 1. Handshake (sans auth)
curl -s "$URL" -X POST \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"demo","version":"1.0"}}}'

# 2. List tools
curl -s "$URL" -X POST \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 3. Call a tool
curl -s "$URL" -X POST \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_top_signals","arguments":{"direction":"BUY","limit":5}}}'`,
                  },
                },
              ]}
            />
          </Section>

          {/* ── VERIFY ─────────────────────────────────────────────────── */}
          <Section id="verify" eyebrow="Test" title="Vérifier l'installation">
            <p style={pBody}>
              Une fois le serveur configuré, posez cette question à votre IA :
            </p>
            <div
              style={{
                background: "var(--gold-bg)",
                border: "1px solid var(--gold-bd)",
                borderLeft: "3px solid var(--gold)",
                padding: "14px 18px",
                borderRadius: "3px",
                fontSize: "1rem",
                fontStyle: "italic",
                color: "var(--tx-1)",
                marginBottom: "14px",
                lineHeight: 1.6,
              }}
            >
              &laquo; Quels outils MCP Insiders Trades as-tu ? Liste-les avec leur rôle. &raquo;
            </div>
            <p style={pBody}>
              L&apos;IA doit lister <strong>20 outils</strong> groupés en 4 familles (Discovery,
              Enrichment, System, Composite). Si ce n&apos;est pas le cas :
            </p>
            <ul style={ulBody}>
              <li>Vérifiez que le serveur MCP est bien activé dans les settings du client.</li>
              <li>Relancez complètement l&apos;application (pas juste un reload fenêtre).</li>
              <li>Vérifiez la clé API : <code style={codeInline}>curl {MCP_URL}</code> doit renvoyer un JSON d&apos;accueil ; ajouter l&apos;auth et appeler <code style={codeInline}>tools/list</code> doit renvoyer le catalogue.</li>
              <li>Consultez les logs du client IA (Claude Desktop les expose via <em>View logs</em>).</li>
            </ul>

            <h4 style={h4}>Prompts d&apos;exemple qui déclenchent des outils</h4>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Prompt</th>
                  <th style={th}>Outil attendu</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["\"Donne-moi les 5 meilleurs signaux d'achat du mois\"", "search_top_signals"],
                  ["\"C'est quoi LVMH ? Montre les fondamentaux\"", "get_company_full_profile"],
                  ["\"Compare Bouygues et Vinci côté insider activity\"", "compare_companies"],
                  ["\"Quelles sociétés ont plusieurs dirigeants qui achètent ces 30 derniers jours ?\"", "find_clustered_trades"],
                  ["\"J'ai ces ISINs dans mon portefeuille : FR0000121014, FR0000120271… quelles alertes ?\"", "watch_isins"],
                  ["\"Le système est-il à jour ? Quand le dernier cron ?\"", "get_system_health"],
                ].map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ ...td, fontStyle: "italic" }}>{r[0]}</td>
                    <td style={td}><code style={codeInline}>{r[1]}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* ── ERRORS ─────────────────────────────────────────────────── */}
          <Section id="errors" eyebrow="Codes d'erreur" title="JSON-RPC error codes">
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>Code</th>
                    <th style={th}>Nom</th>
                    <th style={th}>Cause</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["-32700", "Parse error",      "Corps de la requête non parseable en JSON"],
                    ["-32600", "Invalid Request",  "Enveloppe JSON-RPC invalide (manque jsonrpc ou method)"],
                    ["-32601", "Method not found", "Méthode MCP inconnue (autre que initialize, tools/list, tools/call, ping)"],
                    ["-32602", "Invalid params",   "Paramètre manquant ou nom d'outil inconnu"],
                    ["-32603", "Internal error",   "Erreur interne serveur (à reporter)"],
                    ["-32000", "Unauthorized",     "Clé API manquante, invalide ou révoquée (spécifique à notre implémentation)"],
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
          </Section>

          {/* ── FAQ ────────────────────────────────────────────────────── */}
          <Section id="faq" eyebrow="Questions" title="FAQ">
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                {
                  q: "C'est quoi exactement le MCP ?",
                  a: "MCP (Model Context Protocol) est le standard ouvert lancé par Anthropic en 2024 pour connecter les IA à des sources de données externes. Comme un port USB-C universel : votre IA s'y branche une fois et accède à tout ce que le serveur expose. Notre serveur expose 20 outils de lecture sur la BDD Insiders Trades.",
                },
                {
                  q: "Ai-je besoin d'une clé API Insiders Trades ?",
                  a: (
                    <>
                      Oui. Contrairement à la documentation Swagger que nous publions aussi
                      librement, le MCP consomme votre quota. Générez une clé depuis{" "}
                      <Link href="/account/api-keys" style={linkGold}>/account/api-keys</Link>
                      {" "}(gratuit en beta, 5 000 requêtes/jour).
                    </>
                  ),
                },
                {
                  q: "Quels clients sont compatibles ?",
                  a: "Claude Desktop ≥ 3.7 (natif), Cursor (natif), Windsurf (natif), VS Code via Continue, et tout framework agentique Python/JS supportant MCP (LangChain, LlamaIndex). ChatGPT n'a pas encore de support MCP natif — utilisez notre API REST via Custom GPT Actions.",
                },
                {
                  q: "Les données sont-elles à jour en temps réel ?",
                  a: "Chaque appel MCP interroge la BDD Postgres en direct. Les déclarations AMF sont synchronisées toutes les heures (cron horaire), les fondamentaux Yahoo tous les jours à 04:00 UTC. Appelez get_system_health pour voir la fraîcheur exacte à l'instant T.",
                },
                {
                  q: "Y a-t-il un risque de fuite de données sensibles ?",
                  a: "Non. Tous les outils sont strictement READ-ONLY sur la BDD Postgres. Aucune action d'écriture n'est possible via MCP. De plus, les données elles-mêmes sont publiques (règlement AMF MAR 596/2014).",
                },
                {
                  q: "Mon IA appelle-t-elle tous les outils sur chaque question ?",
                  a: "Non. Les LLMs modernes (Claude 3.5 Sonnet+, GPT-4o…) sont bons en tool-routing : ils ne sollicitent que les outils pertinents. En pratique on observe 1-4 appels par conversation. Chaque appel compte dans votre quota journalier.",
                },
                {
                  q: "Puis-je self-host le serveur ?",
                  a: "Le code source du serveur MCP (/api/mcp + src/lib/mcp/) est dans le même repo Next.js que le site. Si vous déployez votre propre instance, la connexion à la BDD Postgres reste nécessaire — la valeur du service vient des données, pas du code du serveur MCP.",
                },
                {
                  q: "CORS & navigateur : puis-je appeler depuis un JS front ?",
                  a: "Oui techniquement — le serveur émet Access-Control-Allow-Origin: *. Mais cela exposerait votre clé API dans le bundle JS. À réserver aux environnements trusted (agent backend) ou passer par un proxy.",
                },
                {
                  q: "Quel est le coût par appel ?",
                  a: "0 € en beta. Chaque appel tools/call consomme 1 requête de votre quota journalier (5 000/jour). Les méthodes initialize et ping sont gratuites et ne comptent pas.",
                },
              ].map((f, i) => (
                <details
                  key={i}
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-med)",
                    borderRadius: "3px",
                    padding: "12px 16px",
                  }}
                >
                  <summary
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: "0.92rem",
                      fontWeight: 700,
                      color: "var(--tx-1)",
                      cursor: "pointer",
                      listStyle: "none",
                      letterSpacing: "-0.005em",
                    }}
                  >
                    {f.q}
                  </summary>
                  <div
                    style={{
                      fontSize: "0.88rem",
                      color: "var(--tx-2)",
                      lineHeight: 1.65,
                      marginTop: "8px",
                      paddingTop: "8px",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    {f.a}
                  </div>
                </details>
              ))}
            </div>
          </Section>

          {/* ── FINAL CTA ──────────────────────────────────────────────── */}
          <section
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
              Branchez votre IA <span style={{ fontStyle: "italic", color: "var(--gold)" }}>en 5 minutes</span>
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
              Une URL, une clé, c&apos;est en ligne. Votre agent IA préféré accède
              instantanément aux 25 500 déclarations AMF, signaux scorés et backtests.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/account/api-keys" style={btnGold}>Générer ma clé →</Link>
              <a href="#install" style={btnGhost}>Revenir à l&apos;installation ↑</a>
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
        .docs-sidebar { position: relative; font-size: 0.85rem; }
        @media (max-width: 960px) {
          .docs-layout { grid-template-columns: 1fr; gap: 20px; }
          .docs-sidebar { display: none; }
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

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
    <section id={id} style={{ paddingTop: "40px", paddingBottom: "12px", scrollMarginTop: "80px" }}>
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

function KeyFig({ v, l, s }: { v: string; l: string; s: string }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-med)",
        borderLeft: "2px solid var(--gold)",
        padding: "12px 16px",
        borderRadius: "2px",
        textAlign: "left",
      }}
    >
      <div
        style={{
          fontFamily: "'Banana Grotesk', sans-serif",
          fontSize: "1.55rem",
          fontWeight: 700,
          color: "var(--gold)",
          letterSpacing: "-0.035em",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {v}
      </div>
      <div
        style={{
          fontSize: "0.7rem",
          color: "var(--tx-3)",
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontWeight: 600,
          marginTop: "4px",
        }}
      >
        {l}
      </div>
      <div style={{ fontSize: "0.72rem", color: "var(--tx-4)", marginTop: "2px" }}>{s}</div>
    </div>
  );
}

function CategoryBlock({
  id, title, subtitle, description, accent, tools,
}: {
  id: string; title: string; subtitle: string; description: string;
  accent: string;
  tools: typeof TOOLS;
}) {
  return (
    <div id={id} style={{ marginTop: "28px", scrollMarginTop: "80px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "12px",
          flexWrap: "wrap",
          paddingBottom: "8px",
          borderBottom: "1px dashed var(--border-med)",
          marginBottom: "14px",
        }}
      >
        <h3
          style={{
            fontFamily: "var(--font-dm-serif), Georgia, serif",
            fontSize: "1.4rem",
            fontWeight: 400,
            color: "var(--tx-1)",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h3>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.7rem",
            color: accent,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          {subtitle}
        </span>
      </div>
      <p style={{ fontSize: "0.9rem", color: "var(--tx-2)", lineHeight: 1.65, marginBottom: "14px" }}>
        {description}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {tools.map((t) => (
          <div
            key={t.name}
            style={{
              padding: "10px 14px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderLeft: `3px solid ${accent}`,
              borderRadius: "3px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap",
                marginBottom: "3px",
              }}
            >
              <code
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.86rem",
                  fontWeight: 700,
                  color: "var(--tx-1)",
                  background: "var(--bg-raised)",
                  padding: "2px 7px",
                  borderRadius: "2px",
                }}
              >
                {t.name}
              </code>
              {t.inputSchema.required && t.inputSchema.required.length > 0 && (
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "0.66rem",
                    color: "var(--tx-3)",
                    letterSpacing: "0.04em",
                  }}
                >
                  requires: {t.inputSchema.required.join(", ")}
                </span>
              )}
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--tx-2)", lineHeight: 1.55 }}>
              {t.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Callout({ tone, children }: { tone: "info" | "warn" | "danger"; children: React.ReactNode }) {
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

// ── Inline styles ───────────────────────────────────────────────────────────

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

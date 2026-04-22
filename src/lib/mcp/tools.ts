/**
 * MCP tool catalog for Insiders Trades Sigma.
 *
 * Each tool exposes a narrow, well-documented slice of the database so an
 * LLM agent can answer questions without writing SQL.
 *
 * Tools are grouped in 4 families:
 *   - Discovery    — return lists / search
 *   - Enrichment   — single entity with complete data
 *   - System       — health, freshness, usage, backtest stats
 *   - Composite    — cross-source aggregation in a single call
 */

export interface ToolDef {
  name: string;
  description: string;
  category: "discovery" | "enrichment" | "system" | "composite";
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

// A tiny helper to produce JSON schema entries.
const n = (description: string, extra: Record<string, unknown> = {}) => ({
  type: "number",
  description,
  ...extra,
});
const s = (description: string, extra: Record<string, unknown> = {}) => ({
  type: "string",
  description,
  ...extra,
});
const b = (description: string) => ({
  type: "boolean",
  description,
});
const i = (description: string, def?: number, min?: number, max?: number) => ({
  type: "integer",
  description,
  ...(def != null ? { default: def } : {}),
  ...(min != null ? { minimum: min } : {}),
  ...(max != null ? { maximum: max } : {}),
});

export const TOOLS: ToolDef[] = [
  // ── DISCOVERY ───────────────────────────────────────────────────────────────
  {
    name: "search_companies",
    category: "discovery",
    description:
      "Recherche fuzzy de sociétés cotées françaises par nom, ticker Yahoo, ou ISIN. Retourne nom, slug, ISIN, marché, capitalisation, cours, nombre de déclarations.",
    inputSchema: {
      type: "object",
      properties: {
        query: s("Nom ou fragment de nom, ticker Yahoo (ex: 'MC.PA'), ou ISIN"),
        limit: i("Max résultats (1–50)", 10, 1, 50),
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "search_insiders",
    category: "discovery",
    description:
      "Recherche fuzzy de dirigeants (PDG, CFO, administrateurs) par nom. Retourne nom, slug, nb de déclarations, nb de sociétés liées.",
    inputSchema: {
      type: "object",
      properties: {
        query: s("Prénom, nom, ou fragment"),
        limit: i("Max résultats (1–50)", 10, 1, 50),
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "search_declarations",
    category: "discovery",
    description:
      "Recherche avancée de déclarations AMF avec 12 filtres combinables: période, score min/max, direction (BUY/SELL), cluster, montant, société, dirigeant, ISIN, tri.",
    inputSchema: {
      type: "object",
      properties: {
        from:      s("ISO date, filtre pubDate ≥ from"),
        to:        s("ISO date, filtre pubDate ≤ to"),
        minScore:  n("Seuil signalScore minimum (0–100)"),
        maxScore:  n("Seuil signalScore maximum (0–100)"),
        direction: s("'BUY' | 'SELL'"),
        cluster:   b("true = uniquement trades groupés (≥2 dirigeants ±30j)"),
        minAmount: n("Montant minimum en €"),
        company:   s("Filtre nom société (contient)"),
        insider:   s("Filtre nom dirigeant (contient)"),
        isin:      s("Filtre ISIN exact"),
        sort:      s("'pubDate' | 'signalScore' | 'amount' (défaut pubDate)"),
        order:     s("'asc' | 'desc' (défaut desc)"),
        limit:     i("Max résultats (1–200)", 20, 1, 200),
        offset:    i("Pagination", 0, 0),
      },
      additionalProperties: false,
    },
  },
  {
    name: "search_global",
    category: "discovery",
    description:
      "Recherche cross-entités en un seul appel : sociétés + dirigeants en même temps. Utile quand la requête utilisateur est ambiguë.",
    inputSchema: {
      type: "object",
      properties: {
        query: s("Requête libre (min 2 caractères)"),
        limit: i("Max par bucket (1–25)", 8, 1, 25),
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "search_top_signals",
    category: "discovery",
    description:
      "Top signaux scorés (BUY ou SELL) sur une fenêtre glissante. La sortie canonique pour répondre à 'Quelles sont les meilleures opportunités en ce moment ?'",
    inputSchema: {
      type: "object",
      properties: {
        direction:    s("'BUY' (défaut) | 'SELL'"),
        lookbackDays: i("Fenêtre en jours (1–90)", 7, 1, 90),
        minScore:     i("Score minimum (0–100)", 40, 0, 100),
        limit:        i("Max (1–50)", 10, 1, 50),
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_winning_strategy_signals",
    category: "discovery",
    description:
      "★ STRATÉGIE SIGMA — signaux qui matchent la stratégie qui a battu le CAC 40 chaque année depuis 2022 (+16.3% annuel, Sharpe 1.00, alpha +10.4 pts/an). 6 filtres : cluster, mid-cap 200M-1B€, PDG/CFO/directeur, déclaration ≤ 7j après transaction, acquisition pure, score ≥ 30. C'est LE point d'entrée quand l'utilisateur demande 'quelles actions acheter' ou 'que faire avec mon capital'.",
    inputSchema: {
      type: "object",
      properties: {
        lookbackDays: i("Fenêtre en jours (1–365)", 90, 1, 365),
        limit:        i("Max résultats (1–50)", 20, 1, 50),
      },
      additionalProperties: false,
    },
  },

  // ── ENRICHMENT ──────────────────────────────────────────────────────────────
  {
    name: "get_company",
    category: "enrichment",
    description:
      "Fiche complète d'une société : identité, fondamentaux Yahoo (P/E, ROE, D/E), consensus analystes (reco, target), technicals (52-week, 50/200 DMA, dividend yield), dernière date de fraîcheur par bloc.",
    inputSchema: {
      type: "object",
      properties: {
        slug: s("Slug de la société (obtenu via search_companies)"),
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "get_company_declarations",
    category: "enrichment",
    description: "Historique complet des déclarations AMF d'une société, triées par date desc.",
    inputSchema: {
      type: "object",
      properties: {
        slug:      s("Slug de la société"),
        direction: s("'BUY' | 'SELL' pour filtrer"),
        minScore:  n("Seuil signalScore"),
        limit:     i("Max (1–200)", 30, 1, 200),
        offset:    i("Pagination", 0, 0),
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "get_insider",
    category: "enrichment",
    description:
      "Profil complet d'un dirigeant : sociétés auxquelles il/elle est rattaché(e) avec sa fonction, scores moyen/max historiques, genre inféré.",
    inputSchema: {
      type: "object",
      properties: {
        slug: s("Slug du dirigeant (obtenu via search_insiders)"),
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "get_insider_declarations",
    category: "enrichment",
    description: "Historique de toutes les transactions d'un dirigeant, toutes sociétés confondues.",
    inputSchema: {
      type: "object",
      properties: {
        slug:   s("Slug du dirigeant"),
        limit:  i("Max (1–200)", 30, 1, 200),
        offset: i("Pagination", 0, 0),
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "get_declaration",
    category: "enrichment",
    description:
      "Détail d'une déclaration unique par amfId, avec son backtest complet (retours T+30/60/90/160/365/730) si calculé.",
    inputSchema: {
      type: "object",
      properties: {
        amfId: s("Identifiant AMF (ex: '2026DD1108988')"),
      },
      required: ["amfId"],
      additionalProperties: false,
    },
  },

  // ── SYSTEM ──────────────────────────────────────────────────────────────────
  {
    name: "get_site_stats",
    category: "system",
    description:
      "Compteurs globaux : nb déclarations (total, 24h, 7j, 30j), nb sociétés, nb dirigeants, nb backtests, score moyen.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_system_health",
    category: "system",
    description:
      "État de la base : reachability, latence DB, horodatage de chaque étape de la pipeline (dernière publication AMF, dernier scoring, dernier backtest, dernier enrich Yahoo).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_backtest_stats",
    category: "system",
    description:
      "Statistiques backtest agrégées : retours moyens T+30/60/90/160/365/730, win rate à T+90 pour BUY et SELL. Filtrable par direction, score min, période.",
    inputSchema: {
      type: "object",
      properties: {
        direction: s("'BUY' | 'SELL' pour filtrer"),
        minScore:  n("Seuil signalScore de la déclaration sous-jacente"),
        from:      s("ISO date"),
        to:        s("ISO date"),
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_account_usage",
    category: "system",
    description:
      "Usage de la clé API utilisée pour cet appel : nb requêtes totales, aujourd'hui, date de création, dernier appel.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },

  // ── COMPOSITE ───────────────────────────────────────────────────────────────
  {
    name: "get_company_full_profile",
    category: "composite",
    description:
      "PROFIL 360° d'une société en 1 appel : identité + fondamentaux + 10 dernières déclarations + scores agrégés + stats backtest. Utilisé pour 'donne-moi tout sur X'.",
    inputSchema: {
      type: "object",
      properties: {
        slug: s("Slug de la société"),
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "get_insider_activity_summary",
    category: "composite",
    description:
      "Résumé d'activité d'un dirigeant : toutes ses sociétés (avec fonction occupée), total achats/ventes, montant cumulé, score moyen, dernière transaction.",
    inputSchema: {
      type: "object",
      properties: {
        slug: s("Slug du dirigeant"),
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "compare_companies",
    category: "composite",
    description:
      "Comparaison côte-à-côte de 2 à 5 sociétés sur : capitalisation, P/E, consensus analyste, activité insider (derniers 90j), score moyen. Utilisé pour 'LVMH vs Hermès'.",
    inputSchema: {
      type: "object",
      properties: {
        slugs: {
          type: "array",
          items: { type: "string" },
          description: "2 à 5 slugs de sociétés",
          minItems: 2,
          maxItems: 5,
        },
      },
      required: ["slugs"],
      additionalProperties: false,
    },
  },
  {
    name: "find_clustered_trades",
    category: "composite",
    description:
      "Trouve les sociétés où ≥ 2 dirigeants ont tradé dans une fenêtre ±30 jours (cluster). Signal fort en analyse insider trading.",
    inputSchema: {
      type: "object",
      properties: {
        lookbackDays: i("Fenêtre en jours (7–180)", 30, 7, 180),
        minInsiders:  i("Nombre min de dirigeants (2–10)", 2, 2, 10),
        direction:    s("'BUY' | 'SELL' pour filtrer"),
        limit:        i("Max (1–30)", 10, 1, 30),
      },
      additionalProperties: false,
    },
  },
  {
    name: "analyze_declaration",
    category: "composite",
    description:
      "Analyse contextualisée d'une déclaration : détail + backtest + 5 autres trades récents sur la même société + fondamentaux actuels + cluster status.",
    inputSchema: {
      type: "object",
      properties: {
        amfId: s("Identifiant AMF"),
      },
      required: ["amfId"],
      additionalProperties: false,
    },
  },
  {
    name: "watch_isins",
    category: "composite",
    description:
      "Surveillance d'un portefeuille : pour une liste d'ISINs, retourne toute l'activité insider des N derniers jours, triée par fraîcheur et score.",
    inputSchema: {
      type: "object",
      properties: {
        isins: {
          type: "array",
          items: { type: "string" },
          description: "Liste d'ISINs à surveiller (1–50)",
          minItems: 1,
          maxItems: 50,
        },
        lookbackDays: i("Jours en arrière (1–90)", 7, 1, 90),
        minScore:     n("Seuil signalScore (défaut 30)"),
      },
      required: ["isins"],
      additionalProperties: false,
    },
  },
];

/** Map for quick lookup by name. */
export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

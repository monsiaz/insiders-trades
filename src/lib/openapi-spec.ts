/**
 * Hand-crafted OpenAPI 3.1 spec for Insiders Trades Sigma REST API.
 * Exposed verbatim at /api/openapi.json.
 */

const SERVER_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://insiders-trades-sigma.vercel.app";

const commonResponses = {
  "401": {
    description: "Missing or invalid API key",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
      },
    },
  },
  "404": {
    description: "Resource not found",
    content: {
      "application/json": { schema: { $ref: "#/components/schemas/Error" } },
    },
  },
  "500": {
    description: "Server error",
    content: {
      "application/json": { schema: { $ref: "#/components/schemas/Error" } },
    },
  },
};

const metaSchema = {
  type: "object",
  properties: {
    requestedAt: { type: "string", format: "date-time" },
    latencyMs: { type: "integer", example: 47 },
    dataFreshness: {
      type: "object",
      additionalProperties: { type: ["string", "null"], format: "date-time" },
      description: "Per-field timestamps indicating when the underlying data was last refreshed",
    },
  },
  required: ["requestedAt", "latencyMs"],
};

export function buildOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Insiders Trades Sigma · Public REST API",
      version: "1.0.0",
      description: `
API publique d'Insiders Trades Sigma. Toutes les données publiques AMF (déclarations
de transactions de dirigeants) et leur enrichissement (scoring, backtests, fondamentaux
Yahoo, signaux composites) sont accessibles via cette API.

## Authentification
Chaque requête doit inclure une clé API :
  - \`Authorization: Bearer <your_api_key>\` · **recommandé**
  - \`X-Api-Key: <your_api_key>\` · alternative

Les clés sont créées depuis votre compte (page **Mon compte → Clés API**). La clé est affichée
**une seule fois** à la création. Stockez-la en lieu sûr.

## Rate limits
- Clé \`read\` : 5 000 requêtes/jour (reset 00h UTC).
- Aucune limite en burst (10 req/s) en beta.

## Métadonnées universelles
Toute réponse inclut un champ \`meta\` avec \`latencyMs\` et la fraîcheur de chaque donnée renvoyée
(\`dataFreshness\`), pour que votre code client puisse décider s'il re-interroge ou non.

## Champs numériques BigInt
Les montants (marketCap, revenue, totalAmount…) sont retournés en **nombres**. Pour les très grosses
valeurs, considérez les overflow potentiels côté client (JSON JS float = 2^53).
      `.trim(),
      contact: { name: "Support", email: "simon.azoulay.pro@gmail.com" },
      license: { name: "Proprietary" },
    },
    servers: [{ url: SERVER_URL, description: "Production" }],
    security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
    tags: [
      { name: "Authentication", description: "Vérification de la clé API" },
      { name: "Health & Stats",  description: "État du système et compteurs globaux" },
      { name: "Companies",       description: "Sociétés suivies" },
      { name: "Insiders",        description: "Dirigeants déclarants" },
      { name: "Declarations",    description: "Déclarations AMF (transactions)" },
      { name: "Signals",         description: "Signaux scorés (top achats / ventes)" },
      { name: "Backtest",        description: "Statistiques backtest historique" },
      { name: "Search",          description: "Recherche cross-entités" },
    ],
    paths: {
      "/api/v1/me": {
        get: {
          tags: ["Authentication"],
          summary: "Vérifie la clé et renvoie l'identité",
          operationId: "getMe",
          responses: {
            "200": {
              description: "Clé valide",
              content: { "application/json": { schema: { $ref: "#/components/schemas/MeResponse" } } },
            },
            ...commonResponses,
          },
        },
      },
      "/api/v1/health": {
        get: {
          tags: ["Health & Stats"],
          summary: "Santé du système",
          description: "Latence DB, fraîcheur des données, dernier cron.",
          operationId: "getHealth",
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/HealthResponse" } } } },
            ...commonResponses,
          },
        },
      },
      "/api/v1/stats": {
        get: {
          tags: ["Health & Stats"],
          summary: "Compteurs globaux",
          operationId: "getStats",
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/StatsResponse" } } } },
            ...commonResponses,
          },
        },
      },
      "/api/v1/companies": {
        get: {
          tags: ["Companies"],
          summary: "Liste des sociétés",
          operationId: "listCompanies",
          parameters: [
            { name: "q",       in: "query", schema: { type: "string" },  description: "Recherche par nom" },
            { name: "isin",    in: "query", schema: { type: "string" },  description: "Filtre ISIN exact" },
            { name: "market",  in: "query", schema: { type: "string" },  description: "Filtre marché (ex: \"Euronext Paris\")" },
            { name: "hasLogo", in: "query", schema: { type: "boolean" } },
            { name: "sort",    in: "query", schema: { type: "string", enum: ["name", "marketCap", "recent"] } },
            { name: "order",   in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
            { name: "limit",   in: "query", schema: { type: "integer", default: 50, minimum: 1, maximum: 200 } },
            { name: "offset",  in: "query", schema: { type: "integer", default: 0, minimum: 0 } },
          ],
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/CompanyList" } } } },
            ...commonResponses,
          },
        },
      },
      "/api/v1/companies/{slug}": {
        get: {
          tags: ["Companies"],
          summary: "Détail d'une société (avec fondamentaux)",
          operationId: "getCompany",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/CompanyDetail" } } } },
            ...commonResponses,
          },
        },
      },
      "/api/v1/companies/{slug}/declarations": {
        get: {
          tags: ["Companies"],
          summary: "Déclarations AMF pour une société",
          operationId: "getCompanyDeclarations",
          parameters: [
            { name: "slug",      in: "path",  required: true, schema: { type: "string" } },
            { name: "direction", in: "query", schema: { type: "string", enum: ["BUY", "SELL"] } },
            { name: "minScore",  in: "query", schema: { type: "number", minimum: 0, maximum: 100 } },
            { name: "limit",     in: "query", schema: { type: "integer", default: 50, minimum: 1, maximum: 200 } },
            { name: "offset",    in: "query", schema: { type: "integer", default: 0 } },
          ],
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/DeclarationList" } } } },
            ...commonResponses,
          },
        },
      },
      "/api/v1/insiders": {
        get: {
          tags: ["Insiders"],
          summary: "Liste des dirigeants",
          operationId: "listInsiders",
          parameters: [
            { name: "q",      in: "query", schema: { type: "string" } },
            { name: "limit",  in: "query", schema: { type: "integer", default: 50, minimum: 1, maximum: 200 } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          ],
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/InsiderList" } } } },
            ...commonResponses,
          },
        },
      },
      "/api/v1/insiders/{slug}": {
        get: {
          tags: ["Insiders"],
          summary: "Détail d'un dirigeant",
          operationId: "getInsider",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/InsiderDetail" } } } },
            ...commonResponses,
          },
        },
      },
      "/api/v1/insiders/{slug}/declarations": {
        get: {
          tags: ["Insiders"],
          summary: "Historique des transactions d'un dirigeant",
          operationId: "getInsiderDeclarations",
          parameters: [
            { name: "slug",   in: "path", required: true, schema: { type: "string" } },
            { name: "limit",  in: "query", schema: { type: "integer", default: 50 } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          ],
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/DeclarationList" } } } },
            ...commonResponses,
          },
        },
      },
      "/api/v1/declarations": {
        get: {
          tags: ["Declarations"],
          summary: "Recherche avancée de déclarations",
          operationId: "listDeclarations",
          parameters: [
            { name: "from",      in: "query", schema: { type: "string", format: "date-time" }, description: "Filtre pubDate ≥ from" },
            { name: "to",        in: "query", schema: { type: "string", format: "date-time" }, description: "Filtre pubDate ≤ to" },
            { name: "minScore",  in: "query", schema: { type: "number" } },
            { name: "maxScore",  in: "query", schema: { type: "number" } },
            { name: "direction", in: "query", schema: { type: "string", enum: ["BUY", "SELL"] } },
            { name: "cluster",   in: "query", schema: { type: "boolean" } },
            { name: "minAmount", in: "query", schema: { type: "number" } },
            { name: "company",   in: "query", schema: { type: "string" }, description: "Recherche nom société" },
            { name: "insider",   in: "query", schema: { type: "string" } },
            { name: "isin",      in: "query", schema: { type: "string" } },
            { name: "sort",      in: "query", schema: { type: "string", enum: ["pubDate", "signalScore", "amount"] } },
            { name: "order",     in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
            { name: "limit",     in: "query", schema: { type: "integer", default: 50, minimum: 1, maximum: 200 } },
            { name: "offset",    in: "query", schema: { type: "integer", default: 0 } },
          ],
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/DeclarationList" } } } },
            ...commonResponses,
          },
        },
      },
      "/api/v1/declarations/{amfId}": {
        get: {
          tags: ["Declarations"],
          summary: "Détail d'une déclaration (inclut backtest)",
          operationId: "getDeclaration",
          parameters: [{ name: "amfId", in: "path", required: true, schema: { type: "string" }, example: "2026DD1108988" }],
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/DeclarationDetail" } } } },
            ...commonResponses,
          },
        },
      },
      "/api/v1/signals": {
        get: {
          tags: ["Signals"],
          summary: "Top signaux achats / ventes",
          operationId: "getSignals",
          parameters: [
            { name: "direction",    in: "query", schema: { type: "string", enum: ["BUY", "SELL"], default: "BUY" } },
            { name: "lookbackDays", in: "query", schema: { type: "integer", default: 7,  minimum: 1, maximum: 90 } },
            { name: "minScore",     in: "query", schema: { type: "integer", default: 40, minimum: 0, maximum: 100 } },
            { name: "limit",        in: "query", schema: { type: "integer", default: 20, minimum: 1, maximum: 100 } },
          ],
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/SignalsResponse" } } } },
            ...commonResponses,
          },
        },
      },
      "/api/v1/backtest": {
        get: {
          tags: ["Backtest"],
          summary: "Statistiques backtest (retours moyens T+30/60/90/160/365/730, win rate T+90)",
          operationId: "getBacktest",
          parameters: [
            { name: "direction", in: "query", schema: { type: "string", enum: ["BUY", "SELL"] } },
            { name: "minScore",  in: "query", schema: { type: "number" } },
            { name: "from",      in: "query", schema: { type: "string", format: "date-time" } },
            { name: "to",        in: "query", schema: { type: "string", format: "date-time" } },
          ],
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/BacktestResponse" } } } },
            ...commonResponses,
          },
        },
      },
      "/api/v1/search": {
        get: {
          tags: ["Search"],
          summary: "Recherche fuzzy sociétés + dirigeants",
          operationId: "search",
          parameters: [
            { name: "q",     in: "query", required: true, schema: { type: "string", minLength: 2 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 8, minimum: 1, maximum: 50 } },
          ],
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/SearchResponse" } } } },
            ...commonResponses,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: "apiKey", in: "header", name: "X-Api-Key" },
        BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "API key" },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              properties: {
                code:    { type: "string", example: "invalid_api_key" },
                message: { type: "string" },
                status:  { type: "integer" },
              },
            },
          },
        },
        Meta: metaSchema,
        Company: {
          type: "object",
          properties: {
            name: { type: "string" }, slug: { type: "string" }, isin: { type: "string", nullable: true },
            market: { type: "string", nullable: true }, yahooSymbol: { type: "string", nullable: true },
            marketCap: { type: "number", nullable: true }, currentPrice: { type: "number", nullable: true },
            trailingPE: { type: "number", nullable: true }, analystReco: { type: "string", nullable: true },
            targetMean: { type: "number", nullable: true }, logoUrl: { type: "string", nullable: true },
            declarationsCount: { type: "integer" },
            priceAt: { type: "string", format: "date-time", nullable: true },
            financialsAt: { type: "string", format: "date-time", nullable: true },
          },
        },
        CompanyList: {
          type: "object",
          properties: {
            total: { type: "integer" }, offset: { type: "integer" }, limit: { type: "integer" },
            items: { type: "array", items: { $ref: "#/components/schemas/Company" } },
            meta: { $ref: "#/components/schemas/Meta" },
          },
        },
        CompanyDetail: {
          allOf: [
            { $ref: "#/components/schemas/Company" },
            {
              type: "object",
              properties: {
                description:  { type: "string", nullable: true },
                sharesOut:    { type: "number", nullable: true },
                revenue:      { type: "number", nullable: true },
                ebitda:       { type: "number", nullable: true },
                netIncome:    { type: "number", nullable: true },
                totalDebt:    { type: "number", nullable: true },
                freeCashFlow: { type: "number", nullable: true },
                dilutedEps:   { type: "number", nullable: true },
                forwardPE:    { type: "number", nullable: true },
                priceToBook:  { type: "number", nullable: true },
                beta:         { type: "number", nullable: true },
                debtToEquity: { type: "number", nullable: true },
                targetHigh:   { type: "number", nullable: true },
                targetLow:    { type: "number", nullable: true },
                numAnalysts:  { type: "integer", nullable: true },
                fiftyTwoWeekHigh:     { type: "number", nullable: true },
                fiftyTwoWeekLow:      { type: "number", nullable: true },
                fiftyDayAverage:      { type: "number", nullable: true },
                twoHundredDayAverage: { type: "number", nullable: true },
                dividendYield:        { type: "number", nullable: true },
                analystAt:    { type: "string", format: "date-time", nullable: true },
                insidersCount: { type: "integer" },
                meta: { $ref: "#/components/schemas/Meta" },
              },
            },
          ],
        },
        Declaration: {
          type: "object",
          properties: {
            amfId: { type: "string" },
            pubDate: { type: "string", format: "date-time" },
            transactionDate: { type: "string", format: "date-time", nullable: true },
            pdfUrl: { type: "string" },
            company: {
              type: "object",
              properties: {
                name: { type: "string" }, slug: { type: "string" },
                yahooSymbol: { type: "string", nullable: true },
                marketCap: { type: "number", nullable: true },
              },
            },
            insider: {
              type: "object",
              properties: {
                name: { type: "string", nullable: true },
                slug: { type: "string", nullable: true },
                function: { type: "string", nullable: true },
              },
            },
            transaction: {
              type: "object",
              properties: {
                nature:     { type: "string", nullable: true },
                instrument: { type: "string", nullable: true },
                isin:       { type: "string", nullable: true },
                unitPrice:  { type: "number", nullable: true },
                volume:     { type: "number", nullable: true },
                totalAmount: { type: "number", nullable: true },
                currency:   { type: "string", nullable: true },
                venue:      { type: "string", nullable: true },
              },
            },
            signal: {
              type: "object",
              properties: {
                score:            { type: "number", nullable: true },
                pctOfMarketCap:   { type: "number", nullable: true },
                pctOfInsiderFlow: { type: "number", nullable: true },
                insiderCumNet:    { type: "number", nullable: true },
                isCluster:        { type: "boolean" },
                scoredAt:         { type: "string", format: "date-time", nullable: true },
              },
            },
          },
        },
        DeclarationList: {
          type: "object",
          properties: {
            total: { type: "integer" }, offset: { type: "integer" }, limit: { type: "integer" },
            items: { type: "array", items: { $ref: "#/components/schemas/Declaration" } },
            meta: { $ref: "#/components/schemas/Meta" },
          },
        },
        DeclarationDetail: {
          allOf: [
            { $ref: "#/components/schemas/Declaration" },
            {
              type: "object",
              properties: {
                type: { type: "string" },
                description: { type: "string" },
                pdfParsed: { type: "boolean" },
                backtest: {
                  type: "object",
                  nullable: true,
                  properties: {
                    direction: { type: "string" },
                    priceAtTrade: { type: "number", nullable: true },
                    price30d:  { type: "number", nullable: true },
                    price90d:  { type: "number", nullable: true },
                    price365d: { type: "number", nullable: true },
                    return30d: { type: "number", nullable: true },
                    return90d: { type: "number", nullable: true },
                    return365d: { type: "number", nullable: true },
                    computedAt: { type: "string", format: "date-time" },
                  },
                },
                createdAt: { type: "string", format: "date-time" },
                updatedAt: { type: "string", format: "date-time" },
                meta: { $ref: "#/components/schemas/Meta" },
              },
            },
          ],
        },
        Insider: {
          type: "object",
          properties: {
            name: { type: "string" }, slug: { type: "string" },
            gender: { type: "string", nullable: true },
            declarationsCount: { type: "integer" }, companiesCount: { type: "integer" },
          },
        },
        InsiderList: {
          type: "object",
          properties: {
            total: { type: "integer" }, offset: { type: "integer" }, limit: { type: "integer" },
            items: { type: "array", items: { $ref: "#/components/schemas/Insider" } },
            meta: { $ref: "#/components/schemas/Meta" },
          },
        },
        InsiderDetail: {
          allOf: [
            { $ref: "#/components/schemas/Insider" },
            {
              type: "object",
              properties: {
                companies: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      function: { type: "string", nullable: true },
                      company: { $ref: "#/components/schemas/Company" },
                    },
                  },
                },
                stats: {
                  type: "object",
                  properties: {
                    avgScore: { type: "number", nullable: true },
                    maxScore: { type: "number", nullable: true },
                  },
                },
                meta: { $ref: "#/components/schemas/Meta" },
              },
            },
          ],
        },
        MeResponse: {
          type: "object",
          properties: {
            key: {
              type: "object",
              properties: {
                id: { type: "string" }, name: { type: "string" }, prefix: { type: "string" },
                scopes: { type: "string" }, totalRequests: { type: "integer" },
              },
            },
            user: {
              type: "object",
              properties: {
                id: { type: "string" }, email: { type: "string" }, firstName: { type: "string", nullable: true },
                lastName: { type: "string", nullable: true }, role: { type: "string" },
              },
            },
            meta: { $ref: "#/components/schemas/Meta" },
          },
        },
        HealthResponse: {
          type: "object",
          properties: {
            status: { type: "string" },
            database: { type: "object", properties: { reachable: { type: "boolean" }, latencyMs: { type: "integer" } } },
            lastAmfPublicationAt: { type: "string", format: "date-time", nullable: true },
            lastIngestAt: { type: "string", format: "date-time", nullable: true },
            lastScoringAt: { type: "string", format: "date-time", nullable: true },
            lastBacktestAt: { type: "string", format: "date-time", nullable: true },
            lastFinancialsAt: { type: "string", format: "date-time", nullable: true },
            lastPriceAt: { type: "string", format: "date-time", nullable: true },
            meta: { $ref: "#/components/schemas/Meta" },
          },
        },
        StatsResponse: {
          type: "object",
          properties: {
            declarations: {
              type: "object",
              properties: {
                total: { type: "integer" }, typeDirigeants: { type: "integer" },
                last24h: { type: "integer" }, last7d: { type: "integer" }, last30d: { type: "integer" },
                avgSignalScore: { type: "number", nullable: true },
              },
            },
            companies: {
              type: "object",
              properties: { total: { type: "integer" }, enriched: { type: "integer" }, enrichedPct: { type: "integer" } },
            },
            insiders: { type: "object", properties: { total: { type: "integer" } } },
            backtests: { type: "object", properties: { total: { type: "integer" }, withReturn90d: { type: "integer" } } },
            meta: { $ref: "#/components/schemas/Meta" },
          },
        },
        SignalsResponse: {
          type: "object",
          properties: {
            direction: { type: "string", enum: ["BUY", "SELL"] },
            lookbackDays: { type: "integer" }, minScore: { type: "integer" }, count: { type: "integer" },
            items: { type: "array", items: { $ref: "#/components/schemas/Declaration" } },
            meta: { $ref: "#/components/schemas/Meta" },
          },
        },
        BacktestResponse: {
          type: "object",
          properties: {
            filters: { type: "object" },
            total: { type: "integer" },
            byDirection: { type: "object", additionalProperties: { type: "integer" } },
            averageReturnsPct: {
              type: "object",
              properties: {
                T30: { type: "number", nullable: true }, T60: { type: "number", nullable: true },
                T90: { type: "number", nullable: true }, T160: { type: "number", nullable: true },
                T365: { type: "number", nullable: true }, T730: { type: "number", nullable: true },
              },
            },
            sampleCounts: {
              type: "object",
              additionalProperties: { type: "integer" },
            },
            winRates90d: {
              type: "object",
              properties: {
                BUY: { type: "number", nullable: true }, SELL: { type: "number", nullable: true },
              },
            },
            meta: { $ref: "#/components/schemas/Meta" },
          },
        },
        SearchResponse: {
          type: "object",
          properties: {
            query: { type: "string" },
            companies: { type: "array", items: { $ref: "#/components/schemas/Company" } },
            insiders: { type: "array", items: { $ref: "#/components/schemas/Insider" } },
            meta: { $ref: "#/components/schemas/Meta" },
          },
        },
      },
    },
  };
}

<div align="center">

# InsidersTrades · Sigma

**A quantitative signal platform for French‐listed equities, built on public insider filings.**

Parse every AMF insider declaration the day it's published, score it against three years of backtested priors, rank the strongest convictions daily, and hand the user the same directional lens an institutional desk would use.

[**Live app →**](https://insiders-trades-sigma.vercel.app) &nbsp;·&nbsp; [Methodology](https://insiders-trades-sigma.vercel.app/methodologie) &nbsp;·&nbsp; [Transparent performance](https://insiders-trades-sigma.vercel.app/performance) &nbsp;·&nbsp; [Backtest](https://insiders-trades-sigma.vercel.app/backtest)

![Next.js 16](https://img.shields.io/badge/Next.js-16-000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma)
![Postgres](https://img.shields.io/badge/Postgres-Neon-336791?logo=postgresql&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-prod-000?logo=vercel)

</div>

---

## Why this exists

French listed companies are required by the **MAR 596/2014** regulation to declare insider transactions to the *Autorité des Marchés Financiers* within three business days. The filings are publicly available on the AMF **BDIF** feed — but they're raw PDFs, mixed with corporate actions, reclassifications and cross-entity options, and they go live with no structured metadata.

Sigma does four things on top of that raw feed:

1. **Ingests** every new BDIF declaration, parses the PDF, enriches it with Yahoo market data (price, market cap, analyst consensus, fundamentals).
2. **Scores** each trade with a 100-point composite (size vs. market cap, role, cluster strength, fundamentals, momentum).
3. **Backtests** the entire history on 22k+ real transactions since 2021, bucketing by role × market-cap-size to derive empirical win-rate and T+90 / T+365 return priors.
4. **Ranks** the top 10 actionable signals daily, delivers them by email digest, and exposes the full transparency trail (including the parts where the signal *doesn't* beat the index).

---

## Results

All figures computed live from 22 000+ declarations since 2021. Period = CAC 40 at historic highs, strongly bullish regime.

| Metric | Best filtered strategy | CAC 40 benchmark |
|---|---|---|
| **Annualized return** | **+16.3 %** | +6.3 % |
| **Alpha** | **+10.0 pts** | — |
| **Sharpe (annualized)** | 1.00 | — |
| **Years beating the index** | **4 / 4** since 2022 | — |
| **Max drawdown** | limited vs. CAC | — |

> **Honest disclaimer surfaced on the public app:** taken *raw* and unfiltered, the average insider signal does **not** beat the index in absolute terms. Sigma's alpha comes from the filter stack (role × conviction × cluster × historical-bucket prior), not from blindly following every declaration. The `/performance` page documents this end-to-end with sample sizes, information-leak analysis and per-role win rates. No cherry-picking.

---

## Features

### For the reader

- **Daily top 10 signals** — ranked by composite reco score, dedup'd by company, filtered by expected T+90 return.
- **Per-company tear-sheets** — last 90 days of insider activity, financial snapshot, backtest of previous signals on the same name, sector peers.
- **Per-insider profiles** — cumulative net buy/sell, role history across companies, hit rate.
- **Personal portfolio** — CSV import from major FR brokers, P&L tracking, cross-lookup with recent insider activity on holdings, sell-alert feed for positions.
- **Email digest** — branded daily alert with the top picks + personal alerts, delivered before market open.
- **Backtest lab** — public playground to recompute win rate, median return, Sharpe, drawdown over any filter combination (role, size, cluster, score threshold, holding period).
- **Methodology & transparency pages** — full scoring breakdown, information-leak study, freshness distribution vs. MAR deadline, benchmark comparison.

### For the operator

- **Resilient ingestion** — PDF parser handles the AMF's inconsistent templates (multi-page, OCR-recovered, partial tables) and normalizes 15+ transaction-nature variants.
- **Vision-audited logos** — GPT-4o Vision pipeline verifies every company logo before deployment (399/474 = 84 % coverage, WebP 200×200).
- **Admin dashboard** — users, credits, cron runs, data-quality metrics, retry controls.
- **Incremental cron** — daily sync, weekly re-score, monthly full reconciliation.
- **Auth + freemium gate** — JWT, bcrypt, forgot-password flow, beta-lockdown toggle for staged rollouts.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16 (App Router)** | Server components, streaming Suspense, ISR with per-page `revalidate`, client-side prefetch on hover. |
| Language | **TypeScript 5** (strict) | Catches data-model drift between Prisma + API + UI. |
| Database | **Postgres on Neon** (serverless) | Scales to zero, branch-per-PR, fits the bursty cron + read-heavy workload. |
| ORM | **Prisma 6** | Typed queries, `$queryRawUnsafe` for heavy aggregates pushed server-side. |
| Caching | **`unstable_cache`** | Per-key TTL on hot reads (reco buckets, companies list, recommendations) — dropped p95 from ~4 s to sub-second. |
| Styling | **Tailwind 4** + CSS variables | Full dual-theme (dark / light) via tokens; "Ink / Gold / Signal" 3-color palette. |
| Typography | **DM Serif Display** + **Banana Grotesk** + **JetBrains Mono** | Editorial finance aesthetic. |
| Charts | **Recharts** + hand-rolled SVG | Recharts for portfolio curves, custom SVG for the tear-sheet spark-lines and the "how it works" animations (zero canvas, theme-aware). |
| Market data | **yahoo-finance2** | Fundamentals, analyst consensus, price, market cap. |
| AI | **OpenAI GPT-4o** | PDF parse fallback, insider-gender classification, logo verification (Vision). |
| Auth | **jose** (JWT) + **bcryptjs** | Stateless sessions, password reset via email. |
| Email | **Nodemailer** + Gmail App Password | Branded HTML digest with signal cards and portfolio alerts. |
| Assets | **Vercel Blob** | Persistent storage for user-uploaded logos, CSV exports. |
| Deploy | **Vercel** (prod on `main`) | Edge runtime for public pages, Node runtime for PDF parsing & AI. |

---

## Architecture

```
                    ┌────────────────────────────────────────────────┐
                    │              AMF · BDIF  (public)              │
                    └─────────────────────┬──────────────────────────┘
                                          │  daily cron
                                          ▼
                    ┌────────────────────────────────────────────────┐
                    │   Ingestion pipeline (scripts/fast-parse.mjs)  │
                    │   ─ fetch XML feed  ─ download PDFs           │
                    │   ─ pdf-parse + regex + GPT-4o fallback       │
                    │   ─ normalize transaction natures              │
                    └─────────────────────┬──────────────────────────┘
                                          ▼
                    ┌────────────────────────────────────────────────┐
                    │   Enrichment (Yahoo, OpenAI, logo pipeline)    │
                    │   market cap, fundamentals, analysts, gender   │
                    └─────────────────────┬──────────────────────────┘
                                          ▼
                    ┌────────────────────────────────────────────────┐
                    │   Scoring engine  (src/lib/signals.ts)         │
                    │   composite 0-100 — see /methodologie          │
                    └─────────────────────┬──────────────────────────┘
                                          ▼
                    ┌────────────────────────────────────────────────┐
                    │   Backtest engine  (src/lib/backtest-compute)  │
                    │   T+90 / T+365 priors bucketed by role × size  │
                    └─────────────────────┬──────────────────────────┘
                                          ▼
                    ┌────────────────────────────────────────────────┐
                    │   Recommendation engine  (★ private build)     │
                    │   ranks + dedups + filters + top-N             │
                    └─────────────────────┬──────────────────────────┘
                                          ▼
                    ┌────────────────────────────────────────────────┐
                    │          Next.js app  ─  Vercel edge           │
                    │   pages · API · email digest · portfolio       │
                    └────────────────────────────────────────────────┘
```

---

## Data model (Prisma)

Ten core entities. The interesting ones:

- **`Company`** — slug, ISIN, Yahoo symbol, full market snapshot (price, mcap, 52w, PE/PB, ROE, margin, debt, institutional ownership, short ratio, analyst target & recommendation count), auto-fetched logo.
- **`Insider`** — normalized name, gender (auto-classified), cumulative buy/sell per company.
- **`Declaration`** — the atomic BDIF filing: AMF id, PDF link, pub date, transaction date, transaction nature, amount, ISIN, % of market cap, signal score, cluster flag.
- **`BacktestResult`** — per-declaration realised return at T+5 / T+30 / T+90 / T+365, pulled from Yahoo.
- **`User`**, **`PortfolioPosition`**, **`UserAlert`** — freemium accounts with holdings and alert preferences.
- **`Setting`**, **`ApiKey`**, **`CompanyInsider`** — plumbing.

See [`prisma/schema.prisma`](./prisma/schema.prisma).

---

## Scoring methodology (public)

The composite signal score (0 – 100) is a weighted sum, recalibrated in April 2026 after a 3-year retail-realistic backtest on 15 000 trades:

| Weight | Signal | Rationale |
|---:|---|---|
| **22 pts** | % of market cap traded | Size vs. float; capped at 100 %. |
| **12 pts** | % of insider's own flow | How emphatic is this trade relative to their history on this stock. |
| **16 pts** | Role (PDG · CFO · board · employee) | Executives with information asymmetry score higher. |
| **18 pts** | Cluster strength | ≥2 distinct insiders on the same name within 30 days — empirically the *only* robust alpha. |
| **4 pts** | Directional conviction | Net buyer/seller flag on the name. |
| **8 pts** | Fundamentals | PE, PB, FCF, ROE, margin, debt-to-equity. |
| **20 pts** | Composite market signals | Momentum (above 200d MA), value combo, quality combo, upside to analyst target, short-squeeze potential. |
| **−5 pts** | Staleness penalty | Signals older than 14 days get dinged. |

Full rationale, per-signal source code and empirical findings: [`/methodologie`](https://insiders-trades-sigma.vercel.app/methodologie) · [`src/lib/signals.ts`](./src/lib/signals.ts).

---

## What's in this repo (and what's not)

This repository is the **public showcase** of the Sigma platform. Most of the code is shipped as-is:

| Area | Public |
|---|---|
| UI / pages / components | ✅ full |
| Scoring engine (`signals.ts`) | ✅ full — documented on `/methodologie` |
| Backtest engine (`backtest-compute.ts`) | ✅ full — documented on `/performance` |
| Data ingestion & enrichment scripts | ✅ full |
| Prisma schema | ✅ full |
| Auth, portfolio, email digest | ✅ full |
| **Recommendation ranking engine** | 🔒 **stubbed** — the ranking heuristics, bucket look-ups, filter cut-offs and mode-specific rules live in the private production build. The public file at [`src/lib/recommendation-engine.ts`](./src/lib/recommendation-engine.ts) keeps the full type surface + API but returns an empty list. |

If you clone and run locally, every page will work except `/recommendations` (which will render an empty state). Everything else — backtest lab, company tear-sheets, portfolio, transparency reports — runs end-to-end against your own database.

---

## Running locally

Prerequisites: **Node 20+**, **PostgreSQL 14+** (Neon serverless works out of the box), an **OpenAI API key** if you want the PDF-parse fallback and the insider-gender classifier.

```bash
git clone https://github.com/monsiaz/insiders-trades.git
cd insiders-trades
npm install
cp .env.example .env     # fill in DATABASE_URL and CRON_SECRET
npx prisma migrate deploy
npm run dev
```

Open [`http://localhost:3000`](http://localhost:3000).

### Seeding data

The ingestion pipeline runs as a set of one-shot scripts (no background worker needed):

```bash
# 1. Pull the last 90 days of AMF declarations
node scripts/fast-parse-v2.mjs

# 2. Enrich with Yahoo data (market cap, fundamentals, analyst consensus)
node scripts/enrich-all-yahoo.mjs

# 3. Compute backtest results on each declaration
node scripts/recompute-backtest.mjs

# 4. Re-score the signal score on every declaration
npx tsx scripts/rescore-all.ts
```

Each script is idempotent and incremental — safe to re-run daily via cron.

### Required environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (Neon pooler recommended) |
| `CRON_SECRET` | Bearer token guarding the `/api/cron/*` endpoints |
| `OPENAI_API_KEY` | GPT-4o for PDF parse fallback, gender classifier, Vision logo audit |
| `JWT_SECRET` | App auth — any long random string |
| `GMAIL_APP_USER` / `GMAIL_APP_PASS` | SMTP for the email digest |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob — logo uploads, CSV exports |

`.env.example` is committed; the real values must never be.

---

## Repository layout

```
src/
├── app/                      # Next.js App Router pages + API routes
│   ├── page.tsx              # home — daily top signals + live feed
│   ├── recommendations/      # daily top 10 ranked recommendations
│   ├── companies/            # all tracked companies
│   ├── company/[slug]/       # per-company tear-sheet
│   ├── insiders/             # insider directory
│   ├── insider/[slug]/       # per-insider profile
│   ├── backtest/             # interactive backtest lab
│   ├── performance/          # transparency report
│   ├── methodologie/         # scoring methodology (public)
│   ├── strategie/            # Sigma strategy page
│   ├── fonctionnement/       # "how it works" with SVG animations
│   ├── portfolio/            # user portfolio dashboard
│   ├── admin/                # admin panel (users, credits, cron)
│   ├── auth/                 # login, register, forgot/reset password
│   └── api/                  # cron, sync, auth, admin, openapi
├── components/               # UI components — 40+ reusable pieces
└── lib/                      # domain logic
    ├── signals.ts            # scoring engine (public)
    ├── backtest-compute.ts   # backtest engine (public)
    ├── recommendation-engine.ts  # ranking (stubbed in public repo)
    ├── amf.ts · amf-detail.ts    # BDIF feed + PDF parsing
    ├── financials.ts             # Yahoo enrichment
    ├── winning-strategy.ts       # strategy filter selection
    ├── digest.ts                 # daily email builder
    ├── email.ts · auth.ts · api-auth.ts
    └── utils.ts · settings.ts · role-utils.ts

scripts/                      # 70+ one-shot & cron jobs
prisma/                       # schema + migrations
public/                       # static assets, brand kit
```

---

## License & attribution

This repository is published as a **public reference** — MIT-licensed code, but the trading signals, scoring engine outputs and UI are provided **for educational and transparency purposes only**.

- Data source: [AMF BDIF](https://www.amf-france.org/) — public filings.
- Market data: Yahoo Finance via `yahoo-finance2`.
- None of this constitutes financial advice. Past performance is not indicative of future results. Always do your own research.

Built by [Simon Azoulay](https://github.com/monsiaz) · deployed on Vercel · made with Cursor.

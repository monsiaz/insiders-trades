"use client";

import { useEffect, useState, useRef, FormEvent } from "react";
import Link from "next/link";
import { lp } from "@/lib/locale-path";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import Papa from "papaparse";
import { BarChart2, Bell } from "lucide-react";
import { PortfolioPerformance } from "./PortfolioPerformance";

interface Position {
  id: string;
  name: string;
  isin: string | null;
  yahooSymbol: string | null;
  quantity: number;
  buyingPrice: number;
  currentPrice: number | null;
  lastUpdated: string | null;
  totalInvested: number;
  currentValue: number | null;
  pnl: number | null;
  pnlPct: number | null;
  alertBelow: number | null;
  alertAbove: number | null;
  notes: string | null;
  fromApp: boolean;
  assetType?: string | null;
  annualYield?: number | null;
  yieldStartDate?: string | null;
  yieldEndDate?: string | null;
}

interface User {
  id: string;
  email: string;
  name: string | null;
  /** PEA | PEA_PME | CTO | OTHER — used for the badge label + (future) eligibility filters */
  accountType?: string | null;
}
interface PortfolioSummary { portfolioCash: number | null }

type Locale = "en" | "fr";

/**
 * Map the DB accountType enum to the visible badge label (FR + EN).
 * PEA_PME is the default since the v3 Sigma strategy (mid-cap 200M-1B€)
 * is aligned with PEA-PME eligibility rules (<5000 employees, <1.5B€ CA).
 */
function accountBadge(accountType: string | null | undefined, locale: Locale): string {
  const t = (accountType ?? "PEA_PME").toUpperCase();
  switch (t) {
    case "PEA_PME":   return "Portfolio PEA-PME";
    case "PEA":       return "Portfolio PEA";
    case "CTO":       return locale === "fr" ? "Portfolio CTO" : "Portfolio (CTO)";
    default:          return locale === "fr" ? "Portfolio" : "Portfolio";
  }
}

const DICT = {
  en: {
    badge: "Portfolio",
    title: "My",
    titleSpan: "Portfolio",
    updatedRecently: "Updated recently",
    refreshBtn: "Refresh prices",
    refreshing: "Updating…",
    alertTriggered: (n: number) => `${n} alert${n > 1 ? "s" : ""} triggered`,
    alertBelow: (cur: string, low: string) => `price ${cur} ≤ low alert ${low}`,
    alertAbove: (cur: string, high: string) => `price ${cur} ≥ high alert ${high}`,
    totalPortfolio: "Total Portfolio (stocks + cash)",
    cashBalance: (d: string) => `Available cash ${d}`,
    cash: "Cash",
    stockValue: "Stock valuation",
    unrealizedPnl: "Unrealized P&L",
    tabPositions: (n: number) => `Positions (${n})`,
    tabAdd: "Add",
    tabEdit: "Edit",
    tabImport: "Import CSV",
    noPositions: "No positions yet. Add securities or import a CSV.",
    addManually: "+ Add manually",
    allocation: "Portfolio allocation",
    insiderTitle: "AMF Trades on your holdings",
    insiderSub: "executives who recently bought your securities",
    colSecurity: "Security",
    colQty: "Qty",
    colAvgCost: "Avg cost",
    colPrice: "Price",
    colValue: "Value",
    colAlert: "Alert",
    formTitle: (editing: boolean) => editing ? "Edit position" : "Add a position",
    fieldName: "Security name *",
    fieldIsin: "ISIN (optional)",
    fieldQty: "Quantity *",
    fieldAvgCost: "Avg cost (buy price) *",
    alertsTitle: "Price alerts (optional)",
    alertBelow2: "Alert if price ≤ €",
    alertAbove2: "Alert if price ≥ €",
    fieldNotes: "Notes (optional)",
    notesPlaceholder: "Investment thesis, target…",
    saving: "Saving…",
    saveBtn: (editing: boolean) => editing ? "Update" : "Add position",
    cancel: "Cancel",
    deleteConfirm: "Delete this position?",
    required: "Name, quantity and buy price are required",
    errorFallback: "Error",
    csvTitle: "Expected CSV format",
    csvSep: "Separator:",
    csvEnc: "Encoding: UTF-8 · Decimals: dot",
    csvCompat: "Compatible with Boursorama, BNP, Société Générale exports. Columns lastPrice, amount, etc. are ignored.",
    csvDownload: "↓ Download CSV template",
    importTitle: "Import your file",
    clickToChoose: "Click to choose a CSV file",
    dropHere: "or drag and drop here",
    preview: (n: number) => `Preview (${n} rows)`,
    importBtn: (n: number) => `Import ${n} positions`,
    importLoading: "Importing…",
    importDone: (n: number, errs: number) => `${n} positions imported${errs ? ` · ${errs} errors` : ""}`,
    linesDetected: (n: number) => `${n} rows detected, ready to import`,
    noPriceWarning: "Refresh prices to see real performance",
    yahooData: "Yahoo Finance data",
    estimatedCurve: "Estimated curve",
  },
  fr: {
    badge: "Portfolio",
    title: "Mon",
    titleSpan: "Portfolio",
    updatedRecently: "Mis à jour récemment",
    refreshBtn: "Actualiser les cours",
    refreshing: "Mise à jour…",
    alertTriggered: (n: number) => `${n} alerte${n > 1 ? "s" : ""} déclenchée${n > 1 ? "s" : ""}`,
    alertBelow: (cur: string, low: string) => `cours ${cur} ≤ alerte basse ${low}`,
    alertAbove: (cur: string, high: string) => `cours ${cur} ≥ alerte haute ${high}`,
    totalPortfolio: "Total Portefeuille (titres + espèces)",
    cashBalance: (d: string) => `Solde Espèces disponible ${d}`,
    cash: "Espèces",
    stockValue: "Évaluation titres",
    unrealizedPnl: "Montant +/- values latentes",
    tabPositions: (n: number) => `Positions (${n})`,
    tabAdd: "+ Ajouter",
    tabEdit: "Modifier",
    tabImport: "Importer CSV",
    noPositions: "Aucune position. Ajoutez des titres ou importez un CSV.",
    addManually: "+ Ajouter manuellement",
    allocation: "Répartition du portefeuille",
    insiderTitle: "Trades AMF sur vos positions",
    insiderSub: "dirigeants ayant récemment acheté vos titres",
    colSecurity: "Titre",
    colQty: "Qté",
    colAvgCost: "PRU",
    colPrice: "Cours",
    colValue: "Valeur",
    colAlert: "Alerte",
    formTitle: (editing: boolean) => editing ? "Modifier la position" : "Ajouter une position",
    fieldName: "Nom du titre *",
    fieldIsin: "ISIN (optionnel)",
    fieldQty: "Quantité *",
    fieldAvgCost: "PRU (prix moyen d'achat) *",
    alertsTitle: "Alertes de cours (optionnel)",
    alertBelow2: "Alerte si cours ≤ €",
    alertAbove2: "Alerte si cours ≥ €",
    fieldNotes: "Notes (optionnel)",
    notesPlaceholder: "Raison d'investissement, objectif…",
    saving: "Enregistrement…",
    saveBtn: (editing: boolean) => editing ? "Mettre à jour" : "Ajouter la position",
    cancel: "Annuler",
    deleteConfirm: "Supprimer cette position ?",
    required: "Nom, quantité et prix d'achat sont requis",
    errorFallback: "Erreur",
    csvTitle: "Format CSV attendu",
    csvSep: "Séparateur :",
    csvEnc: "Encodage : UTF-8 · Décimales : virgule",
    csvCompat: "Compatible avec les exports courtiers Boursorama, BNP, Société Générale, etc. Les colonnes lastPrice, amount, etc. sont ignorées.",
    csvDownload: "↓ Télécharger le modèle CSV",
    importTitle: "Importer votre fichier",
    clickToChoose: "Cliquez pour choisir un fichier CSV",
    dropHere: "ou glissez-déposez ici",
    preview: (n: number) => `Aperçu (${n} lignes)`,
    importBtn: (n: number) => `Importer ${n} positions`,
    importLoading: "Import en cours…",
    importDone: (n: number, errs: number) => `${n} positions importées${errs ? ` · ${errs} erreurs` : ""}`,
    linesDetected: (n: number) => `${n} lignes détectées, prêt à importer`,
    noPriceWarning: "Actualisez les cours pour voir la vraie perf",
    yahooData: "Données Yahoo Finance",
    estimatedCurve: "Courbe estimée",
  },
};

// DA v3: monochrome gold → navy gradient (no rainbow) for portfolio allocation chart
const COLORS = [
  "#B8955A", "#C9A772", "#A07F47", "#D4AF76", "#8C6C3D",
  "#17305C", "#3A5687", "#5E7BA8", "#112A46", "#1F3A6A",
];

function fmt(n: number | null | undefined, d = 2, locale: Locale = "en"): string {
  if (n == null) return "·";
  return n.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return "·";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function fmtEur(n: number | null | undefined, d = 0, locale: Locale = "en"): string {
  if (n == null) return "·";
  return n.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", { style: "currency", currency: "EUR", minimumFractionDigits: d, maximumFractionDigits: d });
}

function PnlBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-[var(--tx-3)] text-xs">·</span>;
  const isPos = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${isPos ? "bg-pos-soft tx-pos" : "bg-neg-soft tx-neg"}`}>
      {isPos ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

interface FormState {
  name: string; isin: string; quantity: string; buyingPrice: string;
  alertBelow: string; alertAbove: string; notes: string;
  assetType: string; annualYield: string; yieldStartDate: string; yieldEndDate: string;
}
const EMPTY_FORM: FormState = {
  name: "", isin: "", quantity: "", buyingPrice: "", alertBelow: "", alertAbove: "", notes: "",
  assetType: "STOCK", annualYield: "", yieldStartDate: "", yieldEndDate: "",
};

export function PortfolioDashboard({ user, locale = "en" }: { user: User; locale?: Locale }) {
  const T = DICT[locale];
  const [positions, setPositions] = useState<Position[]>([]);
  const [portfolioCash, setPortfolioCash] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"positions" | "add" | "import">("positions");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [importStatus, setImportStatus] = useState<string>("");
  const [importLoading, setImportLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function fetchPositions() {
    const res = await fetch("/api/portfolio/positions");
    const data = await res.json();
    setPositions(data.positions ?? []);
    setPortfolioCash(data.portfolioCash ?? null);
    setLoading(false);
  }

  useEffect(() => { fetchPositions(); }, []);

  async function refreshPrices() {
    setRefreshing(true);
    const res = await fetch("/api/portfolio/refresh", { method: "POST" });
    const data = await res.json();
    await fetchPositions();
    setRefreshing(false);
    if (data.failed?.length) console.warn("Not updated:", data.failed);
  }

  // ── Form helpers ──────────────────────────────────────────────────────────

  const setF = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function startEdit(pos: Position) {
    const isCrowd = pos.assetType === "CROWDFUNDING";
    setForm({
      name: pos.name,
      isin: pos.isin ?? "",
      quantity: isCrowd ? "" : String(pos.quantity),
      buyingPrice: isCrowd ? String(pos.totalInvested) : String(pos.buyingPrice),
      alertBelow: String(pos.alertBelow ?? ""),
      alertAbove: String(pos.alertAbove ?? ""),
      notes: pos.notes ?? "",
      assetType: pos.assetType ?? "STOCK",
      annualYield: pos.annualYield != null ? String(pos.annualYield) : "",
      yieldStartDate: pos.yieldStartDate ? pos.yieldStartDate.slice(0, 10) : "",
      yieldEndDate: pos.yieldEndDate ? pos.yieldEndDate.slice(0, 10) : "",
    });
    setEditId(pos.id);
    setTab("add");
  }

  function cancelEdit() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setTab("positions");
  }

  async function submitPosition(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    const isCrowd = form.assetType === "CROWDFUNDING";
    if (!form.name || !form.buyingPrice || (!isCrowd && !form.quantity)) {
      setFormError(T.required); return;
    }
    setFormLoading(true);
    try {
      const body: Record<string, unknown> = {
        id: editId,
        name: form.name,
        isin: form.isin || null,
        assetType: form.assetType,
        buyingPrice: parseFloat(form.buyingPrice.replace(",", ".")),
        alertBelow: form.alertBelow ? parseFloat(form.alertBelow.replace(",", ".")) : null,
        alertAbove: form.alertAbove ? parseFloat(form.alertAbove.replace(",", ".")) : null,
        notes: form.notes,
      };
      if (!isCrowd) body.quantity = parseFloat(form.quantity.replace(",", "."));
      if (isCrowd) {
        body.annualYield = form.annualYield ? parseFloat(form.annualYield.replace(",", ".")) : null;
        body.yieldStartDate = form.yieldStartDate || null;
        body.yieldEndDate = form.yieldEndDate || null;
      }
      const method = editId ? "PUT" : "POST";
      const res = await fetch("/api/portfolio/positions", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); setFormError(d.error ?? T.errorFallback); return; }
      setForm(EMPTY_FORM);
      setEditId(null);
      setTab("positions");
      await fetchPositions();
    } finally {
      setFormLoading(false);
    }
  }

  async function deletePosition(id: string) {
    if (!confirm(T.deleteConfirm)) return;
    await fetch("/api/portfolio/positions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await fetchPositions();
  }

  // ── CSV import ─────────────────────────────────────────────────────────────

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      delimiter: ";",
      skipEmptyLines: true,
      complete: (res) => {
        setImportRows(res.data as Record<string, string>[]);
        setImportStatus(T.linesDetected(res.data.length));
      },
    });
  }

  async function submitImport() {
    if (!importRows.length) return;
    setImportLoading(true);
    setImportStatus(T.importLoading);
    const res = await fetch("/api/portfolio/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: importRows }),
    });
    const data = await res.json();
    setImportStatus(T.importDone(data.imported, data.errors?.length ?? 0));
    setImportRows([]);
    setImportLoading(false);
    await fetchPositions();
    setTimeout(() => setTab("positions"), 1200);
  }

  // ── Computed stats ────────────────────────────────────────────────────────

  const totalInvested = positions.reduce((s, p) => s + p.totalInvested, 0);
  const totalValue = positions.reduce((s, p) => s + (p.currentValue ?? p.totalInvested), 0);
  const totalPnl = totalValue - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const priced = positions.filter((p) => p.currentPrice != null || p.assetType === "CROWDFUNDING");
  const gainers = positions.filter((p) => (p.pnlPct ?? 0) > 0).length;
  const losers = positions.filter((p) => (p.pnlPct ?? 0) < 0).length;

  // Alerts
  const alerts = positions.filter((p) =>
    (p.alertBelow != null && p.currentPrice != null && p.currentPrice <= p.alertBelow) ||
    (p.alertAbove != null && p.currentPrice != null && p.currentPrice >= p.alertAbove)
  );

  // Pie chart data
  const pieData = positions
    .map((p, i) => ({ name: p.name, value: p.currentValue ?? p.totalInvested, color: COLORS[i % COLORS.length] }))
    .sort((a, b) => b.value - a.value);

  // Sort positions by value desc
  const sorted = [...positions].sort((a, b) => (b.currentValue ?? b.totalInvested) - (a.currentValue ?? a.totalInvested));

  const tabs = [
    { id: "positions", label: T.tabPositions(positions.length) },
    { id: "add", label: editId ? T.tabEdit : T.tabAdd },
    { id: "import", label: T.tabImport },
  ] as const;

  if (loading) return (
    <div className="space-y-4">
      <div className="h-8 bg-white/10 rounded w-48 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1,2,3,4].map((i) => <div key={i} className="glass-card-static rounded-2xl p-4 animate-pulse h-20" />)}
      </div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4 animate-fade-in">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-card-static tx-brand text-xs font-semibold mb-4 bd-brand max-w-full overflow-hidden">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
            <span className="truncate">{accountBadge(user.accountType, locale)} · {user.name ?? user.email}</span>
          </div>
          <h1 className="text-3xl font-bold text-[var(--tx-1)] tracking-tight">{T.title} <span className="text-gradient-indigo">{T.titleSpan}</span></h1>
          <p className="text-[var(--tx-2)] text-sm mt-1">{positions.length} position{positions.length !== 1 ? "s" : ""} · {priced.length > 0 ? T.updatedRecently : "·"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshPrices} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl btn-glass text-sm font-medium disabled:opacity-50 transition-all">
            <svg className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {refreshing ? T.refreshing : T.refreshBtn}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="tx-gold text-sm font-semibold">{T.alertTriggered(alerts.length)}</span>
          </div>
          <div className="space-y-1">
            {alerts.map((p) => {
              const below = p.alertBelow != null && p.currentPrice != null && p.currentPrice <= p.alertBelow;
              return (
                <div key={p.id} className="text-sm tx-gold/80">
                  <strong>{p.name}</strong> : {below ? T.alertBelow(fmtEur(p.currentPrice, 2, locale), fmtEur(p.alertBelow, 2, locale)) : T.alertAbove(fmtEur(p.currentPrice, 2, locale), fmtEur(p.alertAbove, 2, locale))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Broker summary card */}
      {(portfolioCash != null || priced.length > 0) && (
        <div className="mb-6 card" style={{
          background: "linear-gradient(135deg, var(--bg-raised) 0%, var(--bg-surface) 100%)",
          borderColor: "var(--border-med)",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(200px, 100%), 1fr))", gap: 0, borderRadius: "14px", overflow: "hidden" }}>
            {[
              {
                label: T.totalPortfolio,
                value: fmtEur(totalValue + (portfolioCash ?? 0), 0, locale),
                color: "var(--tx-1)", bold: true,
              },
              {
                label: portfolioCash != null ? T.cashBalance(new Date().toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB")) : T.cash,
                value: portfolioCash != null ? fmtEur(portfolioCash, 0, locale) : "·",
                color: "var(--tx-2)", bold: false,
              },
              {
                label: T.stockValue,
                value: fmtEur(totalValue, 0, locale),
                color: "var(--tx-1)", bold: false,
              },
              {
                label: T.unrealizedPnl,
                value: `${totalPnl >= 0 ? "+" : ""}${fmtEur(totalPnl, 0, locale)} (${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)} %)`,
                color: totalPnl >= 0 ? "var(--c-emerald)" : "var(--c-crimson)", bold: true,
              },
            ].map((row, i) => (
              <div key={i} style={{
                padding: "14px 20px",
                borderBottom: i < 3 ? "1px solid var(--border)" : "none",
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px",
              }}>
                <span style={{ fontSize: "0.84rem", color: "var(--tx-2)", flex: 1 }}>{row.label}</span>
                <span style={{
                  fontSize: row.bold ? "0.95rem" : "0.88rem",
                  fontWeight: row.bold ? 700 : 600,
                  color: row.color,
                  fontFamily: "'Banana Grotesk', 'JetBrains Mono', monospace",
                  letterSpacing: "-0.02em",
                  flexShrink: 0,
                }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance chart + KPI strip */}
      <div className="mb-8">
        <PortfolioPerformance positions={positions} locale={locale} />
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto mb-6 -mx-1 px-1">
      <div className="flex gap-1 p-1 glass-card-static rounded-xl w-fit min-w-max">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => { if (t.id !== "add" || !editId) setEditId(null); setTab(t.id); if (t.id !== "add") setForm(EMPTY_FORM); }}
            className={`px-4 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-all ${tab === t.id ? "bg-brand-soft tx-brand border bd-brand" : "text-[var(--tx-2)] hover-tx-1"}`}>
            {t.label}
          </button>
        ))}
      </div>
      </div>

      {/* ── POSITIONS TAB ── */}
      {tab === "positions" && (
        <div className="space-y-6 animate-fade-in">
          {positions.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <div className="flex justify-center mb-3 opacity-30"><BarChart2 size={40} strokeWidth={1.2} /></div>
              <p className="text-[var(--tx-2)] mb-4">{T.noPositions}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <button onClick={() => setTab("add")} className="px-4 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-[var(--tx-1)] text-sm font-semibold">{T.addManually}</button>
                <button onClick={() => setTab("import")} className="px-4 py-2.5 min-h-[44px] rounded-xl btn-glass text-sm">{T.tabImport}</button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Positions table */}
                <div className="lg:col-span-2 glass-card-static rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[580px]">
                      <thead>
                        <tr className="text-left text-xs text-[var(--tx-3)] border-b border-white/8">
                          <th className="p-4 font-medium">{T.colSecurity}</th>
                          <th className="p-4 font-medium text-right">{T.colQty}</th>
                          <th className="p-4 font-medium text-right">{T.colAvgCost}</th>
                          <th className="p-4 font-medium text-right">{T.colPrice}</th>
                          <th className="p-4 font-medium text-right">{T.colValue}</th>
                          <th className="p-4 font-medium text-right">P&L</th>
                          <th className="p-4 font-medium text-center">{T.colAlert}</th>
                          <th className="p-4 w-16" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {sorted.map((pos) => {
                          const alertTriggered = alerts.some((a) => a.id === pos.id);
                          return (
                            <tr key={pos.id} className={`hover:bg-white/3 transition-colors ${alertTriggered ? "bg-amber-500/5" : ""}`}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-[var(--tx-1)] text-sm">{pos.name}</span>
                                  {pos.assetType === "CROWDFUNDING" && (
                                    <span style={{
                                      display: "inline-flex", alignItems: "center", gap: "3px",
                                      padding: "1px 6px", borderRadius: "4px",
                                      fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.05em",
                                      background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)",
                                      color: "rgb(52,211,153)", flexShrink: 0,
                                    }}>
                                      🏗️ CROWD
                                    </span>
                                  )}
                                  {pos.fromApp && (
                                    <span style={{
                                      display: "inline-flex", alignItems: "center", gap: "3px",
                                      padding: "1px 6px", borderRadius: "4px",
                                      fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.05em",
                                      background: "var(--gold-bg)", border: "1px solid var(--gold-bd)",
                                      color: "var(--gold)", flexShrink: 0,
                                    }}>
                                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/>
                                      </svg>
                                      APP
                                    </span>
                                  )}
                                </div>
                                {pos.isin && <div className="text-[11px] text-[var(--tx-3)] font-mono">{pos.isin}</div>}
                                {pos.yahooSymbol && <div className="text-[11px] tx-brand">{pos.yahooSymbol}</div>}
                                {pos.assetType === "CROWDFUNDING" && pos.annualYield != null && (
                                  <div className="text-[11px] text-emerald-400 font-semibold">{pos.annualYield}% / an</div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-[var(--tx-2)] text-xs">
                                {pos.assetType === "CROWDFUNDING" ? (
                                  pos.yieldEndDate ? (
                                    <span className="text-[11px] text-[var(--tx-3)]">
                                      {locale === "fr" ? "Fin" : "End"} {new Date(pos.yieldEndDate).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { month: "short", year: "2-digit" })}
                                    </span>
                                  ) : <span className="text-[var(--tx-3)]">·</span>
                                ) : fmt(pos.quantity, 2, locale)}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-[var(--tx-2)] text-xs">
                                {pos.assetType === "CROWDFUNDING" ? (
                                  <span className="text-emerald-400 text-[11px] font-semibold">
                                    {fmtEur(pos.totalInvested, 0, locale)}
                                  </span>
                                ) : fmtEur(pos.buyingPrice, 2, locale)}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-xs">
                                {pos.assetType === "CROWDFUNDING" ? (
                                  pos.pnl != null ? (
                                    <span className="text-emerald-400">+{fmtEur(pos.pnl, 2, locale)}</span>
                                  ) : <span className="text-[var(--tx-3)]">·</span>
                                ) : pos.currentPrice != null ? (
                                  <span className="text-[var(--tx-1)]">{fmtEur(pos.currentPrice, 2, locale)}</span>
                                ) : <span className="text-[var(--tx-3)]">·</span>}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-xs text-[var(--tx-2)]">
                                {fmtEur(pos.currentValue ?? pos.totalInvested, 0, locale)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <PnlBadge pct={pos.pnlPct} />
                                {pos.pnl != null && pos.assetType !== "CROWDFUNDING" && <div className="text-[11px] tabular-nums text-[var(--tx-3)] mt-0.5">{fmtEur(pos.pnl, 0, locale)}</div>}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {alertTriggered ? <Bell size={13} className="tx-gold" /> :
                                  (pos.alertBelow || pos.alertAbove) ? <Bell size={13} className="text-[var(--tx-3)]" /> : null}
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex gap-1">
                                  <button onClick={() => startEdit(pos)} className="p-2.5 min-w-[36px] min-h-[36px] rounded text-[var(--tx-3)] hover:tx-brand transition-colors flex items-center justify-center">
                                    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                                  </button>
                                  <button onClick={() => deletePosition(pos.id)} className="p-2.5 min-w-[36px] min-h-[36px] rounded text-[var(--tx-3)] hover:tx-neg transition-colors flex items-center justify-center">
                                    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pie chart */}
                <div className="glass-card rounded-2xl p-6">
                  <h3 className="text-sm font-semibold text-[var(--tx-1)] mb-4">{T.allocation}</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value">
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.85} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#0a0a1f", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#f1f5f9" }}
                        formatter={(v) => [fmtEur(Number(v), 0, locale), ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-2 max-h-40 overflow-y-auto">
                    {pieData.map((d, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                          <span className="text-[var(--tx-2)] truncate max-w-[110px]">{d.name}</span>
                        </div>
                        <span className="text-[var(--tx-2)] tabular-nums">{totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(1) : 0}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Insider trades matching */}
              <InsiderMatchSection positions={positions} locale={locale} />
            </>
          )}
        </div>
      )}

      {/* ── ADD/EDIT TAB ── */}
      {tab === "add" && (
        <div className="w-full max-w-lg animate-fade-in">
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-base font-semibold text-[var(--tx-1)] mb-5">{T.formTitle(!!editId)}</h2>
            <form onSubmit={submitPosition} className="space-y-4">
              {formError && <div className="bg-neg-soft border bd-neg rounded-xl px-4 py-3 text-sm tx-neg">{formError}</div>}

              {/* Asset type selector */}
              {!editId && (
                <div className="flex gap-2 p-1 bg-white/5 rounded-xl">
                  {(["STOCK", "CROWDFUNDING"] as const).map((t) => (
                    <button key={t} type="button"
                      onClick={() => setForm((f) => ({ ...f, assetType: t }))}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${form.assetType === t ? "bg-indigo-500/30 text-indigo-300 border border-indigo-500/40" : "text-[var(--tx-3)] hover:text-[var(--tx-2)]"}`}>
                      {t === "STOCK" ? (locale === "fr" ? "📈 Action / ETF" : "📈 Stock / ETF") : (locale === "fr" ? "🏗️ Crowdfunding" : "🏗️ Crowdfunding")}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">{T.fieldName}</label>
                  <input type="text" required value={form.name} onChange={setF("name")}
                    className="w-full glass-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                    placeholder={form.assetType === "CROWDFUNDING" ? "ex: BAUER BOX - PHASE 2" : "ex: NANOBIOTIX"} />
                </div>

                {form.assetType === "STOCK" && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">{T.fieldIsin}</label>
                      <input type="text" value={form.isin} onChange={setF("isin")}
                        className="w-full glass-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                        placeholder="FR0011341205" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">{T.fieldQty}</label>
                      <input type="text" required value={form.quantity} onChange={setF("quantity")}
                        className="w-full glass-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                        placeholder="114" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">{T.fieldAvgCost}</label>
                      <input type="text" required value={form.buyingPrice} onChange={setF("buyingPrice")}
                        className="w-full glass-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                        placeholder="3.54" />
                    </div>
                  </>
                )}

                {form.assetType === "CROWDFUNDING" && (
                  <>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">
                        {locale === "fr" ? "Capital investi (€) *" : "Invested capital (€) *"}
                      </label>
                      <input type="text" required value={form.buyingPrice} onChange={setF("buyingPrice")}
                        className="w-full glass-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                        placeholder="5000" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">
                        {locale === "fr" ? "Rendement annuel (%) *" : "Annual yield (%) *"}
                      </label>
                      <input type="text" required value={form.annualYield} onChange={setF("annualYield")}
                        className="w-full glass-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 transition-all"
                        placeholder="9.75" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">
                        {locale === "fr" ? "Date de début *" : "Start date *"}
                      </label>
                      <input type="date" required value={form.yieldStartDate} onChange={setF("yieldStartDate")}
                        className="w-full glass-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">
                        {locale === "fr" ? "Date de fin prévisionnelle (optionnel)" : "Expected end date (optional)"}
                      </label>
                      <input type="date" value={form.yieldEndDate} onChange={setF("yieldEndDate")}
                        className="w-full glass-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all" />
                    </div>
                    {/* Accrued interest preview */}
                    {form.buyingPrice && form.annualYield && form.yieldStartDate && (
                      <div className="col-span-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm">
                        {(() => {
                          const capital = parseFloat(form.buyingPrice.replace(",", ".")) || 0;
                          const yield_ = parseFloat(form.annualYield.replace(",", ".")) || 0;
                          const days = (Date.now() - new Date(form.yieldStartDate).getTime()) / 86400_000;
                          const accrued = Math.round(capital * (yield_ / 100) * (days / 365) * 100) / 100;
                          const total = Math.round((capital + accrued) * 100) / 100;
                          return (
                            <span className="text-emerald-400">
                              {locale === "fr"
                                ? `Intérêts courus : +${accrued.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} € · Valeur actuelle : ${total.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`
                                : `Accrued interest: +${accrued.toFixed(2)} € · Current value: ${total.toFixed(2)} €`}
                            </span>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}
              </div>

              {form.assetType === "STOCK" && (
                <div className="border-t border-white/8 pt-4">
                  <p className="text-xs text-[var(--tx-3)] mb-3">{T.alertsTitle}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">{T.alertBelow2}</label>
                      <input type="text" value={form.alertBelow} onChange={setF("alertBelow")}
                        className="w-full glass-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500/50 transition-all"
                        placeholder="20.00" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">{T.alertAbove2}</label>
                      <input type="text" value={form.alertAbove} onChange={setF("alertAbove")}
                        className="w-full glass-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500/50 transition-all"
                        placeholder="50.00" />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">{T.fieldNotes}</label>
                <textarea value={form.notes} onChange={setF("notes") as (e: React.ChangeEvent<HTMLTextAreaElement>) => void} rows={2}
                  className="w-full glass-input rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500/50 transition-all resize-none"
                  placeholder={T.notesPlaceholder} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={formLoading}
                  className="flex-1 py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-[var(--tx-1)] text-sm font-semibold hover:from-indigo-600 hover:to-violet-700 transition-all disabled:opacity-50">
                  {formLoading ? T.saving : T.saveBtn(!!editId)}
                </button>
                <button type="button" onClick={cancelEdit}
                  className="px-4 py-3 min-h-[44px] rounded-xl btn-glass text-sm">{T.cancel}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── IMPORT TAB ── */}
      {tab === "import" && (
        <div className="w-full max-w-2xl animate-fade-in space-y-6">
          {/* Model CSV */}
          <div className="glass-card-static rounded-2xl p-6 border border-indigo-500/10">
            <h2 className="text-sm font-semibold text-[var(--tx-1)] mb-1">{T.csvTitle}</h2>
            <p className="text-xs text-[var(--tx-3)] mb-3">{T.csvSep} <code className="tx-brand">;</code> · {T.csvEnc}</p>
            <div className="bg-black/30 rounded-xl p-3 overflow-x-auto">
              <code className="text-xs whitespace-nowrap" style={{ color: "var(--tx-1)" }}>
                name;isin;quantity;buyingPrice<br/>
                NANOBIOTIX;FR0011341205;114;3,54<br/>
                WAGA ENERGY;FR0012532810;66;17,40
              </code>
            </div>
            <p className="text-xs text-[var(--tx-3)] mt-2">{T.csvCompat}</p>
            <a href="#" onClick={(e) => {
              e.preventDefault();
              const csv = "name;isin;quantity;buyingPrice\nNANOBIOTIX;FR0011341205;114;3,54\nWAGA ENERGY;FR0012532810;66;17,40";
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = "portfolio-template.csv"; a.click();
            }} className="inline-block mt-2 text-xs tx-brand hover:tx-brand transition-colors">
              {T.csvDownload}
            </a>
          </div>

          {/* File picker */}
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-[var(--tx-1)] mb-4">{T.importTitle}</h2>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-[var(--border-med)] hover:border-indigo-500/40 rounded-xl p-8 text-center cursor-pointer transition-all"
            >
              <div className="mx-auto mb-3 flex items-center justify-center w-12 h-12 rounded-xl" style={{ background: "var(--bg-active)", border: "1px solid var(--border-med)" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: "var(--tx-3)" }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="18" x2="12" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="9" y1="15" x2="15" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              </div>
              <p className="text-sm text-[var(--tx-2)]">{T.clickToChoose}</p>
              <p className="text-xs text-[var(--tx-3)] mt-1">{T.dropHere}</p>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleCsvFile} className="hidden" />
            </div>

            {importStatus && (
              <div className={`mt-3 px-4 py-2.5 rounded-xl text-sm ${importStatus.includes("erreurs") || importStatus === "" ? "bg-[var(--bg-raised)] text-[var(--tx-2)]" : "bg-pos-soft tx-pos"}`}>
                {importStatus}
              </div>
            )}

            {importRows.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-[var(--tx-3)] mb-2">{T.preview(importRows.length)}</div>
                <div className="overflow-x-auto bg-black/20 rounded-xl p-3 max-h-40 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-[var(--tx-3)]">{Object.keys(importRows[0]).map((k) => <th key={k} className="text-left pr-3 pb-1">{k}</th>)}</tr></thead>
                    <tbody>{importRows.slice(0, 5).map((row, i) => (
                      <tr key={i}>{Object.values(row).map((v, j) => <td key={j} className="text-[var(--tx-2)] pr-3 py-0.5 truncate max-w-[100px]">{v}</td>)}</tr>
                    ))}</tbody>
                  </table>
                </div>
                <button onClick={submitImport} disabled={importLoading}
                  className="mt-3 w-full py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-[var(--tx-1)] text-sm font-semibold hover:from-indigo-600 hover:to-violet-700 transition-all disabled:opacity-50">
                  {importLoading ? T.importLoading : T.importBtn(importRows.length)}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Insider trade matching ─────────────────────────────────────────────────────

function InsiderMatchSection({ positions, locale = "en" }: { positions: Position[]; locale?: Locale }) {
  const T = DICT[locale];
  const [matches, setMatches] = useState<Array<{
    positionName: string;
    declarations: Array<{
      id: string; insiderName: string | null; insiderFunction: string | null;
      totalAmount: number | null; transactionDate: string | null;
      transactionNature: string | null; signalScore: number | null;
      company: { name: string; slug: string };
    }>;
  }> | null>(null);
  const [loading, setLoading] = useState(false);

  const isins = positions.map((p) => p.isin).filter(Boolean);
  const names = positions.map((p) => p.name);

  useEffect(() => {
    if (!isins.length && !names.length) return;
    setLoading(true);
    fetch(`/api/portfolio/insider-matches?isins=${isins.join(",")}&names=${encodeURIComponent(names.join(","))}`)
      .then((r) => r.json())
      .then((d) => { setMatches(d.matches ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions.length]);

  if (loading) return <div className="glass-card rounded-2xl p-6 animate-pulse h-24" />;
  if (!matches?.length) return null;

  return (
    <div className="glass-card-static rounded-2xl p-6 border border-violet-500/10">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: "var(--c-violet)", flexShrink: 0 }}><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        <h3 className="text-sm font-semibold text-[var(--tx-1)]">{T.insiderTitle}</h3>
        <span className="text-xs text-[var(--tx-3)] w-full sm:w-auto">{T.insiderSub}</span>
      </div>
      <div className="space-y-4">
        {matches.map((m) => (
          <div key={m.positionName}>
            <div className="text-xs font-semibold tx-brand mb-2">{m.positionName}</div>
            <div className="space-y-2">
              {m.declarations.slice(0, 3).map((d, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs py-1.5 border-b border-white/5 last:border-0">
                  <div>
                    <span className="text-[var(--tx-2)]">{d.insiderName ?? "·"}</span>
                    <span className="text-[var(--tx-3)] ml-2">{d.insiderFunction?.slice(0, 30)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {d.transactionDate && <span className="text-[var(--tx-3)]">{new Date(d.transactionDate).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short" })}</span>}
                    {d.totalAmount && <span className="text-[var(--tx-2)]">{d.totalAmount >= 1e6 ? `${(d.totalAmount / 1e6).toFixed(1)}M€` : `${(d.totalAmount / 1e3).toFixed(0)}k€`}</span>}
                    {d.signalScore != null && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${d.signalScore >= 65 ? "bg-pos-soft tx-pos" : "bg-[var(--bg-raised)] text-[var(--tx-2)]"}`}>{Math.round(d.signalScore)}</span>}
                    <Link href={lp(locale === "fr", `/company/${d.company.slug}`)} className="tx-brand hover:tx-brand transition-colors">→</Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiTile({ label, value, sub, accent = "indigo" }: { label: string; value: string; sub?: string; accent?: string }) {
  const map: Record<string, string> = {
    indigo: "from-indigo-500/10 to-indigo-500/5 bd-brand",
    violet: "from-violet-500/10 to-violet-500/5 border-violet-500/15",
    emerald: "from-emerald-500/10 to-emerald-500/5 bd-pos",
    rose: "from-rose-500/10 to-rose-500/5 bd-neg",
    cyan: "from-cyan-500/10 to-cyan-500/5 border-cyan-500/15",
  };
  return (
    <div className={`glass-card-static rounded-2xl p-4 bg-gradient-to-br ${map[accent] ?? map.indigo} flex flex-col gap-1`}>
      <div className="text-xl font-bold text-[var(--tx-1)] tracking-tight">{value}</div>
      <div className="text-xs text-[var(--tx-3)] font-medium">{label}</div>
      {sub && <div className="text-xs text-[var(--tx-3)]">{sub}</div>}
    </div>
  );
}

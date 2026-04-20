"use client";

import { useEffect, useState, useRef, FormEvent } from "react";
import Link from "next/link";
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
}

interface User { id: string; email: string; name: string | null }

const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#f43f5e", "#3b82f6", "#a855f7", "#14b8a6", "#84cc16"];

function fmt(n: number | null | undefined, d = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function fmtEur(n: number | null | undefined, d = 0): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: d, maximumFractionDigits: d });
}

function PnlBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-[var(--tx-3)] text-xs">—</span>;
  const isPos = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${isPos ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
      {isPos ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

interface FormState {
  name: string; isin: string; quantity: string; buyingPrice: string;
  alertBelow: string; alertAbove: string; notes: string;
}
const EMPTY_FORM: FormState = { name: "", isin: "", quantity: "", buyingPrice: "", alertBelow: "", alertAbove: "", notes: "" };

export function PortfolioDashboard({ user }: { user: User }) {
  const [positions, setPositions] = useState<Position[]>([]);
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
    setForm({
      name: pos.name, isin: pos.isin ?? "", quantity: String(pos.quantity),
      buyingPrice: String(pos.buyingPrice), alertBelow: String(pos.alertBelow ?? ""),
      alertAbove: String(pos.alertAbove ?? ""), notes: pos.notes ?? "",
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
    if (!form.name || !form.quantity || !form.buyingPrice) {
      setFormError("Nom, quantité et prix d'achat sont requis"); return;
    }
    setFormLoading(true);
    try {
      const body = {
        id: editId,
        name: form.name, isin: form.isin,
        quantity: parseFloat(form.quantity.replace(",", ".")),
        buyingPrice: parseFloat(form.buyingPrice.replace(",", ".")),
        alertBelow: form.alertBelow ? parseFloat(form.alertBelow.replace(",", ".")) : null,
        alertAbove: form.alertAbove ? parseFloat(form.alertAbove.replace(",", ".")) : null,
        notes: form.notes,
      };
      const method = editId ? "PUT" : "POST";
      const res = await fetch("/api/portfolio/positions", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); setFormError(d.error ?? "Erreur"); return; }
      setForm(EMPTY_FORM);
      setEditId(null);
      setTab("positions");
      await fetchPositions();
    } finally {
      setFormLoading(false);
    }
  }

  async function deletePosition(id: string) {
    if (!confirm("Supprimer cette position ?")) return;
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
        setImportStatus(`${res.data.length} lignes détectées, prêt à importer`);
      },
    });
  }

  async function submitImport() {
    if (!importRows.length) return;
    setImportLoading(true);
    setImportStatus("Import en cours…");
    const res = await fetch("/api/portfolio/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: importRows }),
    });
    const data = await res.json();
    setImportStatus(`${data.imported} positions importées${data.errors?.length ? ` · ${data.errors.length} erreurs` : ""}`);
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
  const priced = positions.filter((p) => p.currentPrice != null);
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
    { id: "positions", label: `Positions (${positions.length})` },
    { id: "add", label: editId ? "Modifier" : "+ Ajouter" },
    { id: "import", label: "Importer CSV" },
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-card-static text-indigo-400 text-xs font-semibold mb-4 border-indigo-500/15">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            Portfolio PEA · {user.name ?? user.email}
          </div>
          <h1 className="text-3xl font-bold text-[var(--tx-1)] tracking-tight">Mon <span className="text-gradient-indigo">Portfolio</span></h1>
          <p className="text-[var(--tx-2)] text-sm mt-1">{positions.length} position{positions.length !== 1 ? "s" : ""} · Mis à jour {priced.length > 0 ? "récemment" : "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshPrices} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl btn-glass text-sm font-medium disabled:opacity-50 transition-all">
            <svg className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {refreshing ? "Mise à jour…" : "Actualiser les cours"}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-amber-400 text-sm font-semibold">{alerts.length} alerte{alerts.length > 1 ? "s" : ""} déclenchée{alerts.length > 1 ? "s" : ""}</span>
          </div>
          <div className="space-y-1">
            {alerts.map((p) => {
              const below = p.alertBelow != null && p.currentPrice != null && p.currentPrice <= p.alertBelow;
              return (
                <div key={p.id} className="text-sm text-amber-300/80">
                  <strong>{p.name}</strong> : {below ? `cours ${fmtEur(p.currentPrice)} ≤ alerte basse ${fmtEur(p.alertBelow)}` : `cours ${fmtEur(p.currentPrice)} ≥ alerte haute ${fmtEur(p.alertAbove)}`}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Performance chart + KPI strip */}
      <div className="mb-8">
        <PortfolioPerformance positions={positions} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 glass-card-static rounded-xl w-fit">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => { if (t.id !== "add" || !editId) setEditId(null); setTab(t.id); if (t.id !== "add") setForm(EMPTY_FORM); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/25" : "text-[var(--tx-2)] hover:text-white"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── POSITIONS TAB ── */}
      {tab === "positions" && (
        <div className="space-y-6 animate-fade-in">
          {positions.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <div className="flex justify-center mb-3 opacity-30"><BarChart2 size={40} strokeWidth={1.2} /></div>
              <p className="text-[var(--tx-2)] mb-4">Aucune position. Ajoutez des titres ou importez un CSV.</p>
              <div className="flex justify-center gap-3">
                <button onClick={() => setTab("add")} className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-[var(--tx-1)] text-sm font-semibold">+ Ajouter manuellement</button>
                <button onClick={() => setTab("import")} className="px-4 py-2 rounded-xl btn-glass text-sm">Importer CSV</button>
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
                          <th className="p-4 font-medium">Titre</th>
                          <th className="p-4 font-medium text-right">Qté</th>
                          <th className="p-4 font-medium text-right">PRU</th>
                          <th className="p-4 font-medium text-right">Cours</th>
                          <th className="p-4 font-medium text-right">Valeur</th>
                          <th className="p-4 font-medium text-right">P&L</th>
                          <th className="p-4 font-medium text-center">Alerte</th>
                          <th className="p-4 w-16" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {sorted.map((pos) => {
                          const alertTriggered = alerts.some((a) => a.id === pos.id);
                          return (
                            <tr key={pos.id} className={`hover:bg-white/3 transition-colors ${alertTriggered ? "bg-amber-500/5" : ""}`}>
                              <td className="px-4 py-3">
                                <div className="font-medium text-[var(--tx-1)] text-sm">{pos.name}</div>
                                {pos.isin && <div className="text-[11px] text-[var(--tx-3)] font-mono">{pos.isin}</div>}
                                {pos.yahooSymbol && <div className="text-[11px] text-indigo-500">{pos.yahooSymbol}</div>}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-[var(--tx-2)] text-xs">{fmt(pos.quantity, 2)}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-[var(--tx-2)] text-xs">{fmtEur(pos.buyingPrice, 2)}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-xs">
                                {pos.currentPrice != null ? (
                                  <span className="text-[var(--tx-1)]">{fmtEur(pos.currentPrice, 2)}</span>
                                ) : <span className="text-[var(--tx-3)]">—</span>}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-xs text-[var(--tx-2)]">
                                {fmtEur(pos.currentValue ?? pos.totalInvested)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <PnlBadge pct={pos.pnlPct} />
                                {pos.pnl != null && <div className="text-[11px] tabular-nums text-[var(--tx-3)] mt-0.5">{fmtEur(pos.pnl)}</div>}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {alertTriggered ? <Bell size={13} className="text-amber-400" /> :
                                  (pos.alertBelow || pos.alertAbove) ? <Bell size={13} className="text-[var(--tx-3)]" /> : null}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex gap-1">
                                  <button onClick={() => startEdit(pos)} className="p-1 rounded text-[var(--tx-3)] hover:text-indigo-400 transition-colors">
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                                  </button>
                                  <button onClick={() => deletePosition(pos.id)} className="p-1 rounded text-[var(--tx-3)] hover:text-rose-400 transition-colors">
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
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
                  <h3 className="text-sm font-semibold text-[var(--tx-1)] mb-4">Répartition du portefeuille</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value">
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.85} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#0a0a1f", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#f1f5f9" }}
                        formatter={(v) => [fmtEur(Number(v)), ""]} />
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
              <InsiderMatchSection positions={positions} />
            </>
          )}
        </div>
      )}

      {/* ── ADD/EDIT TAB ── */}
      {tab === "add" && (
        <div className="max-w-lg animate-fade-in">
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-base font-semibold text-[var(--tx-1)] mb-5">{editId ? "Modifier la position" : "Ajouter une position"}</h2>
            <form onSubmit={submitPosition} className="space-y-4">
              {formError && <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-sm text-rose-400">{formError}</div>}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">Nom du titre *</label>
                  <input type="text" required value={form.name} onChange={setF("name")}
                    className="w-full glass-input rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                    placeholder="ex: NANOBIOTIX" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">ISIN (optionnel)</label>
                  <input type="text" value={form.isin} onChange={setF("isin")}
                    className="w-full glass-input rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                    placeholder="FR0011341205" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">Quantité *</label>
                  <input type="text" required value={form.quantity} onChange={setF("quantity")}
                    className="w-full glass-input rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                    placeholder="114" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">PRU (prix moyen d'achat) *</label>
                  <input type="text" required value={form.buyingPrice} onChange={setF("buyingPrice")}
                    className="w-full glass-input rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                    placeholder="3.54" />
                </div>
              </div>
              <div className="border-t border-white/8 pt-4">
                <p className="text-xs text-[var(--tx-3)] mb-3">Alertes de cours (optionnel)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">Alerte si cours ≤ €</label>
                    <input type="text" value={form.alertBelow} onChange={setF("alertBelow")}
                      className="w-full glass-input rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500/50 transition-all"
                      placeholder="20.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">Alerte si cours ≥ €</label>
                    <input type="text" value={form.alertAbove} onChange={setF("alertAbove")}
                      className="w-full glass-input rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500/50 transition-all"
                      placeholder="50.00" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">Notes (optionnel)</label>
                <textarea value={form.notes} onChange={setF("notes") as (e: React.ChangeEvent<HTMLTextAreaElement>) => void} rows={2}
                  className="w-full glass-input rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500/50 transition-all resize-none"
                  placeholder="Raison d'investissement, objectif…" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={formLoading}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-[var(--tx-1)] text-sm font-semibold hover:from-indigo-600 hover:to-violet-700 transition-all disabled:opacity-50">
                  {formLoading ? "Enregistrement…" : editId ? "Mettre à jour" : "Ajouter la position"}
                </button>
                <button type="button" onClick={cancelEdit}
                  className="px-4 py-2.5 rounded-xl btn-glass text-sm">Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── IMPORT TAB ── */}
      {tab === "import" && (
        <div className="max-w-2xl animate-fade-in space-y-6">
          {/* Model CSV */}
          <div className="glass-card-static rounded-2xl p-6 border border-indigo-500/10">
            <h2 className="text-sm font-semibold text-[var(--tx-1)] mb-1">Format CSV attendu</h2>
            <p className="text-xs text-[var(--tx-3)] mb-3">Séparateur : <code className="text-indigo-400">;</code> · Encodage : UTF-8 · Décimales : virgule</p>
            <div className="bg-black/30 rounded-xl p-3 overflow-x-auto">
              <code className="text-xs text-emerald-400 whitespace-nowrap">
                name;isin;quantity;buyingPrice<br/>
                NANOBIOTIX;FR0011341205;114;3,54<br/>
                WAGA ENERGY;FR0012532810;66;17,40
              </code>
            </div>
            <p className="text-xs text-[var(--tx-3)] mt-2">
              Compatible avec les exports courtiers Boursorama, BNP, Société Générale, etc.
              Les colonnes <code className="text-[var(--tx-2)]">lastPrice</code>, <code className="text-[var(--tx-2)]">amount</code>, etc. sont ignorées.
            </p>
            <a href="#" onClick={(e) => {
              e.preventDefault();
              const csv = "name;isin;quantity;buyingPrice\nNANOBIOTIX;FR0011341205;114;3,54\nWAGA ENERGY;FR0012532810;66;17,40";
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = "modele-portfolio.csv"; a.click();
            }} className="inline-block mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
              ↓ Télécharger le modèle CSV
            </a>
          </div>

          {/* File picker */}
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-[var(--tx-1)] mb-4">Importer votre fichier</h2>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-[var(--border-med)] hover:border-indigo-500/40 rounded-xl p-8 text-center cursor-pointer transition-all"
            >
              <div className="mx-auto mb-3 flex items-center justify-center w-12 h-12 rounded-xl" style={{ background: "var(--bg-active)", border: "1px solid var(--border-med)" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: "var(--tx-3)" }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="18" x2="12" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="9" y1="15" x2="15" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              </div>
              <p className="text-sm text-[var(--tx-2)]">Cliquez pour choisir un fichier CSV</p>
              <p className="text-xs text-[var(--tx-3)] mt-1">ou glissez-déposez ici</p>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleCsvFile} className="hidden" />
            </div>

            {importStatus && (
              <div className={`mt-3 px-4 py-2.5 rounded-xl text-sm ${importStatus.includes("erreurs") || importStatus === "" ? "bg-[var(--bg-raised)] text-[var(--tx-2)]" : "bg-emerald-500/10 text-emerald-400"}`}>
                {importStatus}
              </div>
            )}

            {importRows.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-[var(--tx-3)] mb-2">Aperçu ({importRows.length} lignes)</div>
                <div className="overflow-x-auto bg-black/20 rounded-xl p-3 max-h-40 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-[var(--tx-3)]">{Object.keys(importRows[0]).map((k) => <th key={k} className="text-left pr-3 pb-1">{k}</th>)}</tr></thead>
                    <tbody>{importRows.slice(0, 5).map((row, i) => (
                      <tr key={i}>{Object.values(row).map((v, j) => <td key={j} className="text-[var(--tx-2)] pr-3 py-0.5 truncate max-w-[100px]">{v}</td>)}</tr>
                    ))}</tbody>
                  </table>
                </div>
                <button onClick={submitImport} disabled={importLoading}
                  className="mt-3 w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-[var(--tx-1)] text-sm font-semibold hover:from-indigo-600 hover:to-violet-700 transition-all disabled:opacity-50">
                  {importLoading ? "Import en cours…" : `Importer ${importRows.length} positions`}
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

function InsiderMatchSection({ positions }: { positions: Position[] }) {
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
      <div className="flex items-center gap-2 mb-4">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: "var(--c-violet)", flexShrink: 0 }}><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        <h3 className="text-sm font-semibold text-[var(--tx-1)]">Trades AMF sur vos positions</h3>
        <span className="text-xs text-[var(--tx-3)]">dirigeants ayant récemment acheté vos titres</span>
      </div>
      <div className="space-y-4">
        {matches.map((m) => (
          <div key={m.positionName}>
            <div className="text-xs font-semibold text-indigo-400 mb-2">{m.positionName}</div>
            <div className="space-y-2">
              {m.declarations.slice(0, 3).map((d, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-white/5 last:border-0">
                  <div>
                    <span className="text-[var(--tx-2)]">{d.insiderName ?? "—"}</span>
                    <span className="text-[var(--tx-3)] ml-2">{d.insiderFunction?.slice(0, 30)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {d.transactionDate && <span className="text-[var(--tx-3)]">{new Date(d.transactionDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>}
                    {d.totalAmount && <span className="text-[var(--tx-2)]">{d.totalAmount >= 1e6 ? `${(d.totalAmount / 1e6).toFixed(1)}M€` : `${(d.totalAmount / 1e3).toFixed(0)}k€`}</span>}
                    {d.signalScore != null && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${d.signalScore >= 65 ? "bg-emerald-500/15 text-emerald-400" : "bg-[var(--bg-raised)] text-[var(--tx-2)]"}`}>{Math.round(d.signalScore)}</span>}
                    <Link href={`/company/${d.company.slug}`} className="text-indigo-400 hover:text-indigo-300 transition-colors">→</Link>
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
    indigo: "from-indigo-500/10 to-indigo-500/5 border-indigo-500/15",
    violet: "from-violet-500/10 to-violet-500/5 border-violet-500/15",
    emerald: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/15",
    rose: "from-rose-500/10 to-rose-500/5 border-rose-500/15",
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

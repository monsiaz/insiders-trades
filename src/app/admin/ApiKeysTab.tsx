"use client";

import { useCallback, useEffect, useState } from "react";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  totalRequests: number;
  requestsToday: number;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  lastUserAgent: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  createdAt: string;
  user: {
    id: string; email: string;
    firstName: string | null; lastName: string | null;
    role: string;
  };
}

interface Stats {
  totalKeys: number;
  activeKeys: number;
  revokedKeys: number;
  uniqueOwners: number;
  totalRequests: number;
  requestsToday: number;
}

interface TopConsumer {
  userId: string;
  user: { email: string; firstName: string | null; lastName: string | null } | null;
  keysCount: number;
  totalRequests: number;
  requestsToday: number;
}

export function ApiKeysTab({
  showToast,
}: {
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [top, setTop] = useState<TopConsumer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "revoked">("active");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/api-keys");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setKeys(d.keys ?? []);
      setStats(d.stats ?? null);
      setTop(d.topConsumers ?? []);
    } catch (e) {
      showToast(`Chargement KO : ${String(e)}`, false);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const revoke = async (id: string, who: string) => {
    if (!confirm(`Révoquer la clé de ${who} ? Les requêtes en cours avec cette clé vont s'arrêter.`)) return;
    const r = await fetch(`/api/admin/api-keys?id=${id}`, { method: "DELETE" });
    if (r.ok) {
      showToast("Clé révoquée", true);
      await load();
    } else {
      showToast("Échec", false);
    }
  };

  const filtered = keys
    .filter((k) => (filter === "active" ? !k.revokedAt : filter === "revoked" ? !!k.revokedAt : true))
    .filter((k) => {
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return (
        k.name.toLowerCase().includes(s) ||
        k.prefix.toLowerCase().includes(s) ||
        k.user.email.toLowerCase().includes(s)
      );
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {/* Stats strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "12px",
        }}
      >
        <MiniStat label="Clés actives" value={stats?.activeKeys ?? "·"} color="var(--c-emerald)" />
        <MiniStat label="Révoquées"    value={stats?.revokedKeys ?? "·"} color="var(--c-crimson)" />
        <MiniStat label="Propriétaires uniques" value={stats?.uniqueOwners ?? "·"} color="var(--c-indigo-2)" />
        <MiniStat label="Requêtes 24h" value={stats?.requestsToday?.toLocaleString("fr-FR") ?? "·"} color="var(--gold)" />
        <MiniStat label="Requêtes total" value={stats?.totalRequests?.toLocaleString("fr-FR") ?? "·"} color="var(--c-violet)" />
      </div>

      {/* Top consumers */}
      {top.length > 0 && (
        <div className="card" style={{ padding: "14px 18px" }}>
          <h3
            style={{
              fontSize: "0.82rem",
              fontWeight: 700,
              color: "var(--tx-1)",
              letterSpacing: "-0.01em",
              marginBottom: "8px",
            }}
          >
            Top consommateurs
          </h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-med)" }}>
                {["User", "Clés", "Aujourd'hui", "Total"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: "0.66rem", color: "var(--tx-3)", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top.map((t, i) => (
                <tr key={t.userId} style={{ borderBottom: "1px solid var(--border)", background: i % 2 ? "var(--bg-raised)" : "transparent" }}>
                  <td style={{ padding: "6px 10px", color: "var(--tx-1)" }}>
                    {t.user?.email ?? "(inconnu)"}
                  </td>
                  <td style={{ padding: "6px 10px", color: "var(--tx-2)", fontFamily: "monospace" }}>{t.keysCount}</td>
                  <td style={{ padding: "6px 10px", color: "var(--gold)", fontFamily: "monospace" }}>{t.requestsToday.toLocaleString("fr-FR")}</td>
                  <td style={{ padding: "6px 10px", color: "var(--tx-1)", fontFamily: "monospace", fontWeight: 600 }}>{t.totalRequests.toLocaleString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* All keys table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            gap: "10px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            type="search"
            placeholder="Rechercher par nom, prefix, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: "1 1 260px", maxWidth: "420px", padding: "6px 10px", fontSize: "0.85rem", borderRadius: "4px" }}
          />
          <div style={{ display: "inline-flex", border: "1px solid var(--border-strong)", borderRadius: "4px", overflow: "hidden" }}>
            {(["active", "all", "revoked"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 12px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  background: filter === f ? "var(--gold)" : "transparent",
                  color: filter === f ? "#0A0C10" : "var(--tx-2)",
                  border: "none",
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {f === "all" ? "Toutes" : f === "active" ? "Actives" : "Révoquées"}
              </button>
            ))}
          </div>
          <span style={{ fontSize: "0.72rem", color: "var(--tx-3)", fontFamily: "'JetBrains Mono', monospace", marginLeft: "auto" }}>
            {filtered.length} clé{filtered.length > 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--tx-3)" }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--tx-3)" }}>Aucune clé.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-med)" }}>
                  {["Nom", "Prefix", "Propriétaire", "Statut", "Requêtes", "Aujourd'hui", "Dernière utilisation", "Créée", "Actions"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: "0.66rem", color: "var(--tx-3)", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((k, i) => (
                  <tr key={k.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 ? "var(--bg-raised)" : "transparent" }}>
                    <td style={{ padding: "8px 12px", color: "var(--tx-1)", fontWeight: 600 }}>
                      {k.name}
                    </td>
                    <td style={{ padding: "8px 12px", color: "var(--gold)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem" }}>
                      {k.prefix}…
                    </td>
                    <td style={{ padding: "8px 12px", color: "var(--tx-2)", fontSize: "0.78rem" }}>
                      {k.user.email}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      {k.revokedAt ? (
                        <span style={{ fontSize: "0.66rem", color: "var(--c-crimson)", background: "var(--c-crimson-bg)", padding: "2px 7px", borderRadius: "2px", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
                          Révoquée
                        </span>
                      ) : (
                        <span style={{ fontSize: "0.66rem", color: "var(--c-emerald)", background: "var(--c-emerald-bg)", padding: "2px 7px", borderRadius: "2px", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
                          Active
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", color: "var(--tx-1)", fontFamily: "monospace", fontWeight: 600 }}>
                      {k.totalRequests.toLocaleString("fr-FR")}
                    </td>
                    <td style={{ padding: "8px 12px", color: "var(--gold)", fontFamily: "monospace" }}>
                      {k.requestsToday.toLocaleString("fr-FR")}
                    </td>
                    <td style={{ padding: "8px 12px", color: "var(--tx-3)", fontSize: "0.76rem", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                      {fmtAgo(k.lastUsedAt)}
                    </td>
                    <td style={{ padding: "8px 12px", color: "var(--tx-3)", fontSize: "0.76rem", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                      {fmtAgo(k.createdAt)}
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      {!k.revokedAt && (
                        <button
                          onClick={() => revoke(k.id, k.user.email)}
                          style={{
                            padding: "4px 10px",
                            fontSize: "0.72rem",
                            fontWeight: 600,
                            border: "1px solid var(--c-crimson-bd)",
                            background: "transparent",
                            color: "var(--c-crimson)",
                            borderRadius: "3px",
                            cursor: "pointer",
                          }}
                        >
                          Révoquer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="card" style={{ padding: "12px 16px" }}>
      <p style={{ fontSize: "0.62rem", color: "var(--tx-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
        {label}
      </p>
      <p style={{ fontSize: "1.4rem", fontWeight: 700, color, fontFamily: "'Banana Grotesk', 'Inter', system-ui", letterSpacing: "-0.03em", marginTop: "2px" }}>
        {value}
      </p>
    </div>
  );
}

function fmtAgo(iso: string | null): string {
  if (!iso) return "·";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 0) return "future";
  if (diff < 60_000) return "à l'instant";
  if (diff < 3_600_000) return `il y a ${Math.round(diff / 60_000)} min`;
  if (diff < 86_400_000) return `il y a ${Math.round(diff / 3_600_000)} h`;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

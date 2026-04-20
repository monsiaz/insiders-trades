"use client";

import { useState, useEffect, useCallback } from "react";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isBanned: boolean;
  bannedAt: string | null;
  emailVerified: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  _count: { positions: number; alerts: number };
}

interface Position {
  id: string;
  name: string;
  isin: string | null;
  yahooSymbol: string | null;
  quantity: number;
  buyingPrice: number;
  currentPrice: number | null;
  totalInvested: number;
  currentValue: number | null;
  pnl: number | null;
  pnlPct: number | null;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserRow & { positions?: Position[] } | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [confirmBan, setConfirmBan] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setUsers(data.users ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  async function openUser(u: UserRow) {
    setSelectedUser({ ...u, positions: undefined });
    setModalLoading(true);
    const res = await fetch(`/api/admin/users?userId=${u.id}`);
    const data = await res.json();
    setSelectedUser({ ...data.user, positions: data.user.positions });
    setModalLoading(false);
  }

  async function doAction(userId: string, action: string, reason?: string) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action, reason }),
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Action "${action}" effectuée avec succès`);
      await loadUsers();
      if (selectedUser?.id === userId) {
        const r2 = await fetch(`/api/admin/users?userId=${userId}`);
        const d2 = await r2.json();
        setSelectedUser({ ...d2.user, positions: d2.user.positions });
      }
    } else {
      showToast(data.error ?? "Erreur", false);
    }
    setConfirmBan(null);
    setBanReason("");
  }

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (u.firstName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (u.lastName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: users.length,
    active: users.filter(u => !u.isBanned).length,
    banned: users.filter(u => u.isBanned).length,
    withPortfolio: users.filter(u => u._count.positions > 0).length,
  };

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const fmtFull = (d: string | null) => d ? new Date(d).toLocaleString("fr-FR") : "—";

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-base)",
      padding: "32px 24px",
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "8px",
              background: "linear-gradient(135deg, var(--c-indigo), var(--c-violet))",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--tx-1)", fontFamily: "'Banana Grotesk', 'Inter', system-ui", letterSpacing: "-0.03em" }}>
              Administration
            </h1>
          </div>
          <p style={{ fontSize: "0.875rem", color: "var(--tx-3)" }}>
            Gestion des utilisateurs et portfolios
          </p>
        </div>

        {/* Stats strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" }}>
          {[
            { label: "Total users", value: stats.total, color: "var(--c-indigo)" },
            { label: "Actifs", value: stats.active, color: "var(--c-emerald)" },
            { label: "Révoqués", value: stats.banned, color: "var(--c-crimson)" },
            { label: "Avec portfolio", value: stats.withPortfolio, color: "var(--c-amber)" },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: "16px 18px" }}>
              <p style={{ fontSize: "0.72rem", color: "var(--tx-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                {s.label}
              </p>
              <p style={{ fontSize: "1.75rem", fontWeight: 700, color: s.color, fontFamily: "'Banana Grotesk', 'Inter', system-ui", letterSpacing: "-0.04em", marginTop: "2px" }}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Search + Table */}
        <div className="card" style={{ padding: "0", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-sub)" }}>
            <input
              type="search"
              placeholder="Rechercher par nom ou email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", maxWidth: "340px", padding: "8px 12px", borderRadius: "10px", fontSize: "0.875rem" }}
            />
          </div>

          {loading ? (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--tx-3)" }}>Chargement…</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-sub)" }}>
                    {["Utilisateur", "Email", "Rôle", "Portfolio", "Inscrit", "Dernière co.", "Statut", "Actions"].map(h => (
                      <th key={h} style={{
                        padding: "10px 14px",
                        textAlign: "left",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        color: "var(--tx-3)",
                        whiteSpace: "nowrap",
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u, i) => (
                    <tr key={u.id} style={{
                      borderBottom: "1px solid var(--border-sub)",
                      background: u.isBanned ? "rgba(255,60,60,0.04)" : i % 2 === 1 ? "var(--bg-sub)" : "transparent",
                      transition: "background 0.1s",
                    }}>
                      <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{
                            width: "30px", height: "30px", borderRadius: "50%",
                            background: `hsl(${u.email.length * 47 % 360}, 55%, 30%)`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "0.7rem", fontWeight: 700, color: "white", flexShrink: 0,
                          }}>
                            {(u.firstName?.[0] ?? u.name?.[0] ?? u.email[0]).toUpperCase()}
                          </div>
                          <span style={{ color: "var(--tx-1)", fontWeight: 500 }}>
                            {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.name ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "11px 14px", color: "var(--tx-2)" }}>{u.email}</td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{
                          padding: "2px 8px", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 600,
                          background: u.role === "admin" ? "rgba(91,92,246,0.15)" : "var(--bg-sub)",
                          color: u.role === "admin" ? "var(--c-indigo-2)" : "var(--tx-3)",
                        }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={{ padding: "11px 14px", color: "var(--tx-2)", textAlign: "center" }}>
                        <button
                          onClick={() => openUser(u)}
                          style={{
                            background: "none", border: "none", cursor: "pointer",
                            color: u._count.positions > 0 ? "var(--c-indigo-2)" : "var(--tx-4)",
                            fontWeight: 600, fontSize: "0.85rem",
                          }}
                          title="Voir le portfolio"
                        >
                          {u._count.positions} pos.
                        </button>
                      </td>
                      <td style={{ padding: "11px 14px", color: "var(--tx-3)", whiteSpace: "nowrap", fontSize: "0.8rem" }}>{fmt(u.createdAt)}</td>
                      <td style={{ padding: "11px 14px", color: "var(--tx-3)", whiteSpace: "nowrap", fontSize: "0.8rem" }}>{fmt(u.lastLoginAt)}</td>
                      <td style={{ padding: "11px 14px" }}>
                        {u.isBanned ? (
                          <span style={{ color: "var(--c-crimson)", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                            <span>●</span> Révoqué
                          </span>
                        ) : (
                          <span style={{ color: "var(--c-emerald)", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                            <span>●</span> Actif
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            onClick={() => openUser(u)}
                            style={{
                              padding: "4px 10px", borderRadius: "7px", fontSize: "0.75rem", fontWeight: 600,
                              background: "var(--bg-sub)", border: "1px solid var(--border-sub)",
                              color: "var(--tx-2)", cursor: "pointer",
                            }}
                          >
                            Détails
                          </button>
                          {!u.isBanned ? (
                            <button
                              onClick={() => setConfirmBan(u.id)}
                              style={{
                                padding: "4px 10px", borderRadius: "7px", fontSize: "0.75rem", fontWeight: 600,
                                background: "var(--c-crimson-bg)", border: "1px solid var(--c-crimson-bd)",
                                color: "var(--c-crimson)", cursor: "pointer",
                              }}
                            >
                              Révoquer
                            </button>
                          ) : (
                            <button
                              onClick={() => doAction(u.id, "unban")}
                              style={{
                                padding: "4px 10px", borderRadius: "7px", fontSize: "0.75rem", fontWeight: 600,
                                background: "rgba(0,200,150,0.1)", border: "1px solid rgba(0,200,150,0.3)",
                                color: "var(--c-emerald)", cursor: "pointer",
                              }}
                            >
                              Réactiver
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "var(--tx-4)" }}>
                        Aucun utilisateur trouvé
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── User detail modal ── */}
      {selectedUser && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 9000,
            display: "flex", alignItems: "center", justifyContent: "center", padding: "16px",
          }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedUser(null); }}
        >
          <div className="card" style={{
            width: "100%", maxWidth: "680px", maxHeight: "88vh",
            overflow: "auto", padding: "0",
          }}>
            {/* Modal header */}
            <div style={{
              padding: "20px 24px 16px",
              borderBottom: "1px solid var(--border-sub)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              position: "sticky", top: 0, background: "var(--bg-card)", zIndex: 1,
            }}>
              <div>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--tx-1)", margin: 0 }}>
                  {selectedUser.firstName && selectedUser.lastName
                    ? `${selectedUser.firstName} ${selectedUser.lastName}`
                    : selectedUser.name ?? selectedUser.email}
                </h2>
                <p style={{ fontSize: "0.8rem", color: "var(--tx-3)", margin: "2px 0 0" }}>{selectedUser.email}</p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tx-3)", fontSize: "1.4rem", lineHeight: 1 }}
              >×</button>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* User info grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", marginBottom: "24px" }}>
                {[
                  { label: "Rôle", value: selectedUser.role },
                  { label: "Statut", value: selectedUser.isBanned ? "Révoqué" : "Actif" },
                  { label: "Email vérifié", value: selectedUser.emailVerified ? fmtFull(selectedUser.emailVerified) : "Non vérifié" },
                  { label: "Inscrit le", value: fmtFull(selectedUser.createdAt) },
                  { label: "Dernière connexion", value: fmtFull(selectedUser.lastLoginAt) },
                  { label: "Révoqué le", value: fmtFull(selectedUser.bannedAt) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--tx-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "2px" }}>{label}</p>
                    <p style={{ fontSize: "0.875rem", color: "var(--tx-1)" }}>{value ?? "—"}</p>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "24px" }}>
                {!selectedUser.isBanned ? (
                  <button
                    onClick={() => setConfirmBan(selectedUser.id)}
                    style={{
                      padding: "7px 14px", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 600,
                      background: "var(--c-crimson-bg)", border: "1px solid var(--c-crimson-bd)",
                      color: "var(--c-crimson)", cursor: "pointer",
                    }}
                  >
                    Révoquer l&apos;accès
                  </button>
                ) : (
                  <button
                    onClick={() => doAction(selectedUser.id, "unban")}
                    style={{
                      padding: "7px 14px", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 600,
                      background: "rgba(0,200,150,0.1)", border: "1px solid rgba(0,200,150,0.3)",
                      color: "var(--c-emerald)", cursor: "pointer",
                    }}
                  >
                    Réactiver l&apos;accès
                  </button>
                )}
                {selectedUser.role !== "admin" && (
                  <button
                    onClick={() => doAction(selectedUser.id, "make_admin")}
                    style={{
                      padding: "7px 14px", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 600,
                      background: "rgba(91,92,246,0.1)", border: "1px solid rgba(91,92,246,0.3)",
                      color: "var(--c-indigo-2)", cursor: "pointer",
                    }}
                  >
                    Promouvoir admin
                  </button>
                )}
                {selectedUser.role === "admin" && (
                  <button
                    onClick={() => doAction(selectedUser.id, "revoke_admin")}
                    style={{
                      padding: "7px 14px", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 600,
                      background: "var(--bg-sub)", border: "1px solid var(--border-sub)",
                      color: "var(--tx-2)", cursor: "pointer",
                    }}
                  >
                    Retirer admin
                  </button>
                )}
              </div>

              {/* Portfolio */}
              <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--tx-1)", marginBottom: "12px" }}>
                Portfolio ({selectedUser.positions?.length ?? 0} positions)
              </h3>
              {modalLoading ? (
                <p style={{ color: "var(--tx-3)", fontSize: "0.85rem" }}>Chargement…</p>
              ) : selectedUser.positions && selectedUser.positions.length > 0 ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-sub)" }}>
                        {["Valeur", "ISIN", "Qté", "PRU", "Cours actuel", "Valeur totale", "P&L", "P&L %"].map(h => (
                          <th key={h} style={{
                            padding: "7px 10px", textAlign: "right", fontSize: "0.7rem",
                            fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
                            color: "var(--tx-3)", whiteSpace: "nowrap",
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedUser.positions.map((p, i) => {
                        const pnlPos = (p.pnl ?? 0) >= 0;
                        return (
                          <tr key={p.id} style={{
                            borderBottom: "1px solid var(--border-sub)",
                            background: i % 2 === 1 ? "var(--bg-sub)" : "transparent",
                          }}>
                            <td style={{ padding: "8px 10px", fontWeight: 600, color: "var(--tx-1)", textAlign: "left" }}>{p.name}</td>
                            <td style={{ padding: "8px 10px", color: "var(--tx-3)", textAlign: "right", fontFamily: "monospace" }}>{p.isin ?? "—"}</td>
                            <td style={{ padding: "8px 10px", color: "var(--tx-2)", textAlign: "right" }}>{p.quantity.toLocaleString("fr-FR")}</td>
                            <td style={{ padding: "8px 10px", color: "var(--tx-2)", textAlign: "right" }}>{p.buyingPrice.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €</td>
                            <td style={{ padding: "8px 10px", color: "var(--tx-2)", textAlign: "right" }}>{p.currentPrice ? `${p.currentPrice.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €` : "—"}</td>
                            <td style={{ padding: "8px 10px", color: "var(--tx-1)", fontWeight: 600, textAlign: "right" }}>
                              {p.currentValue ? `${(p.currentValue / 1000).toFixed(1)}k €` : `${(p.totalInvested / 1000).toFixed(1)}k €`}
                            </td>
                            <td style={{ padding: "8px 10px", textAlign: "right", color: p.pnl == null ? "var(--tx-4)" : pnlPos ? "var(--c-emerald)" : "var(--c-crimson)", fontWeight: 600 }}>
                              {p.pnl == null ? "—" : `${pnlPos ? "+" : ""}${(p.pnl / 1000).toFixed(1)}k €`}
                            </td>
                            <td style={{ padding: "8px 10px", textAlign: "right", color: p.pnlPct == null ? "var(--tx-4)" : (p.pnlPct ?? 0) >= 0 ? "var(--c-emerald)" : "var(--c-crimson)", fontWeight: 700 }}>
                              {p.pnlPct == null ? "—" : `${(p.pnlPct ?? 0) >= 0 ? "+" : ""}${(p.pnlPct ?? 0).toFixed(2)}%`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: "var(--tx-4)", fontSize: "0.85rem", fontStyle: "italic" }}>Aucune position dans le portfolio</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Ban confirmation modal ── */}
      {confirmBan && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 9100,
          display: "flex", alignItems: "center", justifyContent: "center", padding: "16px",
        }}>
          <div className="card" style={{ width: "100%", maxWidth: "400px", padding: "24px" }}>
            <h3 style={{ fontWeight: 700, color: "var(--tx-1)", marginBottom: "8px" }}>Confirmer la révocation</h3>
            <p style={{ fontSize: "0.875rem", color: "var(--tx-3)", marginBottom: "16px" }}>
              Cet utilisateur ne pourra plus se connecter. Vous pouvez annuler à tout moment.
            </p>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--tx-2)", display: "block", marginBottom: "6px" }}>
                Raison (optionnel)
              </label>
              <input
                type="text"
                placeholder="Ex: violation des CGU…"
                value={banReason}
                onChange={e => setBanReason(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "9px" }}
              />
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => { setConfirmBan(null); setBanReason(""); }}
                style={{
                  padding: "8px 16px", borderRadius: "8px", fontSize: "0.85rem", fontWeight: 600,
                  background: "var(--bg-sub)", border: "1px solid var(--border-sub)",
                  color: "var(--tx-2)", cursor: "pointer",
                }}
              >
                Annuler
              </button>
              <button
                onClick={() => doAction(confirmBan, "ban", banReason || undefined)}
                style={{
                  padding: "8px 16px", borderRadius: "8px", fontSize: "0.85rem", fontWeight: 600,
                  background: "var(--c-crimson-bg)", border: "1px solid var(--c-crimson-bd)",
                  color: "var(--c-crimson)", cursor: "pointer",
                }}
              >
                Révoquer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: "24px", right: "24px", zIndex: 9999,
          padding: "12px 18px", borderRadius: "12px",
          background: toast.ok ? "rgba(0,200,150,0.15)" : "var(--c-crimson-bg)",
          border: `1px solid ${toast.ok ? "rgba(0,200,150,0.4)" : "var(--c-crimson-bd)"}`,
          color: toast.ok ? "var(--c-emerald)" : "var(--c-crimson)",
          fontSize: "0.875rem", fontWeight: 600,
          boxShadow: "var(--shadow-lg)",
          animation: "fadeUp 0.3s ease",
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function fmtFull(d: string | null | undefined) {
  return d ? new Date(d).toLocaleString("fr-FR") : "—";
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  alertEnabled: boolean;
  credits: number;
  _count: { positions: number; alerts: number };
}

interface UserDetail extends UserRow {
  bannedReason: string | null;
  lastAlertAt: string | null;
  portfolioCash: number | null;
  creditsUpdatedAt: string | null;
  positions?: Position[];
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

interface CronJob {
  path: string;
  label: string;
  description: string;
  schedule: string;
  scheduleHuman: string;
  method: "GET" | "POST";
  category: string;
}

type Tab = "users" | "cron" | "system";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const fmtDateTime = (d: string | null) =>
  d ? new Date(d).toLocaleString("fr-FR") : "—";

const fmtEur = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

// ── Root component ────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("users");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        padding: "32px 24px",
        fontFamily: "var(--font-inter), 'Inter', system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
        {/* Header */}
        <Header />

        {/* Tabs */}
        <div
          className="flex gap-0 mb-6 overflow-x-auto"
          style={{ borderBottom: "1px solid var(--border-med)" }}
        >
          <TabButton active={tab === "users"}  onClick={() => setTab("users")}>Utilisateurs</TabButton>
          <TabButton active={tab === "cron"}   onClick={() => setTab("cron")}>Tâches & Cron</TabButton>
          <TabButton active={tab === "system"} onClick={() => setTab("system")}>Système</TabButton>
        </div>

        {tab === "users"  && <UsersTab showToast={showToast} />}
        {tab === "cron"   && <CronTab  showToast={showToast} />}
        {tab === "system" && <SystemTab />}
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            padding: "12px 18px",
            borderRadius: "8px",
            background: toast.ok ? "var(--c-emerald-bg)" : "var(--c-crimson-bg)",
            border: `1px solid ${toast.ok ? "var(--c-emerald-bd)" : "var(--c-crimson-bd)"}`,
            color: toast.ok ? "var(--c-emerald)" : "var(--c-crimson)",
            boxShadow: "var(--shadow-lg)",
            fontSize: "0.85rem",
            fontWeight: 600,
            zIndex: 100,
            maxWidth: "420px",
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header() {
  return (
    <div
      style={{
        marginBottom: "24px",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "16px",
        flexWrap: "wrap",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
          <div
            style={{
              width: "32px", height: "32px", borderRadius: "8px",
              background: "var(--corporate)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--tx-1)",
              fontFamily: "'Banana Grotesk', 'Inter', system-ui",
              letterSpacing: "-0.03em",
            }}
          >
            Administration
          </h1>
        </div>
        <p style={{ fontSize: "0.875rem", color: "var(--tx-3)" }}>
          Gestion des utilisateurs, crédits, droits et tâches planifiées.
        </p>
      </div>
      <a
        href="/admin/tech"
        style={{
          textDecoration: "none",
          padding: "8px 14px",
          border: "1px solid var(--gold-bd)",
          background: "var(--gold-bg)",
          color: "var(--gold)",
          borderRadius: "3px",
          fontFamily: "var(--font-inter), sans-serif",
          fontSize: "0.78rem",
          fontWeight: 600,
          letterSpacing: "0.02em",
        }}
      >
        Doc technique ↗
      </a>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 0",
        marginRight: "28px",
        fontSize: "0.82rem",
        fontWeight: 600,
        letterSpacing: "0.01em",
        background: "transparent",
        border: "none",
        borderBottom: `2px solid ${active ? "var(--gold)" : "transparent"}`,
        marginBottom: "-1px",
        color: active ? "var(--tx-1)" : "var(--tx-3)",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab({ showToast }: { showToast: (msg: string, ok?: boolean) => void }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UserDetail | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setUsers(data.users ?? []);
    setLoading(false);
  }, []);

  const openUser = useCallback(async (u: UserRow) => {
    setSelected({ ...u } as UserDetail);
    setModalLoading(true);
    const res = await fetch(`/api/admin/users?userId=${u.id}`);
    const data = await res.json();
    setSelected(data.user);
    setModalLoading(false);
  }, []);

  const action = useCallback(
    async (userId: string, action: string, extra: Record<string, unknown> = {}) => {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, ...extra }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Action "${action}" effectuée`);
        await loadUsers();
        if (selected?.id === userId) {
          const r = await fetch(`/api/admin/users?userId=${userId}`);
          const d = await r.json();
          setSelected(d.user);
        }
      } else {
        showToast(data.error ?? "Erreur", false);
      }
    },
    [loadUsers, selected, showToast]
  );

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filtered = useMemo(
    () =>
      users.filter(
        (u) =>
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          (u.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (u.firstName ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (u.lastName ?? "").toLowerCase().includes(search.toLowerCase())
      ),
    [users, search]
  );

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => !u.isBanned).length,
      banned: users.filter((u) => u.isBanned).length,
      admins: users.filter((u) => u.role === "admin").length,
      withPortfolio: users.filter((u) => u._count.positions > 0).length,
      credits: users.reduce((s, u) => s + (u.credits ?? 0), 0),
    }),
    [users]
  );

  return (
    <>
      {/* Stats strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <StatCard label="Total users" value={stats.total} color="var(--c-indigo-2)" />
        <StatCard label="Actifs"       value={stats.active}       color="var(--c-emerald)" />
        <StatCard label="Révoqués"     value={stats.banned}       color="var(--c-crimson)" />
        <StatCard label="Admins"       value={stats.admins}       color="var(--gold)" />
        <StatCard label="Avec portfolio" value={stats.withPortfolio} color="var(--c-violet)" />
        <StatCard label="Total crédits"  value={stats.credits.toLocaleString("fr-FR")} color="var(--c-amber)" />
      </div>

      {/* Users table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <input
            type="search"
            placeholder="Rechercher par nom ou email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", maxWidth: "340px", padding: "8px 12px", borderRadius: "6px", fontSize: "0.875rem" }}
          />
        </div>
        {loading ? (
          <div style={{ padding: "48px", textAlign: "center", color: "var(--tx-3)" }}>Chargement…</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-med)" }}>
                  {["Utilisateur", "Email", "Rôle", "Crédits", "Portfolio", "Alertes", "Inscrit", "Dern. co.", "Statut", "Actions"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 14px",
                        textAlign: "left",
                        fontSize: "0.68rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        color: "var(--tx-3)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: u.isBanned
                        ? "var(--c-crimson-bg)"
                        : i % 2 === 1
                        ? "var(--bg-raised)"
                        : "transparent",
                    }}
                  >
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div
                          style={{
                            width: "28px", height: "28px", borderRadius: "50%",
                            background: `hsl(${(u.email.length * 47) % 360}, 45%, 32%)`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "0.7rem", fontWeight: 700, color: "white", flexShrink: 0,
                          }}
                        >
                          {(u.firstName?.[0] ?? u.name?.[0] ?? u.email[0]).toUpperCase()}
                        </div>
                        <span style={{ color: "var(--tx-1)", fontWeight: 500 }}>
                          {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.name ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--tx-2)" }}>{u.email}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <RolePill role={u.role} />
                    </td>
                    <td
                      style={{
                        padding: "10px 14px",
                        fontFamily: "'JetBrains Mono', monospace",
                        color: u.credits > 0 ? "var(--gold)" : "var(--tx-4)",
                        fontWeight: 600,
                      }}
                    >
                      {(u.credits ?? 0).toLocaleString("fr-FR")}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <button
                        onClick={() => openUser(u)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: u._count.positions > 0 ? "var(--c-indigo-2)" : "var(--tx-4)",
                          fontWeight: 600,
                          fontSize: "0.85rem",
                        }}
                        title="Voir le détail utilisateur"
                      >
                        {u._count.positions} pos.
                      </button>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          color: u.alertEnabled ? "var(--c-emerald)" : "var(--tx-4)",
                          fontWeight: 600,
                        }}
                      >
                        {u.alertEnabled ? "ON" : "OFF"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--tx-3)", whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                      {fmtDate(u.createdAt)}
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--tx-3)", whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                      {fmtDate(u.lastLoginAt)}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <StatusPill banned={u.isBanned} />
                    </td>
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => openUser(u)}
                        style={{
                          padding: "5px 10px",
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          background: "var(--bg-raised)",
                          border: "1px solid var(--border-strong)",
                          borderRadius: "4px",
                          color: "var(--tx-2)",
                          cursor: "pointer",
                        }}
                      >
                        Gérer →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <UserModal
          user={selected}
          loading={modalLoading}
          onClose={() => setSelected(null)}
          onAction={action}
        />
      )}
    </>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="card" style={{ padding: "14px 18px" }}>
      <p
        style={{
          fontSize: "0.64rem",
          color: "var(--tx-3)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 600,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: "1.65rem",
          fontWeight: 700,
          color,
          fontFamily: "'Banana Grotesk', 'Inter', system-ui",
          letterSpacing: "-0.04em",
          marginTop: "2px",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function RolePill({ role }: { role: string }) {
  const admin = role === "admin";
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "0.68rem",
        fontWeight: 700,
        letterSpacing: "0.02em",
        background: admin ? "var(--gold-bg)" : "var(--bg-raised)",
        color: admin ? "var(--gold)" : "var(--tx-3)",
        border: admin ? "1px solid var(--gold-bd)" : "1px solid var(--border-med)",
      }}
    >
      {role}
    </span>
  );
}

function StatusPill({ banned }: { banned: boolean }) {
  return (
    <span
      style={{
        color: banned ? "var(--c-crimson)" : "var(--c-emerald)",
        fontSize: "0.72rem",
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        gap: "4px",
      }}
    >
      <span>●</span>
      {banned ? "Révoqué" : "Actif"}
    </span>
  );
}

// ── User Modal ────────────────────────────────────────────────────────────────

function UserModal({
  user,
  loading,
  onClose,
  onAction,
}: {
  user: UserDetail;
  loading: boolean;
  onClose: () => void;
  onAction: (userId: string, action: string, extra?: Record<string, unknown>) => void | Promise<void>;
}) {
  const [creditsInput, setCreditsInput] = useState(String(user.credits ?? 0));
  const [deltaInput, setDeltaInput] = useState("100");
  const [cashInput, setCashInput] = useState(user.portfolioCash != null ? String(user.portfolioCash) : "");
  const [banReason, setBanReason] = useState("");

  useEffect(() => {
    setCreditsInput(String(user.credits ?? 0));
    setCashInput(user.portfolioCash != null ? String(user.portfolioCash) : "");
  }, [user.id, user.credits, user.portfolioCash]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 20px",
        zIndex: 50,
        overflow: "auto",
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: "880px", width: "100%", padding: "24px 28px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "18px",
            borderBottom: "1px solid var(--border)",
            paddingBottom: "14px",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "1.25rem",
                fontWeight: 700,
                color: "var(--tx-1)",
                fontFamily: "'Banana Grotesk', sans-serif",
                letterSpacing: "-0.02em",
              }}
            >
              {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.name ?? user.email}
            </h2>
            <p style={{ fontSize: "0.8rem", color: "var(--tx-3)", marginTop: "2px" }}>
              {user.email} · <RolePill role={user.role} /> · <StatusPill banned={user.isBanned} />
            </p>
            <p
              style={{
                fontSize: "0.68rem",
                color: "var(--tx-4)",
                fontFamily: "'JetBrains Mono', monospace",
                marginTop: "4px",
              }}
            >
              ID : {user.id} · Inscrit {fmtDate(user.createdAt)} · Vérifié{" "}
              {user.emailVerified ? fmtDate(user.emailVerified) : "non"} · Dernière co.{" "}
              {fmtDateTime(user.lastLoginAt)}
            </p>
            {user.bannedReason && (
              <p style={{ fontSize: "0.75rem", color: "var(--c-crimson)", marginTop: "6px" }}>
                Motif : {user.bannedReason} · Le {fmtDateTime(user.bannedAt)}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-med)",
              color: "var(--tx-2)",
              cursor: "pointer",
              fontSize: "1.2rem",
              padding: "2px 10px",
              lineHeight: 1,
              borderRadius: "4px",
            }}
          >
            ×
          </button>
        </div>

        {/* Quick actions grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "14px",
            marginBottom: "22px",
          }}
        >
          {/* Credits */}
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-med)",
              borderLeft: "3px solid var(--gold)",
              padding: "14px 16px",
              borderRadius: "4px",
            }}
          >
            <div
              style={{
                fontSize: "0.62rem",
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--gold)",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: "6px",
              }}
            >
              Crédits
            </div>
            <div
              style={{
                fontSize: "1.65rem",
                fontFamily: "'Banana Grotesk', sans-serif",
                fontWeight: 700,
                color: "var(--gold)",
                letterSpacing: "-0.03em",
                marginBottom: "10px",
              }}
            >
              {user.credits.toLocaleString("fr-FR")}
            </div>
            <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
              <input
                type="number"
                value={creditsInput}
                onChange={(e) => setCreditsInput(e.target.value)}
                style={{ flex: 1, padding: "6px 10px", fontSize: "0.85rem", borderRadius: "4px" }}
                min="0"
              />
              <button
                onClick={() => onAction(user.id, "set_credits", { credits: Number(creditsInput) })}
                style={btnPrimary}
              >
                Définir
              </button>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <input
                type="number"
                value={deltaInput}
                onChange={(e) => setDeltaInput(e.target.value)}
                style={{ flex: 1, padding: "6px 10px", fontSize: "0.85rem", borderRadius: "4px" }}
              />
              <button
                onClick={() => onAction(user.id, "adjust_credits", { delta: Number(deltaInput) })}
                style={btnSecondary}
              >
                + / −
              </button>
            </div>
            <p style={{ fontSize: "0.68rem", color: "var(--tx-4)", marginTop: "6px" }}>
              MàJ {fmtDate(user.creditsUpdatedAt)}
            </p>
          </div>

          {/* Portfolio cash */}
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-med)",
              borderLeft: "3px solid var(--c-indigo-2)",
              padding: "14px 16px",
              borderRadius: "4px",
            }}
          >
            <div
              style={{
                fontSize: "0.62rem",
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--c-indigo-2)",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: "6px",
              }}
            >
              Solde espèces (broker)
            </div>
            <div
              style={{
                fontSize: "1.65rem",
                fontFamily: "'Banana Grotesk', sans-serif",
                fontWeight: 700,
                color: "var(--tx-1)",
                letterSpacing: "-0.03em",
                marginBottom: "10px",
              }}
            >
              {fmtEur(user.portfolioCash)}
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <input
                type="number"
                step="0.01"
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
                placeholder="vide = null"
                style={{ flex: 1, padding: "6px 10px", fontSize: "0.85rem", borderRadius: "4px" }}
              />
              <button
                onClick={() =>
                  onAction(user.id, "set_cash", {
                    portfolioCash: cashInput === "" ? null : Number(cashInput),
                  })
                }
                style={btnPrimary}
              >
                Enregistrer
              </button>
            </div>
          </div>

          {/* Alerts + role + ban */}
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-med)",
              borderLeft: `3px solid ${user.isBanned ? "var(--c-crimson)" : "var(--c-emerald)"}`,
              padding: "14px 16px",
              borderRadius: "4px",
            }}
          >
            <div
              style={{
                fontSize: "0.62rem",
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--tx-3)",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: "8px",
              }}
            >
              Droits & accès
            </div>

            {/* Alerts toggle */}
            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={user.alertEnabled}
                onChange={(e) => onAction(user.id, "toggle_alerts", { enabled: e.target.checked })}
              />
              <span style={{ fontSize: "0.85rem", color: "var(--tx-1)" }}>
                Alertes email {user.alertEnabled ? "activées" : "désactivées"}
              </span>
            </label>
            {user.lastAlertAt && (
              <p style={{ fontSize: "0.7rem", color: "var(--tx-4)", marginBottom: "10px" }}>
                Dernière alerte envoyée : {fmtDateTime(user.lastAlertAt)}
              </p>
            )}

            {/* Role actions */}
            <div style={{ display: "flex", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
              {user.role !== "admin" ? (
                <button onClick={() => onAction(user.id, "make_admin")} style={btnPrimary}>
                  Promouvoir admin
                </button>
              ) : (
                <button onClick={() => onAction(user.id, "revoke_admin")} style={btnSecondary}>
                  Révoquer admin
                </button>
              )}
            </div>

            {/* Ban / unban */}
            {user.isBanned ? (
              <button
                onClick={() => onAction(user.id, "unban")}
                style={{ ...btnPrimary, background: "var(--c-emerald)", color: "#fff" }}
              >
                Réactiver le compte
              </button>
            ) : (
              <div>
                <input
                  type="text"
                  placeholder="Motif (optionnel)"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    fontSize: "0.82rem",
                    borderRadius: "4px",
                    marginBottom: "6px",
                  }}
                />
                <button
                  onClick={() => {
                    if (confirm(`Révoquer ${user.email} ? Cet utilisateur ne pourra plus accéder au site.`)) {
                      onAction(user.id, "ban", { reason: banReason });
                      setBanReason("");
                    }
                  }}
                  style={{ ...btnPrimary, background: "var(--c-crimson)", color: "#fff" }}
                >
                  Révoquer l&apos;accès
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Portfolio */}
        <div>
          <h3
            style={{
              fontSize: "0.82rem",
              fontWeight: 700,
              color: "var(--tx-1)",
              letterSpacing: "-0.01em",
              marginBottom: "10px",
            }}
          >
            Portfolio ({user._count.positions} positions)
          </h3>
          {loading ? (
            <p style={{ color: "var(--tx-3)", fontSize: "0.85rem" }}>Chargement…</p>
          ) : user.positions && user.positions.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-med)" }}>
                    {["Nom", "ISIN", "Qté", "PRU", "Cours", "Valorisation", "P&L"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "6px 10px",
                          textAlign: "left",
                          fontSize: "0.66rem",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "var(--tx-3)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {user.positions.map((p, idx) => (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: idx % 2 ? "var(--bg-raised)" : "transparent",
                      }}
                    >
                      <td style={{ padding: "7px 10px", color: "var(--tx-1)", fontWeight: 500 }}>{p.name}</td>
                      <td style={{ padding: "7px 10px", color: "var(--tx-3)", fontFamily: "monospace", fontSize: "0.75rem" }}>
                        {p.isin ?? "—"}
                      </td>
                      <td style={{ padding: "7px 10px", color: "var(--tx-2)", fontFamily: "monospace" }}>{p.quantity}</td>
                      <td style={{ padding: "7px 10px", color: "var(--tx-2)" }}>{p.buyingPrice.toFixed(2)}€</td>
                      <td style={{ padding: "7px 10px", color: "var(--tx-2)" }}>
                        {p.currentPrice ? `${p.currentPrice.toFixed(2)}€` : "—"}
                      </td>
                      <td style={{ padding: "7px 10px", color: "var(--tx-1)", fontWeight: 500 }}>
                        {fmtEur(p.currentValue ?? p.totalInvested)}
                      </td>
                      <td
                        style={{
                          padding: "7px 10px",
                          color: p.pnl == null ? "var(--tx-4)" : p.pnl >= 0 ? "var(--c-emerald)" : "var(--c-crimson)",
                          fontWeight: 600,
                          fontFamily: "monospace",
                        }}
                      >
                        {p.pnl == null ? "—" : `${p.pnl >= 0 ? "+" : ""}${p.pnl.toFixed(0)}€ (${p.pnlPct?.toFixed(1)}%)`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: "var(--tx-3)", fontSize: "0.85rem" }}>Aucune position.</p>
          )}
        </div>
      </div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: "0.78rem",
  fontWeight: 600,
  background: "var(--corporate)",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnSecondary: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: "0.78rem",
  fontWeight: 600,
  background: "var(--bg-raised)",
  color: "var(--tx-2)",
  border: "1px solid var(--border-strong)",
  borderRadius: "4px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

// ── Cron tab ──────────────────────────────────────────────────────────────────

function CronTab({ showToast }: { showToast: (msg: string, ok?: boolean) => void }) {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<Record<string, { ok: boolean; ms: number; status: number; payload: unknown }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/run-cron");
    const data = await res.json();
    setJobs(data.jobs ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = useCallback(
    async (job: CronJob, extras: Record<string, unknown> = {}) => {
      setRunning(job.path);
      const started = Date.now();
      try {
        const res = await fetch("/api/admin/run-cron", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: job.path, ...extras }),
        });
        const data = await res.json();
        const ms = Date.now() - started;
        setLastRun((prev) => ({
          ...prev,
          [job.path]: { ok: !!data.ok, ms: data.elapsedMs ?? ms, status: data.status ?? 0, payload: data.payload ?? null },
        }));
        showToast(data.ok ? `${job.label} terminé en ${((data.elapsedMs ?? ms) / 1000).toFixed(1)}s` : `Échec : ${data.error ?? `HTTP ${data.status ?? "?"}`}`, !!data.ok);
      } catch (err) {
        showToast(`Erreur : ${String(err)}`, false);
      } finally {
        setRunning(null);
      }
    },
    [showToast]
  );

  if (loading) {
    return <div style={{ padding: "48px", textAlign: "center", color: "var(--tx-3)" }}>Chargement…</div>;
  }

  return (
    <div>
      {/* Info banner */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-med)",
          borderLeft: "3px solid var(--gold)",
          padding: "12px 16px",
          borderRadius: "4px",
          marginBottom: "18px",
          fontSize: "0.82rem",
          color: "var(--tx-2)",
          lineHeight: 1.55,
        }}
      >
        <strong style={{ color: "var(--tx-1)" }}>Tâches planifiées.</strong>{" "}
        Les crons sont déclenchés automatiquement par Vercel selon la fréquence indiquée (fuseau UTC).
        Vous pouvez aussi lancer n&apos;importe quel job manuellement avec le bouton &laquo; Exécuter &raquo;.
        L&apos;exécution utilise le <code style={{ fontFamily: "monospace", color: "var(--gold)" }}>CRON_SECRET</code> côté serveur
        — le secret n&apos;est jamais exposé au navigateur.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {jobs.map((job) => {
          const last = lastRun[job.path];
          const isRunning = running === job.path;
          return (
            <div
              key={job.path}
              className="card"
              style={{ padding: "16px 18px", display: "grid", gridTemplateColumns: "1fr auto", gap: "14px" }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap", marginBottom: "4px" }}>
                  <h3
                    style={{
                      fontSize: "1rem",
                      fontWeight: 700,
                      color: "var(--tx-1)",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {job.label}
                  </h3>
                  <code
                    style={{
                      fontSize: "0.72rem",
                      color: "var(--gold)",
                      fontFamily: "'JetBrains Mono', monospace",
                      background: "var(--gold-bg)",
                      padding: "2px 7px",
                      borderRadius: "3px",
                    }}
                  >
                    {job.path}
                  </code>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontFamily: "'JetBrains Mono', monospace",
                      color: "var(--tx-3)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {job.scheduleHuman}
                  </span>
                  {job.schedule !== "manual" && (
                    <code
                      style={{
                        fontSize: "0.66rem",
                        color: "var(--tx-4)",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      ({job.schedule})
                    </code>
                  )}
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--tx-2)", lineHeight: 1.5, margin: "4px 0 0" }}>
                  {job.description}
                </p>
                {last && (
                  <p
                    style={{
                      marginTop: "6px",
                      fontSize: "0.74rem",
                      color: last.ok ? "var(--c-emerald)" : "var(--c-crimson)",
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: "0.02em",
                    }}
                  >
                    Dernière exécution manuelle : {last.ok ? "✓" : "✗"} HTTP {last.status} · {(last.ms / 1000).toFixed(1)}s
                  </p>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {job.path === "/api/reparse" && (
                  <ReparseControl onRun={(extras) => run(job, extras)} disabled={isRunning} />
                )}
                {job.path === "/api/enrich" && (
                  <EnrichControl onRun={(extras) => run(job, extras)} disabled={isRunning} />
                )}
                {job.path !== "/api/reparse" && job.path !== "/api/enrich" && (
                  <button
                    onClick={() => run(job)}
                    disabled={isRunning}
                    style={{
                      ...btnPrimary,
                      padding: "8px 16px",
                      fontSize: "0.82rem",
                      opacity: isRunning ? 0.5 : 1,
                      cursor: isRunning ? "progress" : "pointer",
                      background: isRunning ? "var(--bg-raised)" : "var(--corporate)",
                      color: isRunning ? "var(--tx-3)" : "#fff",
                    }}
                  >
                    {isRunning ? "Exécution…" : "Exécuter →"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReparseControl({ onRun, disabled }: { onRun: (extras: Record<string, unknown>) => void; disabled: boolean }) {
  const [mode, setMode] = useState("missing-amount");
  const [limit, setLimit] = useState(50);
  return (
    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
      <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ padding: "5px 8px", fontSize: "0.78rem", borderRadius: "4px" }}>
        <option value="missing-amount">amount ∅</option>
        <option value="missing-isin">isin ∅</option>
        <option value="unparsed">unparsed</option>
      </select>
      <input
        type="number"
        value={limit}
        onChange={(e) => setLimit(Number(e.target.value))}
        style={{ width: "70px", padding: "5px 8px", fontSize: "0.78rem", borderRadius: "4px" }}
        min="10"
        max="500"
      />
      <button
        onClick={() => onRun({ mode, limit })}
        disabled={disabled}
        style={{
          ...btnPrimary,
          padding: "7px 14px",
          fontSize: "0.78rem",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "progress" : "pointer",
        }}
      >
        {disabled ? "…" : "Exécuter"}
      </button>
    </div>
  );
}

function EnrichControl({ onRun, disabled }: { onRun: (extras: Record<string, unknown>) => void; disabled: boolean }) {
  const [limit, setLimit] = useState(50);
  return (
    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
      <input
        type="number"
        value={limit}
        onChange={(e) => setLimit(Number(e.target.value))}
        style={{ width: "70px", padding: "5px 8px", fontSize: "0.78rem", borderRadius: "4px" }}
        min="10"
        max="500"
      />
      <button
        onClick={() => onRun({ limit })}
        disabled={disabled}
        style={{
          ...btnPrimary,
          padding: "7px 14px",
          fontSize: "0.78rem",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "progress" : "pointer",
        }}
      >
        {disabled ? "…" : "Exécuter"}
      </button>
    </div>
  );
}

// ── System tab ────────────────────────────────────────────────────────────────

function SystemTab() {
  return (
    <div className="card" style={{ padding: "20px 24px" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--tx-1)", marginBottom: "10px" }}>
        Informations système
      </h2>
      <div style={{ fontSize: "0.85rem", color: "var(--tx-2)", lineHeight: 1.8 }}>
        <p><strong style={{ color: "var(--tx-1)" }}>Environnement :</strong> production (Vercel)</p>
        <p><strong style={{ color: "var(--tx-1)" }}>Base de données :</strong> Neon Postgres (EU)</p>
        <p><strong style={{ color: "var(--tx-1)" }}>Storage :</strong> Vercel Blob (CDN)</p>
        <p><strong style={{ color: "var(--tx-1)" }}>Session :</strong> JWT HS256 · cookie HttpOnly · 30j</p>
        <p><strong style={{ color: "var(--tx-1)" }}>Emails :</strong> Nodemailer + Gmail (app password)</p>
        <p><strong style={{ color: "var(--tx-1)" }}>Modèles OpenAI :</strong> gpt-image-1 (logos), gpt-4o-mini Vision (audit), gpt-4o-search-preview (web-search)</p>
        <p><strong style={{ color: "var(--tx-1)" }}>Sources finance :</strong> AMF BDIF · Yahoo Finance (v8/chart, quoteSummary, timeseries, RSS) · Google News RSS</p>
      </div>

      <h3 style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--tx-1)", marginTop: "22px", marginBottom: "6px" }}>
        Mode beta
      </h3>
      <div style={{ fontSize: "0.82rem", color: "var(--tx-2)", lineHeight: 1.7 }}>
        <p>L&apos;inscription publique est fermée. Seuls les emails présents dans la whitelist de <code style={{ fontFamily: "monospace", color: "var(--gold)" }}>src/app/api/auth/register/route.ts</code> peuvent créer un compte.</p>
        <p>Les non-admins n&apos;ont pour l&apos;instant pas de case d&apos;usage dédié — cette page existe en bêta uniquement pour le propriétaire du site.</p>
      </div>
    </div>
  );
}

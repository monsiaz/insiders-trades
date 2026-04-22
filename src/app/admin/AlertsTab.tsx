"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// ── Types (mirror src/lib/settings.ts + /api/admin/alerts response) ─────────

type AlertFrequency = "daily" | "weekdays" | "weekly" | "disabled";

interface AlertsConfig {
  enabled: boolean;
  frequency: AlertFrequency;
  hour: number;
  minSignalScore: number;
  portfolioWindowHours: number;
  topBuysLimit: number;
  topSellsLimit: number;
  lookbackDays: number;
  includeTopBuys: boolean;
  includeTopSells: boolean;
  includePortfolioAlerts: boolean;
  recipientOverride: string | null;
  note: string;
  updatedAt?: string;
}

interface AlertsStats {
  eligibleUsers: number;
  optedInUsers: number;
  totalSubscribers: number;
  sentToday: number;
  sent7d: number;
  lastSendAt: string | null;
  lastSendTo: string | null;
}

interface Recipient {
  id: string;
  email: string;
  name: string | null;
  lastAlertAt: string | null;
  positions: number;
}

interface AlertsApiResponse {
  config: AlertsConfig;
  stats: AlertsStats;
  recipients: Recipient[];
}

type TemplateType = "digest" | "welcome" | "verify" | "reset";

// ── Component ────────────────────────────────────────────────────────────────

export function AlertsTab({
  showToast,
}: {
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const [data, setData] = useState<AlertsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [template, setTemplate] = useState<TemplateType>("digest");
  const [sampleAlerts, setSampleAlerts] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/alerts");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as AlertsApiResponse;
      setData(d);
    } catch (e) {
      showToast(`Impossible de charger la config : ${String(e)}`, false);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const patch = useCallback(
    async (update: Partial<AlertsConfig>) => {
      setSaving(true);
      try {
        const res = await fetch("/api/admin/alerts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
        setData((prev) => (prev ? { ...prev, config: d.config } : prev));
        showToast("Configuration mise à jour", true);
      } catch (e) {
        showToast(`Erreur : ${String(e)}`, false);
      } finally {
        setSaving(false);
      }
    },
    [showToast]
  );

  const runTest = useCallback(async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/admin/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        showToast(`Envoi KO : ${d.error ?? "inconnue"}`, false);
      } else {
        showToast(`Email envoyé à ${d.to}`, true);
        await load();
      }
    } catch (e) {
      showToast(`Erreur : ${String(e)}`, false);
    } finally {
      setTesting(false);
    }
  }, [testTo, showToast, load]);

  const previewUrl = useMemo(() => {
    const params = new URLSearchParams({ dry: "1", type: template });
    if (sampleAlerts && template === "digest") params.set("sample", "1");
    return `/api/admin/send-test-email?${params.toString()}`;
  }, [template, sampleAlerts]);

  if (loading || !data) {
    return (
      <div style={{ padding: "48px", textAlign: "center", color: "var(--tx-3)" }}>
        Chargement…
      </div>
    );
  }

  const { config, stats, recipients } = data;

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
        <MiniStat label="Users éligibles" value={stats.eligibleUsers} color="var(--c-indigo-2)" />
        <MiniStat label="Alertes activées" value={stats.optedInUsers} color="var(--c-emerald)" />
        <MiniStat label="Envoyées (24h)" value={stats.sentToday} color="var(--gold)" />
        <MiniStat label="Envoyées (7j)" value={stats.sent7d} color="var(--c-violet)" />
        <MiniStat label="Dernier envoi" value={fmtAgo(stats.lastSendAt)} color="var(--c-amber)" />
      </div>

      {/* ── Core config ─────────────────────────────────────────────────── */}
      <div
        className="card"
        style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}
      >
        <TabHeader
          title="Déclencheurs & fréquence"
          sub="Paramètres globaux appliqués au cron quotidien ainsi qu'aux envois manuels."
          rightBadge={
            config.updatedAt
              ? `modifié ${fmtAgo(config.updatedAt)}`
              : undefined
          }
        />

        {/* Master switch */}
        <Row
          label="Envois actifs"
          hint="Arrêt d'urgence — désactive TOUS les envois (cron + test)."
        >
          <Toggle
            checked={config.enabled}
            onChange={(v) => patch({ enabled: v })}
            disabled={saving}
          />
        </Row>

        <Row
          label="Fréquence"
          hint="Quand le cron quotidien 03:00 UTC doit réellement pousser des emails."
        >
          <SegmentedButton
            value={config.frequency}
            options={[
              { value: "daily",     label: "Quotidien" },
              { value: "weekdays",  label: "Lu→Ve" },
              { value: "weekly",    label: "Lundi" },
              { value: "disabled",  label: "Off" },
            ]}
            onChange={(v) => patch({ frequency: v as AlertFrequency })}
            disabled={saving}
          />
        </Row>

        <Row
          label="Heure d'envoi (UTC)"
          hint="Informatif — le cron Vercel est fixé à 03:00 UTC. Utilisé uniquement si vous modifiez le crontab."
        >
          <NumberInput
            value={config.hour}
            min={0}
            max={23}
            onCommit={(v) => patch({ hour: v })}
            disabled={saving}
            suffix="h UTC"
          />
        </Row>

        <Row
          label="Score min. portefeuille"
          hint="Seuil signalScore (0–100) en dessous duquel une déclaration n'apparaît pas dans la section 'mouvements sur vos titres'."
        >
          <NumberInput
            value={config.minSignalScore}
            min={0}
            max={100}
            onCommit={(v) => patch({ minSignalScore: v })}
            disabled={saving}
            suffix="/100"
          />
        </Row>

        <Row
          label="Fenêtre portefeuille"
          hint="Combien d'heures en arrière pour surfacer les mouvements sur les titres détenus."
        >
          <NumberInput
            value={config.portfolioWindowHours}
            min={6}
            max={168}
            onCommit={(v) => patch({ portfolioWindowHours: v })}
            disabled={saving}
            suffix="h"
          />
        </Row>

        <Row
          label="Fenêtre recommandations"
          hint="Combien de jours en arrière alimentent le pool de top BUY / SELL."
        >
          <NumberInput
            value={config.lookbackDays}
            min={1}
            max={30}
            onCommit={(v) => patch({ lookbackDays: v })}
            disabled={saving}
            suffix="j"
          />
        </Row>
      </div>

      {/* ── Sections to include ─────────────────────────────────────────── */}
      <div
        className="card"
        style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}
      >
        <TabHeader
          title="Sections incluses dans le digest"
          sub="Cochez les blocs à inclure — un digest sans aucune section est automatiquement skippé."
        />
        <Row
          label="Alertes portefeuille"
          hint="Mouvements d'initiés sur les titres détenus par l'utilisateur (48h par défaut)."
        >
          <Toggle
            checked={config.includePortfolioAlerts}
            onChange={(v) => patch({ includePortfolioAlerts: v })}
            disabled={saving}
          />
        </Row>
        <Row
          label="Top recommandations achat"
          hint={`${config.topBuysLimit} meilleures opportunités d'achat ces ${config.lookbackDays}j.`}
        >
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <Toggle
              checked={config.includeTopBuys}
              onChange={(v) => patch({ includeTopBuys: v })}
              disabled={saving}
            />
            <NumberInput
              value={config.topBuysLimit}
              min={0}
              max={10}
              onCommit={(v) => patch({ topBuysLimit: v })}
              disabled={saving || !config.includeTopBuys}
              suffix=" items"
              compact
            />
          </div>
        </Row>
        <Row
          label="Signaux de vente"
          hint={`${config.topSellsLimit} meilleurs signaux baissiers ces ${config.lookbackDays}j.`}
        >
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <Toggle
              checked={config.includeTopSells}
              onChange={(v) => patch({ includeTopSells: v })}
              disabled={saving}
            />
            <NumberInput
              value={config.topSellsLimit}
              min={0}
              max={10}
              onCommit={(v) => patch({ topSellsLimit: v })}
              disabled={saving || !config.includeTopSells}
              suffix=" items"
              compact
            />
          </div>
        </Row>
      </div>

      {/* ── Dev override + note ─────────────────────────────────────────── */}
      <div
        className="card"
        style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "12px" }}
      >
        <TabHeader
          title="Redirection & note opérateur"
          sub="Utile pour tester le digest en prod sans spammer les vrais users."
        />
        <Row
          label="Rediriger tous les envois vers"
          hint="Si défini, chaque envoi cron/test ira à cette adresse au lieu du user réel. Laisse vide en production."
        >
          <TextInput
            value={config.recipientOverride ?? ""}
            placeholder="vide = pas d'override"
            type="email"
            onCommit={(v) => patch({ recipientOverride: v.trim() || null })}
            disabled={saving}
          />
        </Row>
        <Row label="Note opérateur" hint="Logge pourquoi tu as tweaké (historique interne).">
          <TextInput
            value={config.note ?? ""}
            placeholder="ex : 'baissé min score à 30 en attendant plus de volume'"
            onCommit={(v) => patch({ note: v })}
            disabled={saving}
            wide
          />
        </Row>
      </div>

      {/* ── Template preview + test send ───────────────────────────────── */}
      <div
        className="card"
        style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}
      >
        <TabHeader
          title="Templates & test d'envoi"
          sub="Prévisualise les templates inline (sans envoyer) et déclenche un test réel."
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {(["digest", "welcome", "verify", "reset"] as TemplateType[]).map((t) => (
            <button
              key={t}
              onClick={() => setTemplate(t)}
              style={{
                padding: "6px 12px",
                fontSize: "0.78rem",
                fontWeight: 600,
                borderRadius: "3px",
                border: `1px solid ${template === t ? "var(--gold)" : "var(--border-strong)"}`,
                background: template === t ? "var(--gold-bg)" : "var(--bg-raised)",
                color: template === t ? "var(--gold)" : "var(--tx-2)",
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {t}
            </button>
          ))}
          {template === "digest" && (
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.78rem",
                color: "var(--tx-3)",
                marginLeft: "auto",
              }}
            >
              <input
                type="checkbox"
                checked={sampleAlerts}
                onChange={(e) => setSampleAlerts(e.target.checked)}
              />
              Injecter des alertes démo
            </label>
          )}
        </div>

        <div
          style={{
            border: "1px solid var(--border-med)",
            borderRadius: "4px",
            overflow: "hidden",
            background: "#F4F1EC",
          }}
        >
          <iframe
            key={previewUrl}
            src={previewUrl}
            title={`Preview email ${template}`}
            style={{
              width: "100%",
              height: "540px",
              border: "none",
              background: "#F4F1EC",
              display: "block",
            }}
          />
        </div>

        {/* Test send */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            flexWrap: "wrap",
            padding: "10px 0 0",
            borderTop: "1px solid var(--border)",
          }}
        >
          <input
            type="email"
            value={testTo}
            placeholder="Destinataire (défaut : votre compte admin)"
            onChange={(e) => setTestTo(e.target.value)}
            style={{
              flex: "1 1 260px",
              padding: "8px 12px",
              fontSize: "0.85rem",
              borderRadius: "4px",
            }}
          />
          <button
            onClick={runTest}
            disabled={testing}
            style={{
              padding: "8px 16px",
              fontSize: "0.82rem",
              fontWeight: 600,
              background: "var(--corporate)",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: testing ? "progress" : "pointer",
              opacity: testing ? 0.6 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {testing ? "Envoi…" : "Envoyer un digest de test →"}
          </button>
        </div>
      </div>

      {/* ── Recipients ──────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: "18px 20px" }}>
        <TabHeader
          title={`Abonnés (${recipients.length})`}
          sub="Utilisateurs avec emailVerified + alertEnabled. Le total peut différer des stats haut de page si filtré."
        />
        {recipients.length === 0 ? (
          <p style={{ color: "var(--tx-3)", fontSize: "0.85rem" }}>Aucun destinataire actif.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-med)" }}>
                  {["Email", "Nom", "Positions", "Dernier email"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 10px",
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
                {recipients.map((r, i) => (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: i % 2 ? "var(--bg-raised)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "6px 10px", color: "var(--tx-2)" }}>{r.email}</td>
                    <td style={{ padding: "6px 10px", color: "var(--tx-1)" }}>{r.name ?? "—"}</td>
                    <td style={{ padding: "6px 10px", color: "var(--tx-2)", fontFamily: "monospace" }}>
                      {r.positions}
                    </td>
                    <td style={{ padding: "6px 10px", color: "var(--tx-3)", fontFamily: "monospace" }}>
                      {fmtAgo(r.lastAlertAt)}
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

// ── UI primitives ────────────────────────────────────────────────────────────

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="card" style={{ padding: "12px 16px" }}>
      <p
        style={{
          fontSize: "0.62rem",
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
          fontSize: "1.4rem",
          fontWeight: 700,
          color,
          fontFamily: "'Banana Grotesk', 'Inter', system-ui",
          letterSpacing: "-0.03em",
          marginTop: "2px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function TabHeader({
  title,
  sub,
  rightBadge,
}: {
  title: string;
  sub?: string;
  rightBadge?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap",
        borderBottom: "1px solid var(--border)",
        paddingBottom: "8px",
      }}
    >
      <div>
        <h3
          style={{
            fontSize: "0.96rem",
            fontWeight: 700,
            color: "var(--tx-1)",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h3>
        {sub && <p style={{ fontSize: "0.78rem", color: "var(--tx-3)", marginTop: "2px" }}>{sub}</p>}
      </div>
      {rightBadge && (
        <span
          style={{
            fontSize: "0.7rem",
            color: "var(--tx-3)",
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.04em",
          }}
        >
          {rightBadge}
        </span>
      )}
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        alignItems: "center",
        gap: "16px",
      }}
    >
      <div>
        <div
          style={{
            fontSize: "0.88rem",
            fontWeight: 600,
            color: "var(--tx-1)",
            letterSpacing: "-0.005em",
          }}
        >
          {label}
        </div>
        {hint && (
          <div
            style={{
              fontSize: "0.74rem",
              color: "var(--tx-3)",
              marginTop: "2px",
              lineHeight: 1.5,
            }}
          >
            {hint}
          </div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      aria-pressed={checked}
      style={{
        width: "44px",
        height: "24px",
        borderRadius: "14px",
        background: checked ? "var(--gold)" : "var(--border-strong)",
        border: "none",
        position: "relative",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.2s ease",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "2px",
          left: checked ? "22px" : "2px",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
          transition: "left 0.2s ease",
        }}
      />
    </button>
  );
}

function SegmentedButton({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid var(--border-strong)",
        borderRadius: "4px",
        overflow: "hidden",
        background: "var(--bg-raised)",
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            style={{
              padding: "6px 12px",
              fontSize: "0.78rem",
              fontWeight: 600,
              background: active ? "var(--gold)" : "transparent",
              color: active ? "#0A0C10" : "var(--tx-2)",
              border: "none",
              cursor: disabled ? "default" : "pointer",
              whiteSpace: "nowrap",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function NumberInput({
  value,
  min,
  max,
  onCommit,
  disabled,
  suffix,
  compact,
}: {
  value: number;
  min: number;
  max: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
  suffix?: string;
  compact?: boolean;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => setLocal(String(value)), [value]);

  const commit = () => {
    const n = Math.max(min, Math.min(max, Math.round(Number(local) || min)));
    if (n !== value) onCommit(n);
    setLocal(String(n));
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "0.82rem",
      }}
    >
      <input
        type="number"
        value={local}
        min={min}
        max={max}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        disabled={disabled}
        style={{
          width: compact ? "60px" : "72px",
          padding: "6px 8px",
          fontSize: "0.82rem",
          borderRadius: "3px",
          border: "1px solid var(--border-strong)",
          background: "var(--bg-raised)",
          color: "var(--tx-1)",
          textAlign: "right",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      />
      {suffix && (
        <span
          style={{
            fontSize: "0.74rem",
            color: "var(--tx-3)",
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
          }}
        >
          {suffix}
        </span>
      )}
    </span>
  );
}

function TextInput({
  value,
  placeholder,
  onCommit,
  disabled,
  type = "text",
  wide,
}: {
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  type?: string;
  wide?: boolean;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  const commit = () => {
    if (local !== value) onCommit(local);
  };

  return (
    <input
      type={type}
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      disabled={disabled}
      style={{
        width: wide ? "340px" : "240px",
        padding: "6px 10px",
        fontSize: "0.82rem",
        borderRadius: "3px",
        border: "1px solid var(--border-strong)",
        background: "var(--bg-raised)",
        color: "var(--tx-1)",
      }}
    />
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return "dans le futur";
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.round(h / 24);
  if (days < 30) return `il y a ${days} j`;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  totalRequests: number;
  requestsToday: number;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  createdAt: string;
}

export default function ApiKeysClient({
  user,
}: {
  user: { email: string; role: string };
}) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [revealCopied, setRevealCopied] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/account/keys");
      const d = await r.json();
      setKeys(d.keys ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createKey = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/account/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const d = await r.json();
      if (!r.ok) {
        showToast(d.error ?? `HTTP ${r.status}`, false);
        return;
      }
      setCreatedKey(d.key);
      setNewName("");
      await load();
      showToast("Clé créée. Copiez-la maintenant, elle ne sera plus affichée.", true);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("Révoquer cette clé ? Les requêtes en cours avec cette clé vont cesser.")) return;
    const r = await fetch(`/api/account/keys?id=${id}`, { method: "DELETE" });
    if (r.ok) {
      await load();
      showToast("Clé révoquée", true);
    } else {
      showToast("Échec de la révocation", false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setRevealCopied(true);
      setTimeout(() => setRevealCopied(false), 2000);
    });
  };

  return (
    <div className="content-wrapper px-4 sm:px-6" style={{ maxWidth: "1000px" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.64rem",
            fontWeight: 700,
            color: "var(--gold)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginBottom: "8px",
          }}
        >
          Mon compte · Clés API
        </div>
        <h1
          style={{
            fontFamily: "var(--font-dm-serif), Georgia, serif",
            fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
            fontWeight: 400,
            letterSpacing: "-0.012em",
            color: "var(--tx-1)",
            marginBottom: "8px",
          }}
        >
          Clés <span style={{ fontStyle: "italic", color: "var(--gold)" }}>API</span>
        </h1>
        <p style={{ fontSize: "0.95rem", color: "var(--tx-2)", lineHeight: 1.6 }}>
          Créez des clés pour accéder à notre API REST publique (signaux, sociétés, dirigeants,
          backtests…). Une clé est affichée <strong>une seule fois</strong> à la création.
          Stockez-la en lieu sûr. Vous ne pourrez pas la récupérer ensuite.
        </p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
          <Link
            href="/api/docs"
            style={{
              padding: "8px 14px",
              border: "1px solid var(--gold-bd)",
              background: "var(--gold-bg)",
              color: "var(--gold)",
              borderRadius: "3px",
              textDecoration: "none",
              fontSize: "0.82rem",
              fontWeight: 600,
            }}
          >
            Documentation API (Swagger) ↗
          </Link>
          <Link
            href="/api/openapi.json"
            style={{
              padding: "8px 14px",
              border: "1px solid var(--border-strong)",
              background: "var(--bg-raised)",
              color: "var(--tx-2)",
              borderRadius: "3px",
              textDecoration: "none",
              fontSize: "0.82rem",
              fontWeight: 600,
            }}
          >
            Spec OpenAPI JSON ↗
          </Link>
        </div>
      </div>

      {/* Newly created key banner */}
      {createdKey && (
        <div
          style={{
            background: "var(--corporate-bg)",
            border: "1px solid var(--corporate-bd)",
            borderLeft: "3px solid var(--gold)",
            padding: "16px 20px",
            borderRadius: "4px",
            marginBottom: "18px",
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.62rem",
              color: "var(--gold)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: "6px",
            }}
          >
            ⚠ Clé générée · copiez-la maintenant
          </div>
          <p style={{ fontSize: "0.82rem", color: "var(--tx-2)", marginBottom: "10px" }}>
            Cette clé ne sera <strong>plus jamais affichée</strong>. Si vous la perdez,
            il faudra en créer une nouvelle.
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "var(--bg-base)",
              border: "1px solid var(--border-med)",
              padding: "10px 12px",
              borderRadius: "3px",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.82rem",
              flexWrap: "wrap",
            }}
          >
            <code
              style={{
                flex: 1,
                color: "var(--tx-1)",
                overflow: "auto",
                whiteSpace: "nowrap",
                minWidth: 0,
                wordBreak: "break-all",
              }}
            >
              {createdKey}
            </code>
            <button
              onClick={() => copyToClipboard(createdKey)}
              style={{
                padding: "10px 14px",
                minHeight: "44px",
                fontSize: "0.74rem",
                fontWeight: 700,
                background: "var(--gold)",
                color: "#0A0C10",
                border: "none",
                borderRadius: "3px",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {revealCopied ? "✓ Copié" : "Copier"}
            </button>
          </div>
          <button
            onClick={() => setCreatedKey(null)}
            style={{
              marginTop: "10px",
              padding: "10px 14px",
              minHeight: "44px",
              fontSize: "0.74rem",
              background: "transparent",
              border: "1px solid var(--border-strong)",
              color: "var(--tx-3)",
              borderRadius: "3px",
              cursor: "pointer",
            }}
          >
            J&apos;ai sauvegardé ma clé · masquer
          </button>
        </div>
      )}

      {/* Create form */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-med)",
          borderRadius: "4px",
          padding: "16px 20px",
          marginBottom: "18px",
        }}
      >
        <h2 style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--tx-1)", marginBottom: "10px" }}>
          Créer une nouvelle clé
        </h2>
        <div style={{ display: "flex", gap: "8px", alignItems: "stretch", flexWrap: "wrap" }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nom descriptif (ex: 'Script backtest', 'Bot Discord')"
            onKeyDown={(e) => { if (e.key === "Enter") createKey(); }}
            style={{
              flex: 1,
              minWidth: "180px",
              padding: "12px 12px",
              minHeight: "44px",
              fontSize: "0.88rem",
              borderRadius: "3px",
            }}
            disabled={creating}
          />
          <button
            onClick={createKey}
            disabled={!newName.trim() || creating}
            style={{
              padding: "12px 18px",
              minHeight: "44px",
              fontSize: "0.85rem",
              fontWeight: 700,
              background: "var(--corporate)",
              color: "#fff",
              border: "none",
              borderRadius: "3px",
              cursor: creating ? "progress" : "pointer",
              opacity: !newName.trim() || creating ? 0.5 : 1,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {creating ? "Création…" : "Générer →"}
          </button>
        </div>
        <p style={{ fontSize: "0.72rem", color: "var(--tx-3)", marginTop: "6px" }}>
          Limite : 10 clés actives simultanées par compte.
        </p>
      </div>

      {/* Keys list */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-med)",
          borderRadius: "4px",
          padding: "18px 20px",
        }}
      >
        <h2 style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--tx-1)", marginBottom: "12px" }}>
          Vos clés ({keys.filter((k) => !k.revokedAt).length} actives · {keys.length} total)
        </h2>

        {loading ? (
          <div style={{ padding: "20px", textAlign: "center", color: "var(--tx-3)" }}>Chargement…</div>
        ) : keys.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "var(--tx-3)" }}>
            Aucune clé. Créez-en une ci-dessus.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {keys.map((k) => (
              <KeyRow key={k.id} k={k} onRevoke={revoke} />
            ))}
          </div>
        )}
      </div>

      {/* Usage quick start */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-med)",
          borderLeft: "3px solid var(--gold)",
          borderRadius: "4px",
          padding: "18px 20px",
          marginTop: "18px",
        }}
      >
        <h2 style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--tx-1)", marginBottom: "10px" }}>
          Quick start · cURL
        </h2>
        <pre
          style={{
            background: "var(--bg-base)",
            border: "1px solid var(--border)",
            padding: "10px 14px",
            borderRadius: "3px",
            fontSize: "0.76rem",
            fontFamily: "'JetBrains Mono', monospace",
            color: "var(--tx-2)",
            overflow: "auto",
            lineHeight: 1.7,
          }}
        >
{`# Vérifier votre clé
curl https://insiders-trades-sigma.vercel.app/api/v1/me \\
  -H "Authorization: Bearer VOTRE_CLE"

# Top 5 signaux achats des 7 derniers jours
curl "https://insiders-trades-sigma.vercel.app/api/v1/signals?direction=BUY&minScore=40&limit=5" \\
  -H "Authorization: Bearer VOTRE_CLE"

# Détail d'une société
curl https://insiders-trades-sigma.vercel.app/api/v1/companies/bouygues \\
  -H "Authorization: Bearer VOTRE_CLE"`}
        </pre>
        <p style={{ fontSize: "0.8rem", color: "var(--tx-3)", marginTop: "10px", lineHeight: 1.6 }}>
          Pour explorer toutes les routes en interactif : <Link href="/api/docs" style={{ color: "var(--gold)", fontWeight: 600 }}>documentation Swagger</Link>.
        </p>
      </div>

      {toast && (
        <div
          style={{
          position: "fixed",
          bottom: "max(24px, env(safe-area-inset-bottom, 24px))",
          right: "max(16px, env(safe-area-inset-right, 16px))",
          padding: "12px 18px",
            borderRadius: "4px",
            background: toast.ok ? "var(--c-emerald-bg)" : "var(--c-crimson-bg)",
            border: `1px solid ${toast.ok ? "var(--c-emerald-bd)" : "var(--c-crimson-bd)"}`,
            color: toast.ok ? "var(--c-emerald)" : "var(--c-crimson)",
            fontSize: "0.82rem",
            fontWeight: 600,
            maxWidth: "420px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
            zIndex: 100,
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function KeyRow({
  k,
  onRevoke,
}: {
  k: ApiKey;
  onRevoke: (id: string) => void;
}) {
  const isRevoked = !!k.revokedAt;
  return (
    <div
      style={{
        padding: "12px 14px",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${isRevoked ? "var(--tx-4)" : "var(--gold)"}`,
        background: isRevoked ? "var(--bg-raised)" : "var(--bg-surface)",
        borderRadius: "3px",
        opacity: isRevoked ? 0.7 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "10px",
              flexWrap: "wrap",
              marginBottom: "4px",
            }}
          >
            <h3
              style={{
                fontSize: "0.92rem",
                fontWeight: 700,
                color: "var(--tx-1)",
                textDecoration: isRevoked ? "line-through" : "none",
              }}
            >
              {k.name}
            </h3>
            <code
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.74rem",
                color: "var(--gold)",
                background: "var(--gold-bg)",
                padding: "2px 7px",
                borderRadius: "2px",
              }}
            >
              {k.prefix}…
            </code>
            {isRevoked && (
              <span
                style={{
                  fontSize: "0.66rem",
                  color: "var(--c-crimson)",
                  background: "var(--c-crimson-bg)",
                  padding: "2px 7px",
                  borderRadius: "2px",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                }}
              >
                Révoquée
              </span>
            )}
            {!isRevoked && (
              <span
                style={{
                  fontSize: "0.66rem",
                  color: "var(--c-emerald)",
                  background: "var(--c-emerald-bg)",
                  padding: "2px 7px",
                  borderRadius: "2px",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                }}
              >
                Active
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: "0.72rem",
              color: "var(--tx-3)",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.02em",
              lineHeight: 1.7,
            }}
          >
            Créée {fmtDate(k.createdAt)}
            {k.lastUsedAt && <> · Dernière utilisation {fmtDate(k.lastUsedAt)}</>}
            {k.lastUsedIp && <> · IP {k.lastUsedIp}</>}
          </div>
          <div
            style={{
              marginTop: "6px",
              display: "flex",
              gap: "14px",
              flexWrap: "wrap",
              fontSize: "0.78rem",
              color: "var(--tx-2)",
            }}
          >
            <span>
              <strong style={{ color: "var(--tx-1)" }}>{k.totalRequests.toLocaleString("fr-FR")}</strong> requêtes total
            </span>
            <span>
              <strong style={{ color: "var(--gold)" }}>{k.requestsToday.toLocaleString("fr-FR")}</strong> aujourd&apos;hui
            </span>
            <span style={{ color: "var(--tx-3)" }}>scope: {k.scopes}</span>
          </div>
        </div>
        {!isRevoked && (
          <button
            onClick={() => onRevoke(k.id)}
            style={{
              padding: "11px 14px",
              minHeight: "44px",
              fontSize: "0.76rem",
              fontWeight: 600,
              border: "1px solid var(--c-crimson-bd)",
              background: "transparent",
              color: "var(--c-crimson)",
              borderRadius: "3px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Révoquer
          </button>
        )}
      </div>
    </div>
  );
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "à l'instant";
  if (diff < 3_600_000) return `il y a ${Math.round(diff / 60_000)} min`;
  if (diff < 86_400_000) return `il y a ${Math.round(diff / 3_600_000)} h`;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

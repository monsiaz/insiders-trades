"use client";

import { useCallback, useEffect, useState } from "react";

interface MagicLink {
  id: string;
  token: string;
  label: string;
  url: string;
  createdAt: string;
  expiresAt: string | null;
  usageCount: number;
  maxUses: number | null;
  revokedAt: string | null;
  isExpired: boolean;
  isRevoked: boolean;
  isExhausted: boolean;
}

function statusBadge(link: MagicLink) {
  if (link.isRevoked)   return { label: "Révoqué",  color: "var(--c-crimson)",  bg: "var(--c-crimson-bg)"  };
  if (link.isExpired)   return { label: "Expiré",   color: "var(--c-amber)",    bg: "var(--c-amber-bg)"    };
  if (link.isExhausted) return { label: "Épuisé",   color: "var(--tx-3)",       bg: "var(--bg-raised)"     };
  return                       { label: "Actif",    color: "var(--c-emerald)",  bg: "var(--c-emerald-bg)"  };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function MagicLinksTab({ showToast }: { showToast: (msg: string, ok?: boolean) => void }) {
  const [links, setLinks]       = useState<MagicLink[]>([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);

  // Form state
  const [label,   setLabel]   = useState("");
  const [expires, setExpires] = useState<string>("30");
  const [maxUses, setMaxUses] = useState<string>("");
  const [copied,  setCopied]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/admin/magic-links");
    const d = await r.json();
    setLinks(d.links ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!label.trim()) { showToast("Un libellé est requis.", false); return; }
    setCreating(true);
    const r = await fetch("/api/admin/magic-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: label.trim(),
        expiresInDays: expires ? Number(expires) : null,
        maxUses: maxUses ? Number(maxUses) : null,
      }),
    });
    const d = await r.json();
    if (!r.ok) { showToast(d.error ?? "Erreur", false); setCreating(false); return; }
    setLabel(""); setExpires("30"); setMaxUses("");
    await load();
    // Auto-copy the new link
    navigator.clipboard.writeText(d.link.url).catch(() => {});
    showToast("✓ Lien créé et copié dans le presse-papier !");
    setCreating(false);
  };

  const revoke = async (id: string, lbl: string) => {
    if (!confirm(`Révoquer "${lbl}" ? Les visiteurs ayant ce lien ne pourront plus se connecter.`)) return;
    const r = await fetch(`/api/admin/magic-links?id=${id}`, { method: "DELETE" });
    if (r.ok) { await load(); showToast("Lien révoqué."); }
    else showToast("Erreur lors de la révocation.", false);
  };

  const copy = (url: string, id: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
      showToast("✓ Lien copié !");
    });
  };

  const activeLinks  = links.filter((l) => !l.isRevoked && !l.isExpired && !l.isExhausted);
  const inactiveLinks = links.filter((l) => l.isRevoked || l.isExpired || l.isExhausted);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* ── Info banner ─────────────────────────────────────────────────────── */}
      <div style={{ padding: "14px 18px", borderRadius: "10px", background: "var(--c-indigo-bg)", border: "1px solid var(--c-indigo-bd)", fontSize: "0.84rem", color: "var(--tx-2)", lineHeight: 1.6 }}>
        <strong style={{ color: "var(--c-indigo-2)" }}>Liens magiques</strong> — partage un lien qui connecte le visiteur automatiquement (sans mot de passe) avec l&apos;accès admin complet.
        Chaque lien peut avoir une date d&apos;expiration et un nombre d&apos;utilisations maximum.
      </div>

      {/* ── Créer un lien ───────────────────────────────────────────────────── */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-med)", borderRadius: "12px", padding: "20px 22px" }}>
        <h3 style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--tx-1)", marginBottom: "16px" }}>
          Générer un nouveau lien
        </h3>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end" }}>
          {/* Label */}
          <div style={{ flex: "2 1 200px" }}>
            <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "var(--tx-3)", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Libellé *
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") create(); }}
              placeholder='ex: "Pour Jean-Marc", "Bêta testeurs équipe"'
              style={{ width: "100%", padding: "10px 12px", minHeight: "44px", borderRadius: "8px", fontSize: "0.85rem" }}
            />
          </div>

          {/* Expiration */}
          <div style={{ flex: "1 1 130px" }}>
            <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "var(--tx-3)", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Expire dans
            </label>
            <select
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", minHeight: "44px", borderRadius: "8px", fontSize: "0.85rem" }}
            >
              <option value="">Jamais</option>
              <option value="1">1 jour</option>
              <option value="7">7 jours</option>
              <option value="30">30 jours</option>
              <option value="90">90 jours</option>
              <option value="365">1 an</option>
            </select>
          </div>

          {/* Max uses */}
          <div style={{ flex: "1 1 130px" }}>
            <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "var(--tx-3)", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Utilisations max
            </label>
            <input
              type="number"
              min="1"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="Illimitées"
              style={{ width: "100%", padding: "10px 12px", minHeight: "44px", borderRadius: "8px", fontSize: "0.85rem" }}
            />
          </div>

          {/* Submit */}
          <button
            onClick={create}
            disabled={creating || !label.trim()}
            style={{ padding: "10px 20px", minHeight: "44px", fontWeight: 700, fontSize: "0.85rem", background: "var(--gold)", color: "#0A0C10", border: "none", borderRadius: "8px", cursor: creating ? "progress" : "pointer", opacity: !label.trim() || creating ? 0.5 : 1, whiteSpace: "nowrap", flexShrink: 0 }}
          >
            {creating ? "Création…" : "✦ Générer + copier"}
          </button>
        </div>
      </div>

      {/* ── Liste active ────────────────────────────────────────────────────── */}
      <div>
        <h3 style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--tx-1)", marginBottom: "12px" }}>
          Liens actifs ({activeLinks.length})
        </h3>

        {loading ? (
          <div style={{ padding: "24px", textAlign: "center", color: "var(--tx-3)" }}>Chargement…</div>
        ) : activeLinks.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "var(--tx-3)", fontSize: "0.84rem", background: "var(--bg-surface)", borderRadius: "8px", border: "1px solid var(--border)" }}>
            Aucun lien actif. Génère-en un ci-dessus.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {activeLinks.map((link) => (
              <LinkRow key={link.id} link={link} onCopy={copy} onRevoke={revoke} copied={copied} />
            ))}
          </div>
        )}
      </div>

      {/* ── Liens inactifs (collapsed) ──────────────────────────────────────── */}
      {inactiveLinks.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", fontSize: "0.84rem", color: "var(--tx-3)", padding: "4px 0", userSelect: "none" }}>
            Liens inactifs / révoqués ({inactiveLinks.length})
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
            {inactiveLinks.map((link) => (
              <LinkRow key={link.id} link={link} onCopy={copy} onRevoke={revoke} copied={copied} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function LinkRow({ link, onCopy, onRevoke, copied }: {
  link: MagicLink;
  onCopy: (url: string, id: string) => void;
  onRevoke: (id: string, label: string) => void;
  copied: string | null;
}) {
  const status = statusBadge(link);
  const isActive = !link.isRevoked && !link.isExpired && !link.isExhausted;

  return (
    <div style={{ padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--border)", background: isActive ? "var(--bg-surface)" : "var(--bg-raised)", opacity: isActive ? 1 : 0.7 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        {/* Left: label + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
            <span style={{ fontWeight: 700, color: "var(--tx-1)", fontSize: "0.88rem" }}>{link.label}</span>
            <span style={{ fontSize: "0.64rem", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", background: status.bg, color: status.color, border: `1px solid ${status.color}22` }}>
              {status.label}
            </span>
          </div>

          {/* URL truncated */}
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem", color: "var(--gold)", background: "var(--gold-bg)", padding: "4px 10px", borderRadius: "5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "500px", marginBottom: "8px" }}>
            {link.url}
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "0.72rem", color: "var(--tx-4)", fontFamily: "'JetBrains Mono', monospace" }}>
            <span>Créé le {fmtDate(link.createdAt)}</span>
            {link.expiresAt && <span>Expire le {fmtDate(link.expiresAt)}</span>}
            <span>
              <strong style={{ color: "var(--tx-2)" }}>{link.usageCount}</strong>
              {link.maxUses != null ? ` / ${link.maxUses}` : ""} utilisation{link.usageCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <button
            onClick={() => onCopy(link.url, link.id)}
            style={{ padding: "8px 14px", minHeight: "38px", fontSize: "0.78rem", fontWeight: 600, background: copied === link.id ? "var(--c-emerald-bg)" : "var(--bg-raised)", color: copied === link.id ? "var(--c-emerald)" : "var(--tx-2)", border: `1px solid ${copied === link.id ? "var(--c-emerald-bd)" : "var(--border-med)"}`, borderRadius: "7px", cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.1s" }}
          >
            {copied === link.id ? "✓ Copié" : "Copier le lien"}
          </button>
          {!link.isRevoked && (
            <button
              onClick={() => onRevoke(link.id, link.label)}
              style={{ padding: "8px 12px", minHeight: "38px", fontSize: "0.78rem", fontWeight: 600, background: "transparent", color: "var(--c-crimson)", border: "1px solid var(--c-crimson-bd)", borderRadius: "7px", cursor: "pointer", whiteSpace: "nowrap" }}
            >
              Révoquer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

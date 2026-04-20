"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/Logo";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", password: "", confirm: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const strength = (() => {
    const p = form.password;
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8) s++;
    if (p.length >= 12) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^a-zA-Z0-9]/.test(p)) s++;
    return s;
  })();

  const strengthLabel = ["", "Faible", "Moyen", "Bon", "Fort", "Excellent"][strength];
  const strengthColor = ["", "var(--c-crimson)", "var(--c-amber)", "var(--c-amber)", "var(--c-emerald)", "var(--c-emerald)"][strength];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.firstName.trim()) { setError("Le prénom est requis"); return; }
    if (!form.lastName.trim()) { setError("Le nom est requis"); return; }
    if (form.password !== form.confirm) { setError("Les mots de passe ne correspondent pas"); return; }
    if (form.password.length < 8) { setError("Mot de passe trop court (8 caractères minimum)"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erreur"); return; }
      router.push("/portfolio?new=1");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      background: "var(--bg-base)",
    }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>

        {/* Logo + header */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
            <LogoMark size={48} />
          </div>
          <h1 style={{
            fontFamily: "'Banana Grotesk', 'Inter', system-ui, sans-serif",
            fontSize: "1.75rem",
            fontWeight: 700,
            letterSpacing: "-0.035em",
            color: "var(--tx-1)",
            marginBottom: "6px",
          }}>
            Créer un compte
          </h1>
          <p style={{ fontFamily: "'Inter', system-ui", fontSize: "0.875rem", color: "var(--tx-3)" }}>
            Accédez aux signaux, recommandations et alertes
          </p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: "28px 28px 24px" }}>
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            {error && (
              <div style={{
                borderRadius: "10px",
                padding: "10px 14px",
                fontSize: "0.84rem",
                fontFamily: "'Inter', system-ui",
                background: "var(--c-crimson-bg)",
                border: "1px solid var(--c-crimson-bd)",
                color: "var(--c-crimson)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>
                {error}
              </div>
            )}

            {/* Prénom + Nom côte à côte */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <FieldGroup label="Prénom" required>
                <input
                  type="text"
                  value={form.firstName}
                  onChange={set("firstName")}
                  autoComplete="given-name"
                  required
                  placeholder="Marie"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "10px" }}
                />
              </FieldGroup>
              <FieldGroup label="Nom" required>
                <input
                  type="text"
                  value={form.lastName}
                  onChange={set("lastName")}
                  autoComplete="family-name"
                  required
                  placeholder="Dupont"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "10px" }}
                />
              </FieldGroup>
            </div>

            <FieldGroup label="Adresse email" required>
              <input
                type="email"
                value={form.email}
                onChange={set("email")}
                autoComplete="email"
                required
                placeholder="vous@exemple.com"
                style={{ width: "100%", padding: "9px 12px", borderRadius: "10px" }}
              />
            </FieldGroup>

            <FieldGroup label="Mot de passe" required>
              <div style={{ position: "relative" }}>
                <input
                  type={showPwd ? "text" : "password"}
                  value={form.password}
                  onChange={set("password")}
                  autoComplete="new-password"
                  required
                  placeholder="8 caractères minimum"
                  style={{ width: "100%", padding: "9px 40px 9px 12px", borderRadius: "10px" }}
                />
                <button type="button" onClick={() => setShowPwd(v => !v)} style={{
                  position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", color: "var(--tx-3)", padding: "2px",
                }}>
                  {showPwd
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>
                  }
                </button>
              </div>
              {/* Password strength bar */}
              {form.password && (
                <div style={{ marginTop: "6px" }}>
                  <div style={{ display: "flex", gap: "3px", marginBottom: "4px" }}>
                    {[1,2,3,4,5].map(i => (
                      <div key={i} style={{
                        flex: 1, height: "3px", borderRadius: "2px",
                        background: i <= strength ? strengthColor : "var(--border-med)",
                        transition: "background 0.2s",
                      }} />
                    ))}
                  </div>
                  <p style={{ fontSize: "0.72rem", color: strengthColor, fontFamily: "'Inter', system-ui", fontWeight: 500 }}>
                    {strengthLabel}
                  </p>
                </div>
              )}
            </FieldGroup>

            <FieldGroup label="Confirmer le mot de passe" required>
              <div style={{ position: "relative" }}>
                <input
                  type={showPwd ? "text" : "password"}
                  value={form.confirm}
                  onChange={set("confirm")}
                  autoComplete="new-password"
                  required
                  placeholder="••••••••"
                  style={{ width: "100%", padding: "9px 40px 9px 12px", borderRadius: "10px" }}
                />
                {form.confirm && (
                  <span style={{
                    position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                    color: form.password === form.confirm ? "var(--c-emerald)" : "var(--c-crimson)",
                    fontSize: "0.85rem",
                  }}>
                    {form.password === form.confirm ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                    )}
                  </span>
                )}
              </div>
            </FieldGroup>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-cta-gradient"
              style={{ width: "100%", padding: "11px", fontSize: "0.9375rem", marginTop: "4px" }}
            >
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3"/>
                    <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                  Création…
                </span>
              ) : "Créer mon compte"}
            </button>

            {/* Legal note */}
            <p style={{
              fontSize: "0.72rem",
              color: "var(--tx-4)",
              textAlign: "center",
              fontFamily: "'Inter', system-ui",
              lineHeight: 1.5,
            }}>
              En créant un compte, vous acceptez les conditions d&apos;utilisation et la politique de confidentialité.
            </p>
          </form>
        </div>

        <p style={{
          textAlign: "center",
          fontSize: "0.875rem",
          color: "var(--tx-3)",
          marginTop: "20px",
          fontFamily: "'Inter', system-ui",
        }}>
          Déjà un compte ?{" "}
          <Link href="/auth/login" style={{ color: "var(--c-indigo-2)", fontWeight: 600 }}>
            Se connecter
          </Link>
        </p>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

function FieldGroup({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: "block",
        fontSize: "0.78rem",
        fontWeight: 600,
        fontFamily: "'Inter', system-ui",
        color: "var(--tx-2)",
        marginBottom: "6px",
      }}>
        {label}{required && <span style={{ color: "var(--c-crimson)", marginLeft: "2px" }}>*</span>}
      </label>
      {children}
    </div>
  );
}

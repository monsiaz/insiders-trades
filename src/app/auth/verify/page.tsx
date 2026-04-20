import { Suspense } from "react";
import Link from "next/link";

export default function VerifyPage() {
  return (
    <Suspense>
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-card rounded-2xl p-12 text-center max-w-sm">
          <div className="mx-auto mb-5 flex items-center justify-center w-14 h-14 rounded-2xl" style={{ background: "var(--bg-raised)", border: "1px solid var(--border-med)" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ color: "var(--c-indigo-2)" }}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Vérifiez vos emails</h1>
          <p className="text-slate-400 text-sm mb-6">Un email de vérification a été envoyé. Cliquez sur le lien pour activer votre compte.</p>
          <Link href="/portfolio" className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
            Continuer sans vérification →
          </Link>
        </div>
      </div>
    </Suspense>
  );
}

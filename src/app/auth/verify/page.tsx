import { Suspense } from "react";
import Link from "next/link";

export default function VerifyPage() {
  return (
    <Suspense>
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-card rounded-2xl p-12 text-center max-w-sm">
          <div className="text-4xl mb-4">✉️</div>
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

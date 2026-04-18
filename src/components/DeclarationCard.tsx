import Link from "next/link";
import { DeclarationType } from "@prisma/client";

interface DeclarationCardProps {
  declaration: {
    id: string;
    amfId: string;
    type: DeclarationType;
    pubDate: Date;
    link: string;
    description: string;
    company: { name: string; slug: string };
    insider?: { name: string; slug: string } | null;
    insiderName?: string | null;
    insiderFunction?: string | null;
    transactionNature?: string | null;
    instrumentType?: string | null;
    isin?: string | null;
    unitPrice?: number | null;
    volume?: number | null;
    totalAmount?: number | null;
    currency?: string | null;
    transactionDate?: Date | null;
    transactionVenue?: string | null;
    pdfParsed?: boolean;
    signalScore?: number | null;
    pctOfMarketCap?: number | null;
    pctOfInsiderFlow?: number | null;
  };
  showCompany?: boolean;
}

function getTradeStyle(nature?: string | null) {
  if (!nature) return null;
  const n = nature.toLowerCase();
  if (n.includes("cession")) return { label: "Vente", icon: "▼", cls: "badge-sell", amountCls: "text-rose-400" };
  if (n.includes("acquisition")) return { label: "Achat", icon: "▲", cls: "badge-buy", amountCls: "text-emerald-400" };
  if (n.includes("exercice") || n.includes("option")) return { label: "Options", icon: "⚡", cls: "bg-amber-400/10 border border-amber-400/20 text-amber-400", amountCls: "text-amber-400" };
  if (n.includes("attribution")) return { label: "Attribution", icon: "✦", cls: "bg-violet-400/10 border border-violet-400/20 text-violet-400", amountCls: "text-violet-400" };
  return { label: nature, icon: "●", cls: "badge-neutral", amountCls: "text-slate-300" };
}

function fmt(amount: number | null | undefined, currency?: string | null): string {
  if (!amount) return "";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: 0,
    notation: amount >= 1_000_000 ? "compact" : "standard",
  }).format(amount);
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

// Signal score → visual indicator
function SignalBadge({ score }: { score: number }) {
  if (score >= 70) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/15 border border-amber-400/25 text-amber-300">
      <span className="text-[8px]">⚡</span>Signal fort {score}
    </span>
  );
  if (score >= 45) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-400/10 border border-indigo-400/20 text-indigo-300">
      <span className="text-[8px]">◆</span>Signal {score}
    </span>
  );
  return null;
}

const TYPE_BADGE: Record<DeclarationType, string> = {
  DIRIGEANTS: "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20",
  SEUILS: "bg-sky-500/10 text-sky-300 border border-sky-500/20",
  PROSPECTUS: "bg-violet-500/10 text-violet-300 border border-violet-500/20",
  OTHER: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
};
const TYPE_LABEL: Record<DeclarationType, string> = {
  DIRIGEANTS: "Dirigeants",
  SEUILS: "Seuils",
  PROSPECTUS: "Prospectus",
  OTHER: "Autre",
};

export function DeclarationCard({ declaration, showCompany = true }: DeclarationCardProps) {
  const trade = getTradeStyle(declaration.transactionNature);
  const hasDetail = declaration.pdfParsed && declaration.insiderName;
  const pubDate = declaration.transactionDate ?? declaration.pubDate;
  const score = declaration.signalScore ?? 0;
  const pctMcap = declaration.pctOfMarketCap;
  const pctFlow = declaration.pctOfInsiderFlow;

  return (
    <div className="glass-card rounded-2xl p-4 group">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">

          {/* Top row: badges + company */}
          <div className="flex flex-wrap items-center gap-2 mb-2.5">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${TYPE_BADGE[declaration.type]}`}>
              {TYPE_LABEL[declaration.type]}
            </span>

            {trade && (
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${trade.cls}`}>
                <span className="text-[9px]">{trade.icon}</span>
                {trade.label}
              </span>
            )}

            {showCompany && (
              <Link
                href={`/company/${declaration.company.slug}`}
                className="text-sm font-semibold text-slate-200 hover:text-white transition-colors"
              >
                {declaration.company.name}
              </Link>
            )}

            {score >= 45 && <SignalBadge score={Math.round(score)} />}
          </div>

          {/* Insider row */}
          {hasDetail && declaration.insiderName && (
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-6 h-6 rounded-full avatar-glass flex items-center justify-center text-[10px] text-violet-300 font-bold flex-shrink-0">
                {declaration.insiderName.charAt(0)}
              </div>
              <span className="text-sm font-medium text-slate-200">{declaration.insiderName}</span>
              {declaration.insiderFunction && (
                <span className="text-xs text-slate-500 truncate">{declaration.insiderFunction}</span>
              )}
            </div>
          )}

          {/* Trade details row */}
          {hasDetail && (declaration.totalAmount || declaration.volume) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2.5">
              {declaration.totalAmount && (
                <span className={`text-base font-bold tabular-nums ${trade?.amountCls ?? "text-slate-200"}`}>
                  {fmt(declaration.totalAmount, declaration.currency)}
                </span>
              )}
              {declaration.volume && (
                <span className="text-xs text-slate-500">
                  {new Intl.NumberFormat("fr-FR").format(declaration.volume)} titres
                </span>
              )}
              {declaration.unitPrice && (
                <span className="text-xs text-slate-500">
                  @{" "}
                  {new Intl.NumberFormat("fr-FR", {
                    style: "currency",
                    currency: declaration.currency || "EUR",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 4,
                  }).format(declaration.unitPrice)}
                </span>
              )}
              {/* % of market cap */}
              {pctMcap != null && pctMcap > 0 && (
                <span className="text-[11px] font-semibold text-amber-400/80 bg-amber-400/8 border border-amber-400/15 px-2 py-0.5 rounded-lg tabular-nums">
                  {pctMcap < 0.01
                    ? `${pctMcap.toFixed(4)}% mcap`
                    : pctMcap < 0.1
                    ? `${pctMcap.toFixed(3)}% mcap`
                    : `${pctMcap.toFixed(2)}% mcap`}
                </span>
              )}
              {/* % of insider's own flow */}
              {pctFlow != null && pctFlow > 0 && (
                <span className="text-[11px] text-slate-500 tabular-nums">
                  {pctFlow.toFixed(1)}% de son flux
                </span>
              )}
              {declaration.isin && (
                <span className="font-mono text-[10px] text-slate-600 bg-white/5 px-2 py-0.5 rounded">
                  {declaration.isin}
                </span>
              )}
            </div>
          )}

          {/* Secondary details */}
          {hasDetail && (declaration.instrumentType || declaration.transactionVenue) && (
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {declaration.instrumentType && (
                <span className="text-[11px] text-slate-600 bg-white/4 border border-white/5 px-2 py-0.5 rounded-lg">
                  {declaration.instrumentType}
                </span>
              )}
              {declaration.transactionVenue && (
                <span className="text-[11px] text-slate-600">
                  📍 {declaration.transactionVenue}
                </span>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            <span className="font-mono">{declaration.amfId}</span>
            <span>·</span>
            <time>{fmtDate(pubDate)}</time>
            {!declaration.pdfParsed && declaration.type === "DIRIGEANTS" && (
              <span className="text-slate-700 italic">détails non chargés</span>
            )}
          </div>
        </div>

        {/* AMF link */}
        <a
          href={declaration.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 btn-glass px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1"
        >
          AMF ↗
        </a>
      </div>
    </div>
  );
}

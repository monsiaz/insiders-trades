import Link from "next/link";
import { DeclarationType } from "@prisma/client";
import { formatDate } from "@/lib/utils";

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
    // Trade detail fields
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
  };
  showCompany?: boolean;
}

const TYPE_CONFIG: Record<DeclarationType, { label: string; color: string }> = {
  DIRIGEANTS: {
    label: "Dirigeants",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  SEUILS: {
    label: "Seuils",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  PROSPECTUS: {
    label: "Prospectus",
    color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  OTHER: {
    label: "Autre",
    color: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  },
};

const NATURE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  acquisition: { label: "Achat", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: "▲" },
  cession: { label: "Vente", color: "text-red-400 bg-red-500/10 border-red-500/20", icon: "▼" },
  exercice: { label: "Options", color: "text-orange-400 bg-orange-500/10 border-orange-500/20", icon: "⚡" },
  attribution: { label: "Attribution", color: "text-violet-400 bg-violet-500/10 border-violet-500/20", icon: "🎁" },
};

function getNatureConfig(nature?: string | null) {
  if (!nature) return null;
  const key = Object.keys(NATURE_CONFIG).find((k) =>
    nature.toLowerCase().includes(k)
  );
  return key ? NATURE_CONFIG[key] : { label: nature, color: "text-gray-400 bg-gray-500/10 border-gray-500/20", icon: "●" };
}

function formatAmount(amount: number | null | undefined, currency?: string | null): string {
  if (!amount) return "";
  const curr = currency || "EUR";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: curr,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatVolume(vol: number | null | undefined): string {
  if (!vol) return "";
  return new Intl.NumberFormat("fr-FR").format(vol) + " titres";
}

export function DeclarationCard({
  declaration,
  showCompany = true,
}: DeclarationCardProps) {
  const config = TYPE_CONFIG[declaration.type];
  const natureConfig = getNatureConfig(declaration.transactionNature);
  const hasDetail = declaration.pdfParsed && declaration.insiderName;

  return (
    <div className="group rounded-xl border border-gray-800 bg-gray-900/30 hover:bg-gray-900/60 hover:border-gray-700 transition-all p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
              {config.label}
            </span>

            {/* Transaction nature badge */}
            {natureConfig && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${natureConfig.color}`}>
                <span>{natureConfig.icon}</span>
                {natureConfig.label}
              </span>
            )}

            {showCompany && (
              <Link
                href={`/company/${declaration.company.slug}`}
                className="text-sm font-semibold text-white hover:text-emerald-400 transition-colors"
              >
                {declaration.company.name}
              </Link>
            )}
          </div>

          {/* Insider name */}
          {hasDetail && declaration.insiderName && (
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full bg-violet-500/20 border border-violet-500/20 flex items-center justify-center text-xs text-violet-400 font-bold flex-shrink-0">
                {declaration.insiderName.charAt(0).toUpperCase()}
              </div>
              <div>
                <span className="text-sm font-medium text-gray-200">
                  {declaration.insiderName}
                </span>
                {declaration.insiderFunction && (
                  <span className="text-xs text-gray-500 ml-2">
                    {declaration.insiderFunction}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Trade details row */}
          {hasDetail && (declaration.totalAmount || declaration.volume || declaration.unitPrice) && (
            <div className="flex flex-wrap items-center gap-3 mb-2">
              {declaration.totalAmount && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Montant</span>
                  <span className={`text-sm font-bold ${declaration.transactionNature?.toLowerCase().includes("cession") ? "text-red-400" : "text-emerald-400"}`}>
                    {formatAmount(declaration.totalAmount, declaration.currency)}
                  </span>
                </div>
              )}
              {declaration.volume && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Volume</span>
                  <span className="text-sm text-gray-300">{formatVolume(declaration.volume)}</span>
                </div>
              )}
              {declaration.unitPrice && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Prix unit.</span>
                  <span className="text-sm text-gray-300">
                    {new Intl.NumberFormat("fr-FR", { style: "currency", currency: declaration.currency || "EUR", minimumFractionDigits: 2 }).format(declaration.unitPrice)}
                  </span>
                </div>
              )}
              {declaration.isin && (
                <span className="text-xs font-mono text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                  {declaration.isin}
                </span>
              )}
            </div>
          )}

          {/* Extra details */}
          {hasDetail && (declaration.instrumentType || declaration.transactionVenue) && (
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {declaration.instrumentType && (
                <span className="text-xs text-gray-500 bg-gray-800/50 px-2 py-0.5 rounded">
                  {declaration.instrumentType}
                </span>
              )}
              {declaration.transactionVenue && (
                <span className="text-xs text-gray-500">
                  📍 {declaration.transactionVenue}
                </span>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="font-mono text-gray-600">{declaration.amfId}</span>
            <span>·</span>
            <time dateTime={declaration.pubDate.toISOString()}>
              {formatDate(declaration.transactionDate ?? declaration.pubDate)}
            </time>
            {!declaration.pdfParsed && declaration.type === "DIRIGEANTS" && (
              <span className="text-gray-600 italic">Détails en cours de chargement...</span>
            )}
          </div>
        </div>

        <a
          href={declaration.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 bg-gray-800/50 hover:bg-gray-800 transition-all"
          title="Voir sur AMF"
        >
          AMF ↗
        </a>
      </div>
    </div>
  );
}

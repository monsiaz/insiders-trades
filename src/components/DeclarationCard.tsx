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

export function DeclarationCard({
  declaration,
  showCompany = true,
}: DeclarationCardProps) {
  const config = TYPE_CONFIG[declaration.type];

  return (
    <div className="group rounded-xl border border-gray-800 bg-gray-900/30 hover:bg-gray-900/60 hover:border-gray-700 transition-all p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.color}`}
            >
              {config.label}
            </span>
            {showCompany && (
              <Link
                href={`/company/${declaration.company.slug}`}
                className="text-sm font-medium text-white hover:text-emerald-400 transition-colors truncate"
              >
                {declaration.company.name}
              </Link>
            )}
            {declaration.insider && (
              <>
                <span className="text-gray-600">·</span>
                <Link
                  href={`/insider/${declaration.insider.slug}`}
                  className="text-sm text-gray-300 hover:text-emerald-400 transition-colors"
                >
                  {declaration.insider.name}
                </Link>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="font-mono">{declaration.amfId}</span>
            <span>·</span>
            <time dateTime={declaration.pubDate.toISOString()}>
              {formatDate(declaration.pubDate)}
            </time>
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

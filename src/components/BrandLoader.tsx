import { LogoMark } from "@/components/Logo";

/**
 * Shared brand loader — used by every route-level loading.tsx.
 * Pulsing Sigma mark + gold sliver + animated dots.
 */
export function BrandLoader() {
  return (
    <div className="brand-loader" aria-live="polite" aria-busy="true">
      <div className="brand-loader-sliver" aria-hidden="true" />

      <div className="brand-loader-center">
        <div className="brand-loader-mark">
          <div className="brand-loader-halo" aria-hidden="true" />
          <LogoMark size={56} />
        </div>

        <div className="brand-loader-wordmark">
          <span>Insiders</span>
          <span className="brand-loader-accent">Trades</span>
          <span className="brand-loader-sigma">Sigma</span>
        </div>

        <div className="brand-loader-dots" aria-hidden="true">
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}

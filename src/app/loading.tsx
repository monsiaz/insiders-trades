import { LogoMark } from "@/components/Logo";

/**
 * Global loading fallback · shown during cold starts and first server renders.
 *
 * Design principle: a page in flight should feel *intentional*, not *broken*.
 * The previous naked-skeleton strip screamed "empty page" before SSR completed.
 * Now we show a quiet, branded loader — pulsing Sigma eye + wordmark + a thin
 * gold progress sliver — which reads as "loading" rather than "missing".
 */
export default function Loading() {
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

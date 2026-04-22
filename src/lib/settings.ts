/**
 * Typed wrapper around the `Setting` key-value table.
 *
 * Usage:
 *   const cfg = await getAlertsConfig();
 *   await updateAlertsConfig({ enabled: false });
 *
 * All settings are merged with a deterministic default, so the caller always
 * gets a fully-populated object even on first read.
 */

import { prisma } from "./prisma";

// ── Alerts configuration ─────────────────────────────────────────────────────

export type AlertFrequency = "daily" | "weekdays" | "weekly" | "disabled";

export interface AlertsConfig {
  /** Master switch · if false, no emails are sent regardless of other settings */
  enabled: boolean;
  /** When to send: daily / Mon-Fri only / once a week on Monday / off */
  frequency: AlertFrequency;
  /** Hour of the day (0–23, UTC) · only used when triggered by cron */
  hour: number;
  /** Minimum signalScore (0–100) for a declaration to surface as portfolio alert */
  minSignalScore: number;
  /** How far back (hours) to look for portfolio alerts (insider moves on user holdings) */
  portfolioWindowHours: number;
  /** Max number of top BUY recos included in each digest */
  topBuysLimit: number;
  /** Max number of top SELL recos included in each digest */
  topSellsLimit: number;
  /** Lookback window (days) for BUY/SELL recommendation pools */
  lookbackDays: number;
  /** Include top BUY recommendations in digest */
  includeTopBuys: boolean;
  /** Include top SELL recommendations in digest */
  includeTopSells: boolean;
  /** Include portfolio-specific alerts in digest */
  includePortfolioAlerts: boolean;
  /**
   * Dev / test override · if set, every outgoing alert email goes to this
   * address instead of the user's real email. Keep null in production.
   */
  recipientOverride: string | null;
  /** Free-form operator note (why did we tweak this? etc.) · surfaced in admin UI */
  note: string;
  /** Updated timestamp (for display only) */
  updatedAt?: string;
}

export const DEFAULT_ALERTS_CONFIG: AlertsConfig = {
  enabled: true,
  frequency: "daily",
  hour: 3,
  minSignalScore: 35,
  portfolioWindowHours: 48,
  topBuysLimit: 3,
  topSellsLimit: 3,
  lookbackDays: 7,
  includeTopBuys: true,
  includeTopSells: true,
  includePortfolioAlerts: true,
  recipientOverride: null,
  note: "",
};

const ALERTS_KEY = "alerts.config";

/** Read the live alerts config, merged with defaults. */
export async function getAlertsConfig(): Promise<AlertsConfig> {
  const row = await prisma.setting.findUnique({ where: { key: ALERTS_KEY } });
  if (!row) return { ...DEFAULT_ALERTS_CONFIG };
  const stored = (row.value ?? {}) as Partial<AlertsConfig>;
  return {
    ...DEFAULT_ALERTS_CONFIG,
    ...stored,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Persist a partial update · fields not provided keep their stored value. */
export async function updateAlertsConfig(
  patch: Partial<AlertsConfig>
): Promise<AlertsConfig> {
  const current = await getAlertsConfig();
  const next: AlertsConfig = { ...current, ...patch };
  // Sanitize
  next.hour = Math.max(0, Math.min(23, Math.round(next.hour ?? 0)));
  next.minSignalScore = Math.max(0, Math.min(100, Math.round(next.minSignalScore ?? 0)));
  next.portfolioWindowHours = Math.max(1, Math.min(720, Math.round(next.portfolioWindowHours ?? 48)));
  next.topBuysLimit = Math.max(0, Math.min(10, Math.round(next.topBuysLimit ?? 3)));
  next.topSellsLimit = Math.max(0, Math.min(10, Math.round(next.topSellsLimit ?? 3)));
  next.lookbackDays = Math.max(1, Math.min(60, Math.round(next.lookbackDays ?? 7)));
  if (next.recipientOverride && !next.recipientOverride.includes("@")) {
    next.recipientOverride = null;
  }

  const { updatedAt: _drop, ...persist } = next;
  void _drop;

  const saved = await prisma.setting.upsert({
    where: { key: ALERTS_KEY },
    create: { key: ALERTS_KEY, value: persist as object },
    update: { value: persist as object },
  });

  return {
    ...DEFAULT_ALERTS_CONFIG,
    ...(saved.value as Partial<AlertsConfig>),
    updatedAt: saved.updatedAt.toISOString(),
  };
}

/**
 * Given the current config + current date, should the cron actually dispatch
 * emails right now? (Used by /api/cron · it always runs at 3am UTC, but we
 * only want to actually email users when the frequency says so.)
 */
export function shouldDispatchOn(
  cfg: AlertsConfig,
  date: Date = new Date()
): boolean {
  if (!cfg.enabled) return false;
  const day = date.getUTCDay(); // 0 = Sunday
  switch (cfg.frequency) {
    case "disabled": return false;
    case "daily":    return true;
    case "weekdays": return day >= 1 && day <= 5;
    case "weekly":   return day === 1; // Monday
    default:         return true;
  }
}

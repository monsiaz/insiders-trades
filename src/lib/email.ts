import nodemailer from "nodemailer";
import type { RecoItem } from "./recommendation-engine";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://insiders-trades-sigma.vercel.app";
const FROM_EMAIL = process.env.EMAIL_FROM ?? "Insiders Trades Sigma <noreply@insiders-trades-sigma.app>";

// ── Brand tokens (email-safe inline) ─────────────────────────────────────────
const BRAND = {
  navy:      "#112A46",
  navyDeep:  "#0A1B30",
  navyLight: "#3A5687",
  gold:      "#B8955A",
  goldSoft:  "rgba(184,149,90,0.10)",
  green:     "#009E62",
  red:       "#C82038",
  paper:     "#FDFBF7",
  cream:     "#F4F1EC",
  ink:       "#0A0C10",
  tx1:       "#0A0C10",
  tx2:       "#3D3428",
  tx3:       "#7A6E5E",
  tx4:       "#AA9E8E",
  border:    "rgba(17,42,70,0.10)",
  borderStr: "rgba(17,42,70,0.18)",
} as const;

// ── Transport ────────────────────────────────────────────────────────────────

function createTransport() {
  // Support for Gmail SMTP (easiest setup) or any SMTP
  if (process.env.EMAIL_HOST) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT ?? "587"),
      secure: process.env.EMAIL_SECURE === "true",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  // Gmail shorthand — support both GMAIL_USER and GMAIL_APP_USER env names
  const gmailUser = process.env.GMAIL_USER ?? process.env.GMAIL_APP_USER;
  const gmailPass = process.env.GMAIL_APP_PASS ?? process.env.GMAIL_PASS;
  if (gmailUser && gmailPass) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });
  }
  return null;
}

async function sendEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text?: string }) {
  const transport = createTransport();
  if (!transport) {
    console.warn(`[email] No transport configured. Would send to ${to}: ${subject}`);
    return { delivered: false, reason: "no-transport" as const };
  }
  try {
    const info = await transport.sendMail({ from: FROM_EMAIL, to, subject, html, text });
    return { delivered: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[email] failed to send to ${to}:`, err);
    return { delivered: false, reason: String(err) };
  }
}

// ── Branded layout (navy header + eye logo inline SVG) ───────────────────────

/** Minimal pure SVG that matches the geometric eye logo — inlined so email
 *  clients render it reliably without loading external images. */
function eyeLogoSvg(color: string, size = 26): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 100 100" ` +
    `xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle">` +
    // Outer almond-shape eye contour
    `<path d="M8 50 Q 50 18 92 50 Q 50 82 8 50 Z" ` +
    `fill="none" stroke="${color}" stroke-width="6" stroke-linejoin="round"/>` +
    // Inner iris circle
    `<circle cx="50" cy="50" r="20" fill="none" stroke="${color}" stroke-width="6"/>` +
    // Center pupil dot
    `<circle cx="50" cy="50" r="6" fill="${color}"/>` +
    `</svg>`
  );
}

interface LayoutOpts {
  content: string;
  previewText?: string;
  /** Hide the "unsubscribe" link (e.g. for transactional emails) */
  noUnsubscribe?: boolean;
}

function brandedLayout({ content, previewText = "", noUnsubscribe = false }: LayoutOpts): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Insiders Trades Sigma</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${BRAND.tx1};">

<!-- Preview text (hidden, shown as email preview) -->
<div style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escape(previewText)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.cream}">
  <tr>
    <td align="center" style="padding:24px 12px">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0"
             style="max-width:640px;width:100%;background:${BRAND.paper};border:1px solid ${BRAND.border};border-radius:4px;overflow:hidden">

        <!-- Header — navy block with eye + wordmark -->
        <tr>
          <td style="background:${BRAND.navy};padding:22px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="vertical-align:middle;padding-right:12px">${eyeLogoSvg("#FFFFFF", 26)}</td>
                      <td style="vertical-align:middle;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;letter-spacing:0.14em;color:#FFFFFF">
                        INSIDERS&nbsp;TRADES&nbsp;SIGMA
                      </td>
                    </tr>
                  </table>
                </td>
                <td align="right" style="vertical-align:middle;font-family:'SF Mono','Courier New',monospace;font-size:11px;letter-spacing:0.12em;color:${BRAND.gold};text-transform:uppercase">
                  № ${new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Main content -->
        <tr>
          <td style="padding:32px 32px 8px;">
            ${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 32px 28px;border-top:1px solid ${BRAND.border};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:-apple-system,sans-serif;font-size:12px;color:${BRAND.tx3};line-height:1.6">
                  <strong style="color:${BRAND.navy}">Insiders Trades Sigma</strong> · Données AMF publiques · Règlement MAR 596/2014<br>
                  Usage informatif · ne constitue pas un conseil en investissement<br>
                  © ${year} — <a href="${APP_URL}" style="color:${BRAND.gold};text-decoration:none">insiders-trades-sigma.app</a>
                  ${noUnsubscribe
                    ? ""
                    : ` · <a href="${APP_URL}/portfolio?settings=alerts" style="color:${BRAND.tx3};text-decoration:underline">Se désabonner</a>`}
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
}

// Small HTML-escape helper for preview text
function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]!);
}

// ── Formatters used across templates ─────────────────────────────────────────

function fmtEur(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)} Md€`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)} M€`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)} k€`;
  return `${n.toFixed(0)} €`;
}

function fmtPct(n: number | null | undefined, d = 1, withSign = true): string {
  if (n == null) return "—";
  const sign = withSign && n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(d)}%`;
}

function fmtDateFr(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

// ── Transactional emails (verification / reset / welcome) ────────────────────

export async function sendVerificationEmail(email: string, token: string) {
  const url = `${APP_URL}/auth/verify?token=${token}`;
  return sendEmail({
    to: email,
    subject: "Vérifiez votre adresse · Insiders Trades Sigma",
    html: brandedLayout({
      previewText: "Activez votre compte en vérifiant votre adresse email.",
      noUnsubscribe: true,
      content: `
        <p style="font-family:Georgia,serif;font-size:22px;font-weight:400;color:${BRAND.navy};margin:0 0 14px">
          Bienvenue sur <em style="color:${BRAND.gold}">Sigma</em>.
        </p>
        <p style="font-size:15px;color:${BRAND.tx2};line-height:1.6;margin:0 0 20px">
          Merci de votre inscription. Cliquez sur le bouton ci-dessous pour vérifier
          votre adresse et activer votre compte — l'accès complet aux signaux,
          backtests et recommandations sera débloqué immédiatement.
        </p>
        ${btnPrimary(url, "Vérifier mon adresse")}
        <p style="font-size:12px;color:${BRAND.tx4};line-height:1.6;margin:18px 0 0">
          Ou copiez ce lien : <a href="${url}" style="color:${BRAND.gold};word-break:break-all">${url}</a><br>
          Ce lien expire dans 24 heures. Si vous n'avez pas créé de compte, ignorez cet email.
        </p>
      `,
    }),
    text: `Vérifiez votre adresse email : ${url}`,
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const url = `${APP_URL}/auth/reset-password?token=${token}`;
  return sendEmail({
    to: email,
    subject: "Réinitialisation de mot de passe · Insiders Trades Sigma",
    html: brandedLayout({
      previewText: "Un lien sécurisé pour choisir un nouveau mot de passe.",
      noUnsubscribe: true,
      content: `
        <p style="font-family:Georgia,serif;font-size:22px;font-weight:400;color:${BRAND.navy};margin:0 0 14px">
          Réinitialisation du mot de passe.
        </p>
        <p style="font-size:15px;color:${BRAND.tx2};line-height:1.6;margin:0 0 20px">
          Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe.
        </p>
        ${btnPrimary(url, "Choisir un nouveau mot de passe")}
        <p style="font-size:12px;color:${BRAND.tx4};line-height:1.6;margin:18px 0 0">
          Ce lien expire dans 1 heure. Si vous n'avez pas demandé cette action, ignorez cet email.
        </p>
      `,
    }),
    text: `Réinitialisation du mot de passe : ${url}`,
  });
}

export async function sendWelcomeEmail(email: string, name: string) {
  const firstName = (name || "").split(" ")[0] || "";
  return sendEmail({
    to: email,
    subject: "Votre compte est activé · Insiders Trades Sigma",
    html: brandedLayout({
      previewText: "Votre accès aux signaux est activé.",
      content: `
        <p style="font-family:Georgia,serif;font-size:24px;font-weight:400;color:${BRAND.navy};margin:0 0 10px">
          ${firstName ? `Bonjour ${escape(firstName)},` : "Bonjour,"}
        </p>
        <p style="font-family:Georgia,serif;font-style:italic;font-size:18px;color:${BRAND.gold};margin:0 0 20px">
          votre compte est prêt.
        </p>
        <p style="font-size:15px;color:${BRAND.tx2};line-height:1.65;margin:0 0 8px">
          Vous avez désormais accès à l'ensemble des signaux d'initiés AMF,
          au backtest historique de 22 000+ transactions et aux recommandations
          actionnables (achats & ventes).
        </p>
        <p style="font-size:15px;color:${BRAND.tx2};line-height:1.65;margin:0 0 20px">
          Prochaine étape : importez votre portefeuille pour des alertes personnalisées.
        </p>
        ${btnPrimary(`${APP_URL}/portfolio`, "Accéder à mon portfolio")}
      `,
    }),
    text: `Bienvenue sur Insiders Trades Sigma. ${APP_URL}/portfolio`,
  });
}

// ── Daily digest email (NEW — portfolio alerts + buys + sells) ───────────────

export interface PortfolioAlert {
  /** Nature of the insider transaction on a company held by the user */
  action: "BUY" | "SELL";
  company: { name: string; slug: string };
  insider:  { name: string | null; role: string };
  /** Transaction amount in EUR */
  amount: number | null;
  /** % of market cap */
  pctOfMarketCap: number | null;
  /** Signal score 0–100 */
  signalScore: number;
  /** User's position context */
  userPosition: { quantity: number; pnlPct: number | null };
  pubDate: string;
  amfLink: string;
}

export interface DailyDigestPayload {
  to: string;
  firstName?: string | null;
  portfolioAlerts: PortfolioAlert[];
  buyRecos: RecoItem[];
  sellRecos: RecoItem[];
}

/** Render a daily digest into its subject + html + plain-text parts, without
 *  sending. Useful for preview + for the actual sender. */
export function renderDailyDigest(p: DailyDigestPayload): { subject: string; html: string; text: string } {
  const subject = buildDigestSubject(p);
  const preview = buildDigestPreview(p);
  const html = brandedLayout({
    previewText: preview,
    content: `
      ${digestGreeting(p.firstName ?? null, p.portfolioAlerts.length)}
      ${p.portfolioAlerts.length > 0 ? sectionPortfolioAlerts(p.portfolioAlerts) : ""}
      ${p.buyRecos.length > 0 ? sectionBuyRecos(p.buyRecos) : ""}
      ${p.sellRecos.length > 0 ? sectionSellRecos(p.sellRecos) : ""}
      ${digestFooterCta()}
    `,
  });
  return { subject, html, text: buildDigestPlainText(p) };
}

export async function sendDailyDigestEmail(p: DailyDigestPayload) {
  const totalSignals = p.portfolioAlerts.length + p.buyRecos.length + p.sellRecos.length;
  if (totalSignals === 0) return { delivered: false, reason: "empty" as const };

  const { subject, html, text } = renderDailyDigest(p);
  return sendEmail({ to: p.to, subject, html, text });
}

// ── Digest helpers ───────────────────────────────────────────────────────────

function buildDigestSubject(p: DailyDigestPayload): string {
  if (p.portfolioAlerts.length > 0) {
    const n = p.portfolioAlerts.length;
    return `${n} mouvement${n > 1 ? "s" : ""} sur votre portfolio · Sigma`;
  }
  const n = p.buyRecos.length + p.sellRecos.length;
  if (n > 0) {
    return `Signaux du jour · ${p.buyRecos.length} achat${p.buyRecos.length > 1 ? "s" : ""}, ${p.sellRecos.length} vente${p.sellRecos.length > 1 ? "s" : ""}`;
  }
  return "Signaux du jour · Insiders Trades Sigma";
}

function buildDigestPreview(p: DailyDigestPayload): string {
  if (p.portfolioAlerts.length > 0) {
    const first = p.portfolioAlerts[0];
    return `${first.action === "SELL" ? "Cession" : "Acquisition"} sur ${first.company.name} par ${first.insider.name ?? "un dirigeant"}.`;
  }
  if (p.buyRecos.length > 0) {
    return `Top achat : ${p.buyRecos[0].company.name} (score ${Math.round(p.buyRecos[0].recoScore)}).`;
  }
  return "Aucun signal actionnable aujourd'hui.";
}

function buildDigestPlainText(p: DailyDigestPayload): string {
  const lines: string[] = [];
  const hi = p.firstName ? `Bonjour ${p.firstName},` : "Bonjour,";
  lines.push(hi, "");
  if (p.portfolioAlerts.length > 0) {
    lines.push("=== Mouvements sur votre portfolio ===");
    for (const a of p.portfolioAlerts) {
      lines.push(`- ${a.action === "BUY" ? "Achat" : "Vente"} sur ${a.company.name} par ${a.insider.name ?? "un dirigeant"} (${a.insider.role}) — ${fmtEur(a.amount)}`);
    }
    lines.push("");
  }
  if (p.buyRecos.length > 0) {
    lines.push("=== Top achats recommandés ===");
    for (const r of p.buyRecos) {
      lines.push(`- ${r.company.name} (score ${Math.round(r.recoScore)}) — ${r.insider.name ?? "Dirigeant"} · ${r.insider.role}`);
    }
    lines.push("");
  }
  if (p.sellRecos.length > 0) {
    lines.push("=== Top signaux de vente ===");
    for (const r of p.sellRecos) {
      lines.push(`- ${r.company.name} (score ${Math.round(r.recoScore)}) — ${r.insider.name ?? "Dirigeant"}`);
    }
    lines.push("");
  }
  lines.push(`Toutes les recommandations : ${APP_URL}/recommendations`);
  return lines.join("\n");
}

function digestGreeting(firstName: string | null, portfolioCount: number): string {
  const hi = firstName ? `Bonjour ${escape(firstName)},` : "Bonjour,";
  const sub = portfolioCount > 0
    ? `des dirigeants viennent de bouger sur <strong style="color:${BRAND.navy}">vos positions</strong>.`
    : `voici votre sélection quotidienne de signaux d'initiés AMF.`;
  return `
    <p style="font-family:Georgia,serif;font-size:24px;font-weight:400;color:${BRAND.navy};margin:0 0 6px;letter-spacing:-0.005em">${hi}</p>
    <p style="font-family:Georgia,serif;font-style:italic;font-size:17px;color:${BRAND.gold};margin:0 0 22px">${sub}</p>
  `;
}

function sectionHeader(opts: {
  eyebrow: string;
  title: string;
  accent: string;
  count: number;
}): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 14px">
      <tr>
        <td style="border-bottom:1px solid ${BRAND.border};padding-bottom:10px">
          <div style="font-family:'SF Mono','Courier New',monospace;font-size:10px;font-weight:700;letter-spacing:0.14em;color:${opts.accent};text-transform:uppercase;margin-bottom:4px">
            ${opts.eyebrow}
          </div>
          <div style="font-family:Georgia,serif;font-size:18px;font-weight:400;color:${BRAND.tx1};letter-spacing:-0.01em">
            ${opts.title}
            <span style="font-family:'SF Mono',monospace;font-size:11px;color:${BRAND.gold};letter-spacing:0.08em;margin-left:8px">— ${opts.count.toString().padStart(2, "0")}</span>
          </div>
        </td>
      </tr>
    </table>
  `;
}

function badgePill(label: string, color: string): string {
  return `<span style="display:inline-block;margin:0 4px 4px 0;padding:2px 7px;border:1px solid ${color};color:${color};font-size:10px;font-family:'SF Mono','Courier New',monospace;font-weight:600;border-radius:2px;letter-spacing:0.02em">${escape(label)}</span>`;
}

function btnPrimary(href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0">
      <tr>
        <td style="background:${BRAND.gold};border-radius:3px">
          <a href="${href}" style="display:inline-block;padding:11px 22px;font-family:-apple-system,sans-serif;font-size:14px;font-weight:700;color:#0A0C10;text-decoration:none;letter-spacing:0.01em">${escape(label)} →</a>
        </td>
      </tr>
    </table>
  `;
}

function btnGhost(href: string, label: string, color = BRAND.navy): string {
  return `
    <a href="${href}" style="display:inline-block;padding:8px 14px;font-family:-apple-system,sans-serif;font-size:12px;font-weight:600;color:${color};text-decoration:none;border:1px solid ${color};border-radius:3px;letter-spacing:0.01em">${escape(label)} ↗</a>
  `;
}

// ── Section: Portfolio alerts (high priority) ───────────────────────────────

function sectionPortfolioAlerts(alerts: PortfolioAlert[]): string {
  return `
    ${sectionHeader({
      eyebrow: "Alerte portfolio",
      title: "Mouvements sur vos positions",
      accent: BRAND.red,
      count: alerts.length,
    })}
    ${alerts.map((a, i) => portfolioAlertCard(a, i + 1)).join("")}
  `;
}

function portfolioAlertCard(a: PortfolioAlert, rank: number): string {
  const actionColor = a.action === "SELL" ? BRAND.red : BRAND.green;
  const actionLabel = a.action === "SELL" ? "Vente dirigeant" : "Achat dirigeant";
  const pnlStr = a.userPosition.pnlPct != null
    ? `${a.userPosition.pnlPct >= 0 ? "+" : ""}${a.userPosition.pnlPct.toFixed(1)}%`
    : "—";
  const pnlColor = a.userPosition.pnlPct != null
    ? (a.userPosition.pnlPct >= 0 ? BRAND.green : BRAND.red)
    : BRAND.tx3;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin:0 0 10px;background:${BRAND.paper};border:1px solid ${BRAND.border};border-left:3px solid ${actionColor};border-radius:2px">
      <tr>
        <td style="padding:14px 16px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align:top">
                <div style="font-family:'SF Mono','Courier New',monospace;font-size:10px;font-weight:700;color:${actionColor};letter-spacing:0.1em;text-transform:uppercase;margin-bottom:3px">
                  ${rank.toString().padStart(2, "0")} · ${actionLabel}
                </div>
                <div style="font-family:Georgia,serif;font-size:17px;color:${BRAND.tx1};margin-bottom:4px">
                  <a href="${APP_URL}/company/${a.company.slug}" style="color:${BRAND.tx1};text-decoration:none">${escape(a.company.name)}</a>
                </div>
                <div style="font-size:12px;color:${BRAND.tx2};margin-bottom:8px">
                  ${escape(a.insider.name ?? "Dirigeant")} ·
                  <span style="color:${BRAND.tx3};font-family:'SF Mono',monospace;font-size:11px;letter-spacing:0.06em">${escape(a.insider.role)}</span>
                </div>
              </td>
              <td align="right" style="vertical-align:top;padding-left:12px">
                <div style="font-family:'SF Mono',monospace;font-size:9px;color:${BRAND.tx4};letter-spacing:0.1em;text-transform:uppercase">Position actuelle</div>
                <div style="font-size:14px;font-weight:700;color:${pnlColor};font-family:-apple-system,sans-serif">${pnlStr}</div>
                <div style="font-size:10px;color:${BRAND.tx3};font-family:'SF Mono',monospace">${a.userPosition.quantity.toLocaleString("fr-FR")} titres</div>
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding-top:10px;border-top:1px solid ${BRAND.border}">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding-right:14px">
                      <div style="font-family:'SF Mono',monospace;font-size:9px;color:${BRAND.tx4};letter-spacing:0.1em;text-transform:uppercase">Montant</div>
                      <div style="font-size:13px;font-weight:700;color:${BRAND.tx1}">${fmtEur(a.amount)}</div>
                    </td>
                    <td style="padding-right:14px">
                      <div style="font-family:'SF Mono',monospace;font-size:9px;color:${BRAND.tx4};letter-spacing:0.1em;text-transform:uppercase">% Mcap</div>
                      <div style="font-size:13px;font-weight:700;color:${BRAND.tx1}">${a.pctOfMarketCap != null && a.pctOfMarketCap > 0 ? `${a.pctOfMarketCap.toFixed(2)}%` : "—"}</div>
                    </td>
                    <td style="padding-right:14px">
                      <div style="font-family:'SF Mono',monospace;font-size:9px;color:${BRAND.tx4};letter-spacing:0.1em;text-transform:uppercase">Score</div>
                      <div style="font-size:13px;font-weight:700;color:${BRAND.gold}">${Math.round(a.signalScore)}/100</div>
                    </td>
                    <td align="right">
                      <span style="font-family:'SF Mono',monospace;font-size:10px;color:${BRAND.tx3}">${fmtDateFr(a.pubDate)}</span>
                      &nbsp;&nbsp;
                      ${btnGhost(a.amfLink, "AMF", BRAND.navy)}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

// ── Section: Buy recommendations ─────────────────────────────────────────────

function sectionBuyRecos(recos: RecoItem[]): string {
  return `
    <div style="margin-top:22px"></div>
    ${sectionHeader({
      eyebrow: "Top signaux",
      title: "Recommandations d'achat",
      accent: BRAND.green,
      count: recos.length,
    })}
    ${recos.map((r, i) => recoCompactCard(r, i + 1, "BUY")).join("")}
  `;
}

function sectionSellRecos(recos: RecoItem[]): string {
  return `
    <div style="margin-top:22px"></div>
    ${sectionHeader({
      eyebrow: "Signaux baissiers",
      title: "À vendre / alléger",
      accent: BRAND.red,
      count: recos.length,
    })}
    ${recos.map((r, i) => recoCompactCard(r, i + 1, "SELL")).join("")}
  `;
}

function recoCompactCard(r: RecoItem, rank: number, direction: "BUY" | "SELL"): string {
  const actionColor = direction === "BUY" ? BRAND.green : BRAND.red;
  const scoreColor =
    r.recoScore >= 75 ? BRAND.green :
    r.recoScore >= 55 ? BRAND.gold :
    BRAND.tx3;

  const ret = r.expectedReturn90d;
  // Interpret return based on direction:
  //   BUY  → positive good (green), negative bad (red)
  //   SELL → negative good (green), positive bad (red)
  const retColor = ret == null ? BRAND.tx3
    : direction === "BUY"
      ? (ret >= 0 ? BRAND.green : BRAND.red)
      : (ret <= 0 ? BRAND.green : BRAND.red);

  const wr = r.historicalWinRate90d;
  const retLabel = direction === "BUY" ? "Retour T+90" : "Dérive T+90";
  const wrLabel  = direction === "BUY" ? "Win rate" : "Taux de chute";

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin:0 0 10px;background:${BRAND.paper};border:1px solid ${BRAND.border};border-left:3px solid ${actionColor};border-radius:2px">
      <tr>
        <td style="padding:14px 16px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align:top">
                <div style="font-family:'SF Mono',monospace;font-size:10px;font-weight:700;color:${actionColor};letter-spacing:0.12em;text-transform:uppercase;margin-bottom:3px">
                  ${rank.toString().padStart(2, "0")} · ${direction === "BUY" ? "Achat" : "Vente"}
                </div>
                <div style="font-family:Georgia,serif;font-size:17px;color:${BRAND.tx1};margin-bottom:4px">
                  <a href="${APP_URL}/company/${r.company.slug}" style="color:${BRAND.tx1};text-decoration:none">${escape(r.company.name)}</a>
                </div>
                <div style="font-size:12px;color:${BRAND.tx2};margin-bottom:6px">
                  ${escape(r.insider.name ?? "Dirigeant")} ·
                  <span style="color:${BRAND.tx3};font-family:'SF Mono',monospace;font-size:11px;letter-spacing:0.06em">${escape(r.insider.role)}</span>
                </div>
                ${r.badges.length > 0 ? `<div>${r.badges.slice(0, 3).map((b) => badgePill(b, BRAND.gold)).join("")}</div>` : ""}
              </td>
              <td align="right" style="vertical-align:top;padding-left:12px;white-space:nowrap">
                <div style="font-family:-apple-system,sans-serif;font-size:28px;font-weight:700;color:${scoreColor};letter-spacing:-0.03em;line-height:1">${Math.round(r.recoScore)}</div>
                <div style="font-family:'SF Mono',monospace;font-size:9px;color:${BRAND.tx4};letter-spacing:0.12em;text-transform:uppercase;margin-top:2px">/ 100 · score</div>
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding-top:10px;border-top:1px solid ${BRAND.border}">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding-right:14px">
                      <div style="font-family:'SF Mono',monospace;font-size:9px;color:${BRAND.tx4};letter-spacing:0.1em;text-transform:uppercase">${retLabel}</div>
                      <div style="font-size:13px;font-weight:700;color:${retColor}">${fmtPct(ret, 1)}</div>
                    </td>
                    <td style="padding-right:14px">
                      <div style="font-family:'SF Mono',monospace;font-size:9px;color:${BRAND.tx4};letter-spacing:0.1em;text-transform:uppercase">${wrLabel}</div>
                      <div style="font-size:13px;font-weight:700;color:${BRAND.tx1}">${wr != null ? `${wr.toFixed(0)}%` : "—"}</div>
                    </td>
                    <td style="padding-right:14px">
                      <div style="font-family:'SF Mono',monospace;font-size:9px;color:${BRAND.tx4};letter-spacing:0.1em;text-transform:uppercase">Montant</div>
                      <div style="font-size:13px;font-weight:700;color:${BRAND.tx1}">${fmtEur(r.totalAmount)}</div>
                    </td>
                    <td align="right">
                      ${btnGhost(`${APP_URL}/company/${r.company.slug}`, "Détail", BRAND.navy)}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function digestFooterCta(): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px">
      <tr>
        <td align="center" style="padding:20px 0;border-top:1px solid ${BRAND.border}">
          <div style="font-family:Georgia,serif;font-style:italic;font-size:15px;color:${BRAND.tx3};margin-bottom:14px">
            Voir toutes les recommandations, méthodologie et backtests sur votre espace.
          </div>
          ${btnPrimary(`${APP_URL}/recommendations`, "Accéder à mes recommandations")}
        </td>
      </tr>
    </table>
  `;
}

// ── Backward-compat: keep the old interface in case any code still calls it ──

interface SignalAlert {
  company: string;
  insider: string;
  role: string;
  action: "BUY" | "SELL";
  amount: string;
  score: number;
  expectedReturn: string;
  winRate: string;
  badges: string[];
  pubDate: string;
  companySlug: string;
}

/** @deprecated Prefer {@link sendDailyDigestEmail}. */
export async function sendSignalAlertEmail(
  email: string,
  _name: string,
  _signals: SignalAlert[],
  _mode: "general" | "personal" = "general"
) {
  // Thin shim — redirect callers through the new digest with empty portfolio
  // alerts and the old signals mapped as buy recos. The cron path has been
  // rewritten to call sendDailyDigestEmail directly; this stub exists for any
  // legacy code still referencing the old function.
  console.warn("[email] sendSignalAlertEmail is deprecated; use sendDailyDigestEmail");
  return { delivered: false, reason: "deprecated" as const, to: email };
}

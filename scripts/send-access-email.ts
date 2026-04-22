/**
 * Send access credentials email via Gmail SMTP.
 *   npx tsx scripts/send-access-email.ts [to]
 */
import "dotenv/config";
import fs from "fs";
import nodemailer from "nodemailer";

// Load .env.local
try {
  const local = fs.readFileSync(".env.local", "utf-8");
  for (const line of local.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const TO   = process.argv[2] || "simon.azoulay.pro@gmail.com";
const APP  = "https://insiders-trades-sigma.vercel.app";
const PITCH = `${APP}/pitch`;

const BRAND = {
  navy:     "#112A46",
  gold:     "#B8955A",
  green:    "#009E62",
  paper:    "#FDFBF7",
  cream:    "#F4F1EC",
  ink:      "#0A0C10",
  tx2:      "#3D3428",
  tx3:      "#7A6E5E",
  tx4:      "#AA9E8E",
  border:   "rgba(17,42,70,0.10)",
};

function eyeSvg() {
  return (
    `<svg width="26" height="26" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle">` +
    `<path d="M8 50 Q 50 18 92 50 Q 50 82 8 50 Z" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round"/>` +
    `<circle cx="50" cy="50" r="20" fill="none" stroke="#FFFFFF" stroke-width="6"/>` +
    `<circle cx="50" cy="50" r="6" fill="#FFFFFF"/>` +
    `</svg>`
  );
}

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Accès Insiders Trades Sigma</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${BRAND.ink}">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.cream}">
  <tr>
    <td align="center" style="padding:24px 12px">
      <table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0"
             style="max-width:620px;width:100%;background:${BRAND.paper};border:1px solid ${BRAND.border};border-radius:4px;overflow:hidden">

        <!-- Header -->
        <tr>
          <td style="background:${BRAND.navy};padding:22px 28px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="vertical-align:middle;padding-right:12px">${eyeSvg()}</td>
                      <td style="vertical-align:middle;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;letter-spacing:0.14em;color:#FFFFFF">
                        INSIDERS&nbsp;TRADES&nbsp;SIGMA
                      </td>
                    </tr>
                  </table>
                </td>
                <td align="right" style="vertical-align:middle;font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.12em;color:${BRAND.gold};text-transform:uppercase">
                  Accès Beta
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 32px 8px">

            <p style="font-family:Georgia,serif;font-size:24px;font-weight:400;color:${BRAND.navy};margin:0 0 6px;letter-spacing:-0.005em">
              Voici ton accès Sigma.
            </p>
            <p style="font-family:Georgia,serif;font-style:italic;font-size:17px;color:${BRAND.gold};margin:0 0 24px">
              La plateforme des signaux d'initiés AMF.
            </p>

            <!-- Credentials block -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="margin:0 0 22px;background:#F0EDE8;border:1px solid ${BRAND.border};border-left:3px solid ${BRAND.gold};border-radius:2px">
              <tr>
                <td style="padding:16px 20px">
                  <div style="font-family:'Courier New',monospace;font-size:10px;font-weight:700;letter-spacing:0.14em;color:${BRAND.gold};text-transform:uppercase;margin-bottom:10px">
                    Identifiants d'accès
                  </div>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="padding:4px 16px 4px 0;font-family:'Courier New',monospace;font-size:11px;color:${BRAND.tx3};text-transform:uppercase;letter-spacing:0.1em;white-space:nowrap">Adresse</td>
                      <td style="padding:4px 0;font-family:'Courier New',monospace;font-size:14px;font-weight:700;color:${BRAND.ink}">simon.azoulay.pro@gmail.com</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 16px 4px 0;font-family:'Courier New',monospace;font-size:11px;color:${BRAND.tx3};text-transform:uppercase;letter-spacing:0.1em;white-space:nowrap">Mot de passe</td>
                      <td style="padding:4px 0;font-family:'Courier New',monospace;font-size:14px;font-weight:700;color:${BRAND.ink}">Sigma2026!</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA buttons -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px">
              <tr>
                <td style="background:${BRAND.gold};border-radius:3px;margin-right:10px">
                  <a href="${APP}" style="display:inline-block;padding:11px 22px;font-family:-apple-system,sans-serif;font-size:14px;font-weight:700;color:#0A0C10;text-decoration:none;letter-spacing:0.01em">Accéder à la plateforme →</a>
                </td>
                <td style="width:12px"></td>
                <td style="border:1px solid ${BRAND.navy};border-radius:3px">
                  <a href="${PITCH}" style="display:inline-block;padding:10px 20px;font-family:-apple-system,sans-serif;font-size:14px;font-weight:600;color:${BRAND.navy};text-decoration:none;letter-spacing:0.01em">Voir le Pitch ↗</a>
                </td>
              </tr>
            </table>

            <p style="font-size:14px;color:${BRAND.tx2};line-height:1.7;margin:24px 0 8px">
              La plateforme surveille en temps réel les déclarations de transactions de dirigeants publiées par l'AMF
              (règlement MAR), les analyse via notre moteur de scoring propriétaire et te signale les configurations 
              historiquement les plus performantes.
            </p>

            <!-- Feature pills -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 20px">
              <tr>
                <td>
                  <span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;background:rgba(0,158,98,0.08);border:1px solid rgba(0,158,98,0.22);color:${BRAND.green};font-size:11px;font-family:'Courier New',monospace;font-weight:700;border-radius:2px;letter-spacing:0.04em">25 000+ déclarations AMF</span>
                  <span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;background:rgba(184,149,90,0.08);border:1px solid rgba(184,149,90,0.22);color:${BRAND.gold};font-size:11px;font-family:'Courier New',monospace;font-weight:700;border-radius:2px;letter-spacing:0.04em">Backtest 4 ans</span>
                  <span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;background:rgba(17,42,70,0.06);border:1px solid rgba(17,42,70,0.16);color:${BRAND.navy};font-size:11px;font-family:'Courier New',monospace;font-weight:700;border-radius:2px;letter-spacing:0.04em">Signaux T+90 · Win rate 74%</span>
                  <span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;background:rgba(17,42,70,0.06);border:1px solid rgba(17,42,70,0.16);color:${BRAND.navy};font-size:11px;font-family:'Courier New',monospace;font-weight:700;border-radius:2px;letter-spacing:0.04em">Alertes portfolio</span>
                </td>
              </tr>
            </table>

            <p style="font-size:12px;color:${BRAND.tx3};line-height:1.6;margin:0 0 6px">
              Usage informatif · ne constitue pas un conseil en investissement.
            </p>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px 24px;border-top:1px solid ${BRAND.border}">
            <p style="font-size:12px;color:${BRAND.tx3};margin:0;line-height:1.6">
              <strong style="color:${BRAND.navy}">Insiders Trades Sigma</strong> · Données AMF publiques · Règlement MAR 596/2014<br>
              © ${new Date().getFullYear()} · <a href="${APP}" style="color:${BRAND.gold};text-decoration:none">insiders-trades-sigma.vercel.app</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

const text = `Insiders Trades Sigma · Accès Beta

Identifiants :
  Email    : simon.azoulay.pro@gmail.com
  Password : Sigma2026!

Plateforme : ${APP}
Le Pitch   : ${PITCH}

25 000+ déclarations AMF · Backtest 4 ans · Win rate 74% T+90 · Alertes portfolio

Usage informatif · ne constitue pas un conseil en investissement.
© ${new Date().getFullYear()} Insiders Trades Sigma`;

(async () => {
  const user = process.env.GMAIL_APP_USER ?? process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASS ?? process.env.GMAIL_PASS;
  if (!user || !pass) {
    console.error("❌ GMAIL_APP_USER / GMAIL_APP_PASS manquant dans .env.local");
    process.exit(1);
  }

  const tp = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  const info = await tp.sendMail({
    from: `Insiders Trades Sigma <${user}>`,
    to: TO,
    subject: "Ton accès Sigma + Le Pitch investisseur",
    html,
    text,
  });
  console.log("✅ Email envoyé :", info.messageId);
  console.log("   Destinataire :", TO);
})();

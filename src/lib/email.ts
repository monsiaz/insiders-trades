import nodemailer from "nodemailer";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://insiders-trades-sigma.vercel.app";
const FROM_EMAIL = process.env.EMAIL_FROM ?? "InsiderTrades <noreply@insiders-trades.fr>";

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
  // Gmail shorthand
  if (process.env.GMAIL_USER) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASS,
      },
    });
  }
  // Fallback: ethereal.email (dev testing)
  return null;
}

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const transport = createTransport();
  if (!transport) {
    console.warn(`[email] No transport configured. Would send to ${to}: ${subject}`);
    return;
  }
  await transport.sendMail({ from: FROM_EMAIL, to, subject, html });
}

// ── Email templates ──────────────────────────────────────────────────────────

function layout(content: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a1f;color:#e2e8f0;margin:0;padding:0}
  .wrap{max-width:520px;margin:40px auto;padding:32px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px}
  .logo{font-size:18px;font-weight:700;color:#fff;margin-bottom:24px}
  .logo span{color:#818cf8}.btn{display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;margin:20px 0}
  p{color:#94a3b8;line-height:1.7;font-size:14px}small{color:#475569;font-size:12px}</style>
  </head><body><div class="wrap">
  <div class="logo">Insider<span>Trades</span> · AMF</div>
  ${content}
  <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:24px 0">
  <small>InsiderTrades · Données AMF France · Réglementation MAR</small>
  </div></body></html>`;
}

export async function sendVerificationEmail(email: string, token: string) {
  const url = `${APP_URL}/auth/verify?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Vérifiez votre adresse email · InsiderTrades",
    html: layout(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 8px">Bienvenue sur InsiderTrades !</h2>
      <p>Merci de vous être inscrit. Cliquez sur le bouton ci-dessous pour vérifier votre adresse email et activer votre compte.</p>
      <a href="${url}" class="btn">Vérifier mon email</a>
      <p>Ou copiez ce lien dans votre navigateur :<br><small style="color:#6366f1;word-break:break-all">${url}</small></p>
      <small>Ce lien expire dans 24 heures. Si vous n'avez pas créé de compte, ignorez cet email.</small>
    `),
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const url = `${APP_URL}/auth/reset-password?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Réinitialisation de mot de passe · InsiderTrades",
    html: layout(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 8px">Réinitialisation du mot de passe</h2>
      <p>Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.</p>
      <a href="${url}" class="btn">Réinitialiser mon mot de passe</a>
      <p>Ou copiez ce lien :<br><small style="color:#6366f1;word-break:break-all">${url}</small></p>
      <small>Ce lien expire dans 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.</small>
    `),
  });
}

// ── Signal alert email ────────────────────────────────────────────────────────

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

export async function sendSignalAlertEmail(
  email: string,
  name: string,
  signals: SignalAlert[],
  mode: "general" | "personal" = "general"
) {
  if (signals.length === 0) return;

  const signalCards = signals
    .map(
      (s) => `
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-top:2px solid ${s.action === "BUY" ? "#00C896" : "#FF3D5A"};border-radius:12px;padding:16px;margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div>
          <strong style="color:#fff;font-size:15px">${s.company}</strong>
          <span style="margin-left:8px;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:${s.action === "BUY" ? "rgba(0,200,150,0.15)" : "rgba(255,61,90,0.15)"};color:${s.action === "BUY" ? "#00C896" : "#FF3D5A"}">${s.action === "BUY" ? "▲ Achat" : "▼ Vente"}</span>
        </div>
        <div style="width:38px;height:38px;border-radius:50%;border:3px solid ${s.score >= 75 ? "#00C896" : s.score >= 55 ? "#F59E0B" : "#FF3D5A"};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:${s.score >= 75 ? "#00C896" : s.score >= 55 ? "#F59E0B" : "#FF3D5A"}">
          ${Math.round(s.score)}
        </div>
      </div>
      <p style="color:#94a3b8;margin:0 0 8px;font-size:13px">${s.insider} · <span style="color:#818cf8">${s.role}</span></p>
      <div style="display:flex;gap:16px;margin-bottom:8px">
        <div><div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.06em">Montant</div><div style="font-size:14px;font-weight:700;color:#e2e8f0">${s.amount}</div></div>
        <div><div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.06em">Retour estimé T+90</div><div style="font-size:14px;font-weight:700;color:${s.action === "BUY" ? "#00C896" : "#FF3D5A"}">${s.expectedReturn}</div></div>
        <div><div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.06em">Win rate hist.</div><div style="font-size:14px;font-weight:700;color:#94a3b8">${s.winRate}</div></div>
      </div>
      ${s.badges.length > 0 ? `<div>${s.badges.map((b) => `<span style="display:inline-block;margin:0 4px 4px 0;padding:2px 8px;border-radius:4px;background:rgba(99,102,241,0.15);color:#818cf8;font-size:10px;font-weight:700">${b}</span>`).join("")}</div>` : ""}
      <div style="margin-top:10px"><a href="${APP_URL}/company/${s.companySlug}" style="color:#818cf8;font-size:12px;text-decoration:none">Voir la déclaration →</a></div>
    </div>
  `
    )
    .join("");

  const subject =
    mode === "personal"
      ? `${signals.length} nouveau${signals.length > 1 ? "x" : ""} signal${signals.length > 1 ? "s" : ""} pour votre portfolio · InsiderTrades`
      : `Top ${signals.length} signaux insiders du jour · InsiderTrades`;

  await sendEmail({
    to: email,
    subject,
    html: layout(`
      <h2 style="color:#fff;font-size:18px;margin:0 0 4px">
        ${mode === "personal" ? `Bonjour ${name || ""}, vos signaux du jour` : "Signaux insiders du jour"}
      </h2>
      <p style="color:#64748b;font-size:13px;margin:0 0 20px">
        ${mode === "personal"
          ? "Signaux filtrés selon votre portfolio et les meilleures performances historiques."
          : "Top signaux basés sur le score composite (signal AMF × backtest × récence × conviction)."}
      </p>
      ${signalCards}
      <a href="${APP_URL}/recommendations${mode === "personal" ? "?tab=personal" : ""}" class="btn">
        Voir toutes les recommandations →
      </a>
      <p style="margin-top:16px"><a href="${APP_URL}/api/alerts/preferences" style="color:#475569;font-size:11px">Se désabonner des alertes</a></p>
    `),
  });
}

export async function sendWelcomeEmail(email: string, name: string) {
  await sendEmail({
    to: email,
    subject: "Bienvenue sur InsiderTrades !",
    html: layout(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 8px">Votre compte est activé</h2>
      <p>Bonjour ${name || ""},</p>
      <p>Votre compte InsiderTrades est maintenant actif. Vous pouvez suivre vos positions, recevoir des alertes et analyser les trades des dirigeants AMF.</p>
      <a href="${APP_URL}/portfolio" class="btn">Accéder à mon portfolio</a>
    `),
  });
}

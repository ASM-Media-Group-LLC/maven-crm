// Email body for the Chatter Evaluator report.
//
// We build the full HTML on the client (instead of letting Apps Script
// do it) so that any visual tweak ships with the next Maven deploy —
// no Apps Script redeploy needed. The webhook payload carries
// `emailSubject` and `emailHtml` and the script just relays them to
// MailApp.sendEmail.

export interface EmailPayload {
  evaluationId: string;
  sessionId: string;
  createdAt: string;
  chatterName: string;
  modelName: string;
  examinerName: string;
  verdict: "apto" | "no_apto";
  verdictLabel: string;
  scorePct: number;
  badge: string;
  criteria: { label: string; status: "pass" | "partial" | "fail"; statusLabel: string }[];
  feedback: string;
  chatHistory: { role: string; type: string; content: string | null; price: number | null; timestamp: string; from: string }[];
  /** Base URL del frontend (ej. https://v3.test.maven-ai.me) — para
   *  construir el deeplink al workspace en el botón "Ver transcript" del
   *  email. El correo ya no incluye el chat completo; el receptor abre
   *  Maven directo en la sesión. */
  appUrl: string;
}

const COLORS = {
  bg:          "#f6f6f8",
  card:        "#ffffff",
  primary:     "#6d28d9",
  primaryDark: "#4338ca",
  green:       "#16a34a",
  red:         "#dc2626",
  amber:       "#d97706",
  text:        "#0f172a",
  muted:       "#64748b",
  border:      "#e2e8f0",
} as const;

const escape = (s: string): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const verdictColorOf = (verdict: string) =>
  verdict === "apto" ? COLORS.green : COLORS.red;

const badgeColorOf = (scorePct: number) =>
  scorePct >= 80 ? COLORS.green : scorePct >= 50 ? COLORS.amber : COLORS.red;

const statusColorOf = (status: "pass" | "partial" | "fail") =>
  status === "pass" ? COLORS.green : status === "partial" ? COLORS.amber : COLORS.red;

export const buildEmailSubject = (p: EmailPayload): string =>
  `[Maven] Evaluación — ${p.verdictLabel}: ${p.chatterName} (${p.scorePct}%)`;

export const buildEmailHtml = (p: EmailPayload): string => {
  const verdictColor = verdictColorOf(p.verdict);
  const badgeColor = badgeColorOf(p.scorePct);

  const criteriaRows = p.criteria
    .map((c) => {
      const color = statusColorOf(c.status);
      return (
        `<tr>` +
        `<td style="padding:10px 14px;border-bottom:1px solid ${COLORS.border};font-size:14px;color:${COLORS.text};">${escape(c.label)}</td>` +
        `<td style="padding:10px 14px;border-bottom:1px solid ${COLORS.border};text-align:right;">` +
        `<span style="display:inline-block;padding:3px 10px;border-radius:9999px;background:${color}1a;color:${color};font-size:12px;font-weight:600;">${escape(c.statusLabel)}</span>` +
        `</td>` +
        `</tr>`
      );
    })
    .join("");

  return (
    `<!DOCTYPE html><html><body style="margin:0;padding:0;background:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:${COLORS.text};">` +
      // Outer wrapper aligns the card to the LEFT of the reading pane.
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};padding:24px 0;"><tr><td align="left" style="padding-left:24px;">` +
        `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${COLORS.card};border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.04);">` +

          // Header
          `<tr><td style="background:linear-gradient(135deg,${COLORS.primary} 0%,${COLORS.primaryDark} 100%);padding:28px 32px;color:#ffffff;">` +
            `<div style="font-size:12px;font-weight:700;letter-spacing:1.5px;opacity:0.85;text-transform:uppercase;">Maven CRM · Chatter Evaluator</div>` +
            `<div style="font-size:22px;font-weight:700;margin-top:4px;line-height:1.3;">Evaluación recibida</div>` +
            `<div style="font-size:13px;margin-top:4px;opacity:0.85;">${escape(p.chatterName)} — perfil ${escape(p.modelName)}</div>` +
          `</td></tr>` +

          // Verdict + score
          `<tr><td style="padding:24px 32px;">` +
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
              `<td>` +
                `<div style="font-size:11px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:1px;font-weight:600;">Verdict</div>` +
                `<div style="font-size:26px;font-weight:700;color:${verdictColor};margin-top:2px;">${escape(p.verdictLabel)}</div>` +
              `</td>` +
              `<td align="right">` +
                `<div style="font-size:11px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:1px;font-weight:600;">Puntuación</div>` +
                `<div style="font-size:26px;font-weight:700;color:${COLORS.text};margin-top:2px;">${p.scorePct}%</div>` +
                `<div style="display:inline-block;margin-top:4px;padding:3px 10px;border-radius:9999px;background:${badgeColor}1a;color:${badgeColor};font-size:11px;font-weight:700;">${escape(p.badge || "")}</div>` +
              `</td>` +
            `</tr></table>` +
            `<div style="margin-top:18px;font-size:13px;color:${COLORS.muted};"><strong style="color:${COLORS.text};">Examiner:</strong> ${escape(p.examinerName)}</div>` +
          `</td></tr>` +

          // Criteria
          `<tr><td style="padding:0 32px 8px;">` +
            `<div style="font-size:11px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:8px;">Criterios</div>` +
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${COLORS.border};border-radius:10px;overflow:hidden;">` +
              criteriaRows +
            `</table>` +
          `</td></tr>` +

          // Feedback
          (p.feedback
            ? `<tr><td style="padding:18px 32px 8px;">` +
                `<div style="font-size:11px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:6px;">Feedback</div>` +
                `<div style="font-size:14px;line-height:1.55;color:${COLORS.text};background:${COLORS.bg};border-left:3px solid ${COLORS.primary};border-radius:6px;padding:12px 14px;white-space:pre-wrap;">${escape(p.feedback)}</div>` +
              `</td></tr>`
            : "") +

          // Transcript CTA — el correo ya no carga la transcripción
          // completa; el botón abre la sesión en el detalle de History
          // (read-only): la sesión ya está cerrada, así que tiene sentido
          // mandar al historial — el workspace es para chats vivos.
          (p.appUrl
            ? `<tr><td style="padding:18px 32px 8px;">` +
                `<a href="${escape(p.appUrl)}/chatter-evaluator/history/${escape(p.sessionId)}" target="_blank" style="display:inline-block;background:${COLORS.primary};color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:8px;">` +
                  `Ver transcript completo →` +
                `</a>` +
              `</td></tr>`
            : "") +

          // Footer
          `<tr><td style="padding:18px 32px 26px;border-top:1px solid ${COLORS.border};margin-top:8px;">` +
            `<div style="font-size:12px;color:${COLORS.muted};">${p.chatHistory.length} mensaje(s) intercambiados durante la sesión.</div>` +
          `</td></tr>` +

        `</table>` +
      `</td></tr></table>` +
    `</body></html>`
  );
};

// Correo del reporte del Chatter Evaluator (TS puro). Se arma en el SERVIDOR
// (send-notification-email, plantilla «evaluacion_chatter») con lo que la
// persona puede leer de la evaluación: desde el 05/10/2026 el navegador ya no
// manda HTML, solo «manda el reporte de esta evaluación». Hasta esa fecha vivía
// en frontend/src/pages/chatter-evaluator/emailTemplate.ts.

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
  /** Cuántos mensajes tuvo la sesión (el correo no lleva el chat). */
  mensajes: number;
  /** Base URL del frontend (ej. https://maven.asmtech.ai) — para
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
  `[Maven Chatters] Evaluación — ${p.verdictLabel}: ${p.chatterName} (${p.scorePct}%)`;

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
            `<div style="font-size:12px;color:${COLORS.muted};">${p.mensajes} mensaje(s) intercambiados durante la sesión.</div>` +
          `</td></tr>` +

        `</table>` +
      `</td></tr></table>` +
    `</body></html>`
  );
};

// ─── De las filas al payload (lo que antes armaba useChatterEvaluator.ts) ───
export interface DatosEvaluacionChatter {
  evaluacion: {
    id: string;
    created_at: string;
    examiner_name: string | null;
    verdict: string;
    score_pct: number | null;
    feedback: string | null;
    criteria_results: { label: string; status: string }[] | null;
  };
  sesion: { id: string; chatter_name: string | null; profile_id: string | null };
  perfil: { name: string | null } | null;
  mensajes: number;
}

const estadoCriterio = (s: string): "pass" | "partial" | "fail" =>
  s === "pass" ? "pass" : s === "partial" ? "partial" : "fail";

export function armarPayloadEvaluacionChatter(d: DatosEvaluacionChatter, appUrl: string): EmailPayload {
  const pct = Number(d.evaluacion.score_pct ?? 0);
  return {
    evaluationId: d.evaluacion.id,
    sessionId: d.sesion.id,
    createdAt: d.evaluacion.created_at,
    chatterName: d.sesion.chatter_name ?? "",
    modelName: d.perfil?.name ?? d.sesion.profile_id ?? "",
    examinerName: d.evaluacion.examiner_name ?? "(unnamed)",
    verdict: d.evaluacion.verdict === "apto" ? "apto" : "no_apto",
    verdictLabel: d.evaluacion.verdict === "apto" ? "APTO" : "NO APTO",
    scorePct: pct,
    badge: pct >= 80 ? "APROBADO" : pct >= 50 ? "A CRITERIO" : "NO APTO",
    criteria: (d.evaluacion.criteria_results ?? []).map((c) => {
      const status = estadoCriterio(c.status);
      return {
        label: c.label,
        status,
        statusLabel: status === "pass" ? "Cumple" : status === "partial" ? "Parcial" : "No cumple",
      };
    }),
    feedback: d.evaluacion.feedback ?? "",
    mensajes: d.mensajes,
    appUrl,
  };
}

// Email body para el reporte de QA de Closer (Agency QA).
//
// Mismo patrón que chatter-evaluator/emailTemplate.ts: el HTML se
// construye client-side (no en Apps Script) para que cualquier cambio
// visual viaje con el deploy normal de Maven sin re-deploy del GAS.
// El payload lleva `emailSubject` + `emailHtml` y el script los relayea
// directo a MailApp.sendEmail.
//
// Pattern type-discriminated: agregamos `type: "qa_call_analysis"` para
// que el AppScript pueda hacer dispatch — el mismo webhook sirve para
// chatter (`chatter_evaluation`) y para QA.

export interface QaEmailPayload {
  callId: string;
  createdAt: string;
  closerName: string;
  modelName: string;
  modelCategory: string | null;
  callDate: string;
  evaluatorName: string;
  overallScore: number;
  summary: string;
  callOutcome: string | null;
  callOutcomeLabel: string;
  callOutcomeReason: string | null;
  dimensions: { name: string; score: number; feedback: string }[];
  redFlags: { type: string; description: string; quote: string }[];
  keyMoments: { kind: "positivo" | "negativo"; quote: string; why: string }[];
  improvements: string[];
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

const scoreColorOf = (score: number) =>
  score >= 80 ? COLORS.green : score >= 50 ? COLORS.amber : COLORS.red;

const outcomeColorOf = (outcome: string | null) =>
  outcome === "cerro" ? COLORS.green :
  outcome === "no_cerro" ? COLORS.red : COLORS.amber;

export const labelForOutcome = (outcome: string | null): string => {
  if (outcome === "cerro") return "Cerró";
  if (outcome === "no_cerro") return "No cerró";
  if (outcome === "en_espera") return "En espera";
  return "Sin dato";
};

export const buildQaEmailSubject = (p: QaEmailPayload): string =>
  `[Maven QA] ${p.closerName} · ${p.modelName} · ${p.overallScore}/100 (${p.callOutcomeLabel})`;

export const buildQaEmailHtml = (p: QaEmailPayload): string => {
  const scoreColor = scoreColorOf(p.overallScore);
  const outcomeColor = outcomeColorOf(p.callOutcome);

  const dimensionRows = p.dimensions
    .map((d) => {
      // dimension scores son 0-10 en el shape del análisis.
      const pct = Math.max(0, Math.min(100, Math.round((d.score / 10) * 100)));
      const dColor = scoreColorOf(pct);
      return (
        `<tr>` +
        `<td style="padding:10px 14px;border-bottom:1px solid ${COLORS.border};font-size:13px;color:${COLORS.text};vertical-align:top;">` +
          `<div style="font-weight:600;">${escape(d.name)}</div>` +
          (d.feedback
            ? `<div style="font-size:12px;color:${COLORS.muted};margin-top:3px;line-height:1.4;">${escape(d.feedback)}</div>`
            : "") +
        `</td>` +
        `<td style="padding:10px 14px;border-bottom:1px solid ${COLORS.border};text-align:right;vertical-align:top;width:70px;">` +
          `<span style="display:inline-block;padding:3px 10px;border-radius:9999px;background:${dColor}1a;color:${dColor};font-size:12px;font-weight:700;">${d.score}/10</span>` +
        `</td>` +
        `</tr>`
      );
    })
    .join("");

  const redFlagsBlock = p.redFlags.length
    ? `<tr><td style="padding:18px 32px 8px;">` +
        `<div style="font-size:11px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:8px;">Red flags</div>` +
        p.redFlags
          .map(
            (f) =>
              `<div style="font-size:13px;background:${COLORS.red}0d;border-left:3px solid ${COLORS.red};border-radius:6px;padding:10px 12px;margin-bottom:8px;">` +
                `<div style="font-weight:600;color:${COLORS.text};">${escape(f.type)}</div>` +
                (f.description
                  ? `<div style="color:${COLORS.muted};margin-top:3px;line-height:1.4;">${escape(f.description)}</div>`
                  : "") +
                (f.quote
                  ? `<div style="font-style:italic;color:${COLORS.muted};margin-top:4px;font-size:12px;">"${escape(f.quote)}"</div>`
                  : "") +
              `</div>`,
          )
          .join("") +
      `</td></tr>`
    : "";

  const improvementsBlock = p.improvements.length
    ? `<tr><td style="padding:18px 32px 8px;">` +
        `<div style="font-size:11px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:8px;">Mejoras sugeridas</div>` +
        `<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.55;color:${COLORS.text};">` +
          p.improvements.map((m) => `<li style="margin-bottom:4px;">${escape(m)}</li>`).join("") +
        `</ul>` +
      `</td></tr>`
    : "";

  const keyMomentsBlock = p.keyMoments.length
    ? `<tr><td style="padding:18px 32px 8px;">` +
        `<div style="font-size:11px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:8px;">Momentos clave</div>` +
        p.keyMoments
          .map((k) => {
            const c = k.kind === "positivo" ? COLORS.green : COLORS.red;
            return (
              `<div style="font-size:13px;background:${c}0d;border-left:3px solid ${c};border-radius:6px;padding:10px 12px;margin-bottom:8px;">` +
                `<div style="font-style:italic;color:${COLORS.text};">"${escape(k.quote)}"</div>` +
                (k.why
                  ? `<div style="color:${COLORS.muted};margin-top:4px;font-size:12px;line-height:1.4;">${escape(k.why)}</div>`
                  : "") +
              `</div>`
            );
          })
          .join("") +
      `</td></tr>`
    : "";

  return (
    `<!DOCTYPE html><html><body style="margin:0;padding:0;background:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:${COLORS.text};">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};padding:24px 0;"><tr><td align="left" style="padding-left:24px;">` +
        `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${COLORS.card};border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.04);">` +

          // Header
          `<tr><td style="background:linear-gradient(135deg,${COLORS.primary} 0%,${COLORS.primaryDark} 100%);padding:28px 32px;color:#ffffff;">` +
            `<div style="font-size:12px;font-weight:700;letter-spacing:1.5px;opacity:0.85;text-transform:uppercase;">Maven CRM · Agency QA</div>` +
            `<div style="font-size:22px;font-weight:700;margin-top:4px;line-height:1.3;">QA de llamada — análisis listo</div>` +
            `<div style="font-size:13px;margin-top:4px;opacity:0.85;">${escape(p.closerName)} · modelo ${escape(p.modelName)}${p.modelCategory ? ` (${escape(p.modelCategory)})` : ""}</div>` +
          `</td></tr>` +

          // Score + outcome
          `<tr><td style="padding:24px 32px;">` +
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
              `<td>` +
                `<div style="font-size:11px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:1px;font-weight:600;">Score IA</div>` +
                `<div style="font-size:32px;font-weight:700;color:${scoreColor};margin-top:2px;line-height:1;">${p.overallScore}<span style="font-size:16px;color:${COLORS.muted};font-weight:500;">/100</span></div>` +
              `</td>` +
              `<td align="right">` +
                `<div style="font-size:11px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:1px;font-weight:600;">Resultado</div>` +
                `<div style="display:inline-block;margin-top:4px;padding:4px 12px;border-radius:9999px;background:${outcomeColor}1a;color:${outcomeColor};font-size:13px;font-weight:700;">${escape(p.callOutcomeLabel)}</div>` +
                (p.callOutcomeReason
                  ? `<div style="font-size:11px;color:${COLORS.muted};margin-top:6px;max-width:240px;line-height:1.4;">${escape(p.callOutcomeReason)}</div>`
                  : "") +
              `</td>` +
            `</tr></table>` +
            `<div style="margin-top:18px;font-size:13px;color:${COLORS.muted};line-height:1.5;">` +
              `<strong style="color:${COLORS.text};">Fecha:</strong> ${escape(p.callDate)} · ` +
              `<strong style="color:${COLORS.text};">Evaluador:</strong> ${escape(p.evaluatorName)}` +
            `</div>` +
          `</td></tr>` +

          // Resumen ejecutivo
          (p.summary
            ? `<tr><td style="padding:0 32px 8px;">` +
                `<div style="font-size:11px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:6px;">Resumen</div>` +
                `<div style="font-size:14px;line-height:1.55;color:${COLORS.text};background:${COLORS.bg};border-left:3px solid ${COLORS.primary};border-radius:6px;padding:12px 14px;white-space:pre-wrap;">${escape(p.summary)}</div>` +
              `</td></tr>`
            : "") +

          // Dimensiones (criterios)
          (dimensionRows
            ? `<tr><td style="padding:18px 32px 8px;">` +
                `<div style="font-size:11px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:8px;">Dimensiones</div>` +
                `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${COLORS.border};border-radius:10px;overflow:hidden;">` +
                  dimensionRows +
                `</table>` +
              `</td></tr>`
            : "") +

          redFlagsBlock +
          keyMomentsBlock +
          improvementsBlock +

          // Footer
          `<tr><td style="padding:18px 32px 26px;border-top:1px solid ${COLORS.border};margin-top:8px;">` +
            `<div style="font-size:12px;color:${COLORS.muted};">QA id: ${escape(p.callId.slice(0, 8))} · análisis automático generado por IA.</div>` +
          `</td></tr>` +

        `</table>` +
      `</td></tr></table>` +
    `</body></html>`
  );
};

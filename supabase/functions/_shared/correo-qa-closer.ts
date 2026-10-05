// Correo del reporte de QA de Closers (TS puro, sin React/DOM). Única copia:
// la usan qa-analyze (al terminar el análisis) y send-notification-email (el
// «Reenviar» del navegador, que desde el 05/10/2026 solo pide «manda el reporte
// de esta llamada» y el correo se arma aquí, nunca en el navegador). Hasta esa
// fecha el frontend tenía su propia copia (pages/agency-qa/qaEmailTemplate.ts).

export interface QaEmailPayload {
  callId: string;
  createdAt: string;
  closerName: string;
  modelName: string;
  modelCategory: string | null;
  modelIgUrl: string | null;
  callDate: string;
  evaluatorName: string;
  overallScore: number;
  summary: string;
  callOutcome: string | null;
  callOutcomeLabel: string;
  callOutcomeReason: string | null;
  // No-null cuando la llamada fue venta de un servicio a una creadora existente
  // (call_type='venta_servicio'): nombre del servicio ofrecido.
  serviceLabel: string | null;
  dimensions: { name: string; score: number; feedback: string }[];
  redFlags: { type: string; description: string; quote: string }[];
  keyMoments: { kind: "positivo" | "negativo"; quote: string; why: string }[];
  improvements: string[];
  appUrl: string;
}

const COLORS = {
  bg:          "#f4f4f7",
  card:        "#ffffff",
  cardSoft:    "#fafafd",
  primary:     "#6d28d9",
  primaryDark: "#4338ca",
  primarySoft: "#f3efff",
  green:       "#16a34a",
  greenSoft:   "#ecfdf5",
  red:         "#dc2626",
  redSoft:     "#fef2f2",
  amber:       "#d97706",
  amberSoft:   "#fffbeb",
  text:        "#0f172a",
  muted:       "#64748b",
  border:      "#e2e8f0",
  borderSoft:  "#eef0f4",
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

const fmtScore10 = (score0to100: number): string =>
  (Math.max(0, Math.min(100, score0to100)) / 10).toFixed(1);

export const buildQaEmailSubject = (p: QaEmailPayload): string =>
  `[Maven QA Closers] ${p.closerName} · ${p.modelName}${p.serviceLabel ? ` · Venta: ${p.serviceLabel}` : ""} · ${fmtScore10(p.overallScore)}/10 (${p.callOutcomeLabel})`;

export const buildQaEmailHtml = (p: QaEmailPayload): string => {
  const scoreColor = scoreColorOf(p.overallScore);
  const outcomeColor = outcomeColorOf(p.callOutcome);

  const sectionTitle = (label: string, accent: string = COLORS.primary): string =>
    `<div style="font-size:11px;color:${accent};text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:10px;">${escape(label)}</div>`;

  const dimensionRows = p.dimensions
    .map((d, i) => {
      const dColor = scoreColorOf(d.score);
      const isLast = i === p.dimensions.length - 1;
      return (
        `<tr>` +
        `<td style="padding:12px 16px;${isLast ? "" : `border-bottom:1px solid ${COLORS.borderSoft};`}font-size:13px;color:${COLORS.text};vertical-align:top;">` +
          `<div style="font-weight:600;">${escape(d.name)}</div>` +
          (d.feedback
            ? `<div style="font-size:12px;color:${COLORS.muted};margin-top:4px;line-height:1.5;">${escape(d.feedback)}</div>`
            : "") +
        `</td>` +
        `<td style="padding:12px 16px;${isLast ? "" : `border-bottom:1px solid ${COLORS.borderSoft};`}text-align:right;vertical-align:top;width:70px;">` +
          `<span style="display:inline-block;padding:4px 10px;border-radius:9999px;background:${dColor};color:#ffffff;font-size:12px;font-weight:700;">${fmtScore10(d.score)}/10</span>` +
        `</td>` +
        `</tr>`
      );
    })
    .join("");

  const redFlagsInner = p.redFlags.length
    ? sectionTitle(`⚠️  Red flags · ${p.redFlags.length}`, COLORS.red) +
      p.redFlags
        .map(
          (f) =>
            `<div style="font-size:13px;background:${COLORS.redSoft};border:1px solid ${COLORS.red}33;border-radius:10px;padding:12px 14px;margin-bottom:8px;text-align:left;">` +
              `<div style="font-weight:700;color:${COLORS.red};text-transform:uppercase;font-size:11px;letter-spacing:1px;">${escape(f.type)}</div>` +
              (f.description
                ? `<div style="color:${COLORS.text};margin-top:6px;line-height:1.5;">${escape(f.description)}</div>`
                : "") +
              (f.quote
                ? `<div style="font-style:italic;color:${COLORS.muted};margin-top:6px;font-size:12px;border-left:3px solid ${COLORS.red}66;padding-left:10px;">"${escape(f.quote)}"</div>`
                : "") +
            `</div>`,
        )
        .join("")
    : "";

  const keyMomentsInner = p.keyMoments.length
    ? sectionTitle(`★ Momentos clave`, COLORS.amber) +
      p.keyMoments
        .map((k) => {
          const c = k.kind === "positivo" ? COLORS.green : COLORS.red;
          const cSoft = k.kind === "positivo" ? COLORS.greenSoft : COLORS.redSoft;
          const tag = k.kind === "positivo" ? "✓ Positivo" : "✗ Negativo";
          return (
            `<div style="font-size:13px;background:${cSoft};border:1px solid ${c}33;border-radius:10px;padding:12px 14px;margin-bottom:8px;text-align:left;">` +
              `<div style="font-weight:700;color:${c};font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">${tag}</div>` +
              `<div style="font-style:italic;color:${COLORS.text};line-height:1.5;border-left:3px solid ${c}66;padding-left:10px;">"${escape(k.quote)}"</div>` +
              (k.why
                ? `<div style="color:${COLORS.muted};margin-top:6px;font-size:12px;line-height:1.5;">${escape(k.why)}</div>`
                : "") +
            `</div>`
          );
        })
        .join("")
    : "";

  const improvementsInner = p.improvements.length
    ? sectionTitle(`✓ Mejoras sugeridas`, COLORS.green) +
      `<ol style="margin:0;padding-left:0;font-size:13px;line-height:1.6;color:${COLORS.text};list-style:none;text-align:left;">` +
        p.improvements
          .map(
            (m, i) =>
              `<li style="margin-bottom:8px;padding:10px 12px;background:${COLORS.greenSoft};border-radius:10px;display:block;">` +
                `<span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:${COLORS.green};color:#ffffff;font-size:11px;font-weight:700;margin-right:10px;">${i + 1}</span>` +
                `<span>${escape(m)}</span>` +
              `</li>`,
          )
          .join("") +
      `</ol>`
    : "";

  const blockSpacer = `<div style="height:14px;"></div>`;

  return (
    `<!DOCTYPE html><html><body style="margin:0;padding:0;background:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:${COLORS.text};">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};padding:24px 0;"><tr><td align="left" style="padding:0 24px;">` +
        `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${COLORS.bg};">` +

          `<tr><td style="background:linear-gradient(135deg,${COLORS.primary} 0%,${COLORS.primaryDark} 100%);padding:28px 28px;color:#ffffff;border-radius:18px 18px 0 0;">` +
            `<div style="font-size:11px;font-weight:700;letter-spacing:2px;opacity:0.8;text-transform:uppercase;">Maven CRM · Agency QA</div>` +
            `<div style="font-size:22px;font-weight:700;margin-top:6px;line-height:1.3;">QA de llamada — ${escape(p.closerName)}</div>` +
            `<div style="font-size:14px;margin-top:8px;opacity:0.92;">` +
              `Modelo: <strong>${escape(p.modelName)}</strong>${p.modelCategory ? ` <span style="opacity:0.8;">"${escape(p.modelCategory)}"</span>` : ""}` +
              (p.modelIgUrl
                ? ` <a href="${escape(p.modelIgUrl)}" target="_blank" style="display:inline-block;margin-left:8px;padding:3px 10px 3px 8px;border-radius:9999px;background:rgba(255,255,255,0.18);color:#ffffff;text-decoration:none;font-size:12px;font-weight:600;vertical-align:middle;">` +
                    `<span style="font-size:13px;margin-right:4px;">📷</span>Instagram` +
                  `</a>`
                : "") +
            `</div>` +
          `</td></tr>` +

          `<tr><td style="background:${COLORS.card};border-radius:0 0 18px 18px;padding:20px 24px 24px;">` +

            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.cardSoft};border:1px solid ${COLORS.borderSoft};border-radius:14px;margin-bottom:12px;">` +
              `<tr>` +
                `<td style="padding:18px 20px;vertical-align:middle;">` +
                  `<div style="font-size:11px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Score IA</div>` +
                  `<div style="font-size:34px;font-weight:800;color:${scoreColor};margin-top:4px;line-height:1;">` +
                    `${fmtScore10(p.overallScore)}<span style="font-size:16px;color:${COLORS.muted};font-weight:500;margin-left:2px;">/10</span>` +
                  `</div>` +
                `</td>` +
                `<td style="width:1px;background:${COLORS.borderSoft};"></td>` +
                `<td align="right" style="padding:18px 20px;vertical-align:middle;">` +
                  `<div style="font-size:11px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Resultado</div>` +
                  `<div style="margin-top:6px;display:inline-block;padding:6px 14px;border-radius:9999px;background:${outcomeColor};color:#ffffff;font-size:13px;font-weight:700;">${escape(p.callOutcomeLabel)}</div>` +
                `</td>` +
              `</tr>` +
            `</table>` +

            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.cardSoft};border:1px solid ${COLORS.borderSoft};border-radius:14px;margin-bottom:14px;">` +
              `<tr><td style="padding:14px 18px;">` +
                `<div style="font-size:13px;color:${COLORS.text};line-height:1.6;">` +
                  `<span style="font-size:11px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:1px;font-weight:700;">Fecha:</span> ` +
                  `<strong>${escape(p.callDate)}</strong>` +
                  `<span style="margin:0 8px;color:${COLORS.borderSoft};">·</span>` +
                  `<span style="font-size:11px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:1px;font-weight:700;">Evaluador:</span> ` +
                  `<strong>${escape(p.evaluatorName)}</strong>` +
                `</div>` +
                (p.callOutcomeReason
                  ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid ${COLORS.borderSoft};font-size:12px;color:${COLORS.muted};line-height:1.5;text-align:left;">` +
                      `<span style="color:${COLORS.text};font-weight:600;">Comentario:</span> ${escape(p.callOutcomeReason)}` +
                    `</div>`
                  : "") +
              `</td></tr>` +
            `</table>` +

            (p.summary
              ? `<div style="background:${COLORS.primarySoft};border:1px solid ${COLORS.primary}33;border-radius:14px;padding:16px 18px;margin-bottom:12px;">` +
                  sectionTitle("Resumen", COLORS.primary) +
                  `<div style="font-size:14px;line-height:1.6;color:${COLORS.text};white-space:pre-wrap;">${escape(p.summary)}</div>` +
                `</div>`
              : "") +

            (dimensionRows
              ? `<div style="background:${COLORS.card};border:1px solid ${COLORS.borderSoft};border-radius:14px;padding:18px;margin-bottom:12px;text-align:left;">` +
                  sectionTitle("Dimensiones", COLORS.primary) +
                  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${COLORS.borderSoft};border-radius:10px;overflow:hidden;">` +
                    dimensionRows +
                  `</table>` +
                `</div>`
              : "") +

            ((redFlagsInner || keyMomentsInner || improvementsInner)
              ? `<div style="background:${COLORS.card};border:1px solid ${COLORS.borderSoft};border-radius:14px;padding:18px;margin-bottom:12px;text-align:left;">` +
                  redFlagsInner +
                  (redFlagsInner && (keyMomentsInner || improvementsInner) ? blockSpacer : "") +
                  keyMomentsInner +
                  (keyMomentsInner && improvementsInner ? blockSpacer : "") +
                  improvementsInner +
                `</div>`
              : "") +

          `</td></tr>` +

          `<tr><td style="padding:18px 24px 8px;text-align:center;">` +
            `<a href="${escape(p.appUrl)}/agency-qa?callId=${escape(p.callId)}" ` +
              `style="display:inline-block;background:linear-gradient(135deg,${COLORS.primary} 0%,${COLORS.primaryDark} 100%);` +
              `color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 28px;` +
              `border-radius:9999px;letter-spacing:0.5px;box-shadow:0 4px 12px ${COLORS.primary}40;" ` +
              `target="_blank">` +
              `Ver análisis completo →` +
            `</a>` +
            `<div style="font-size:11px;color:${COLORS.muted};margin-top:10px;">Abre la QA completa en Maven CRM</div>` +
          `</td></tr>` +

          `<tr><td style="padding:8px 24px 8px;text-align:center;">` +
            `<div style="font-size:11px;color:${COLORS.muted};">QA id: ${escape(p.callId.slice(0, 8))} · análisis automático generado por IA · Maven CRM</div>` +
          `</td></tr>` +

        `</table>` +
      `</td></tr></table>` +
    `</body></html>`
  );
};

/** Lo que deja la IA en qa_calls.claude_analysis (solo lo que va al correo). */
export interface AnalisisQa {
  summary?: string;
  overall_score?: number;
  call_outcome?: string | null;
  call_outcome_reason?: string | null;
  dimensions?: Array<{ name: string; score: number; feedback: string }>;
  red_flags?: Array<{ type: string; description: string; quote: string }>;
  key_moments?: Array<{ kind: "positivo" | "negativo"; quote: string; why: string }>;
  improvements?: string[];
}

/** El payload del correo a partir de la fila de qa_calls (la misma forma en
 *  qa-analyze y en send-notification-email). */
export function armarPayloadQaCloser(args: {
  call: {
    id: string;
    created_at?: string | null;
    call_date?: string | null;
    evaluator_name?: string | null;
    call_type?: string | null;
    service_sold?: string | null;
  };
  analysis: unknown;
  score: number;
  model: { name?: string | null; category?: string | null; ig_url?: string | null } | null;
  closer: { name?: string | null } | null;
  appUrl: string;
}): QaEmailPayload {
  const { call, score, model, closer } = args;
  const a = (args.analysis ?? {}) as AnalisisQa;
  const outcome = a.call_outcome ?? null;
  return {
    callId: call.id,
    createdAt: call.created_at ?? "",
    closerName: closer?.name ?? "(sin nombre)",
    modelName: model?.name ?? "(sin nombre)",
    modelCategory: model?.category ?? null,
    modelIgUrl: model?.ig_url ?? null,
    appUrl: args.appUrl,
    callDate: call.call_date ?? "",
    evaluatorName: call.evaluator_name ?? "",
    overallScore: score,
    summary: a.summary ?? "",
    callOutcome: outcome,
    callOutcomeLabel: labelForOutcome(outcome),
    callOutcomeReason: a.call_outcome_reason ?? null,
    serviceLabel: call.call_type === "venta_servicio" || call.call_type === "venta_externa"
      ? (call.service_sold || "servicio")
      : null,
    dimensions: (a.dimensions ?? []).map((d) => ({ name: d.name, score: d.score, feedback: d.feedback })),
    redFlags: (a.red_flags ?? []).map((f) => ({ type: f.type, description: f.description, quote: f.quote })),
    keyMoments: (a.key_moments ?? []).map((k) => ({ kind: k.kind, quote: k.quote, why: k.why })),
    improvements: a.improvements ?? [],
  };
}

/** ¿Hay que avisar? Los interruptores de qa_config: todos los análisis, o solo
 *  los que quedan por debajo del umbral. */
export function debeAvisarQaCloser(
  config: { notify_on_analyzed?: boolean | null; notify_on_low_score?: boolean | null; low_score_threshold?: number | null },
  score: number,
): boolean {
  return config.notify_on_analyzed === true ||
    (config.notify_on_low_score === true && score < (config.low_score_threshold ?? 60));
}

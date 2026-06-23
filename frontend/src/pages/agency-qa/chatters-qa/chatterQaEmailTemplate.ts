// Builder del email del QA cualitativo de chatters (espeja el correo del supervisor).
// HTML inline (email-safe, NO CSS vars). Auto-contenido: NO importa de useChatterQaReports
// para no crear ciclos de import. La edge send-notification-email recibe el HTML ya armado.

export interface EmailReportBody {
  intro?: string;
  resumen?: string;
  aspectos_positivos?: string[];
  aspectos_mejora?: { categoria: string; detalle: string }[];
  observaciones_por_modelo?: { model_name?: string; observaciones?: string[]; ejemplos?: { quote: string; por_que: string; fan?: string }[] }[];
  recomendaciones?: string[];
  conclusion?: string;
  hallazgo_principal?: string;
}
export interface ChatterQaEmailPayload {
  chatterName: string;
  companyLabel: string;
  periodLabel: string;
  evaluatorName: string;
  veredictoLabel: string;
  tone: "good" | "warn" | "bad";
  report: EmailReportBody;
  evaluatedModels: { model_name: string }[];
  fanIndex: Record<string, { m: number; c: number; n?: string }>;
  appUrl: string;
}

// Tema CLARO (igual que el email de Closers QA — los clientes de correo rompen los fondos oscuros).
const C = {
  bg: "#f4f4f7", card: "#ffffff", cardSoft: "#fafafd", border: "#e2e8f0", text: "#0f172a", muted: "#64748b",
  primary: "#6d28d9", primaryDark: "#4338ca",
  good: "#16a34a", goodSoft: "#ecfdf5", warn: "#d97706", warnSoft: "#fffbeb", bad: "#dc2626", badSoft: "#fef2f2",
};
const toneColor = (t: string) => (t === "good" ? C.good : t === "bad" ? C.bad : C.warn);
const toneSoft = (t: string) => (t === "good" ? C.goodSoft : t === "bad" ? C.badSoft : C.warnSoft);

const escape = (s: unknown) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Reemplaza @handle por "Nombre @handle" (en negrita); en email no hay link SPA clickable.
function richText(text: string, fanIndex: ChatterQaEmailPayload["fanIndex"]): string {
  return String(text || "").split(/(@[A-Za-z0-9_.]+)/g).map((p) => {
    if (!/^@[A-Za-z0-9_.]+$/.test(p)) return escape(p);
    const hit = fanIndex[p];
    const label = hit?.n ? `${escape(hit.n)} ${escape(p)}` : escape(p);
    return `<strong style="color:${C.text}">${label}</strong>`;
  }).join("");
}

const sectionTitle = (t: string) =>
  `<div style="font-size:13px;font-weight:700;color:${C.text};text-transform:uppercase;letter-spacing:.04em;margin:22px 0 8px">${escape(t)}</div>`;

export const buildChatterQaEmailSubject = (p: ChatterQaEmailPayload) =>
  `[Maven · QA Chatters] ${p.chatterName} · ${p.companyLabel} · ${p.periodLabel} (${p.veredictoLabel})`;

export function buildChatterQaEmailHtml(p: ChatterQaEmailPayload): string {
  const r = p.report;
  const fi = p.fanIndex || {};
  const li = (items?: string[], color?: string) =>
    (items ?? []).filter(Boolean).map((x) =>
      `<li style="margin:0 0 6px;color:${C.text};font-size:14px;line-height:1.5">${color ? `<span style="color:${color}">▸ </span>` : ""}${richText(x, fi)}</li>`).join("");

  const mejoras = (r.aspectos_mejora ?? []).map((m) =>
    `<div style="border:1px solid ${C.warn}55;background:${C.warnSoft};border-radius:8px;padding:10px 12px;margin:0 0 8px">
      <div style="color:${C.warn};font-weight:700;font-size:14px">${escape(m.categoria)}</div>
      <div style="color:${C.text};font-size:14px;line-height:1.5;margin-top:2px">${richText(m.detalle, fi)}</div>
    </div>`).join("");

  const obs = (r.observaciones_por_modelo ?? []).map((o) => {
    const obsLis = li(o.observaciones);
    const ej = (o.ejemplos ?? []).map((e) => {
      const who = e.fan ? richText(e.fan, fi) : "";
      return `<div style="border:1px solid ${C.border};background:${C.bg};border-radius:6px;padding:8px 10px;margin:6px 0;font-size:13px">
        ${who ? `<div style="margin-bottom:2px">${who}</div>` : ""}
        <div style="color:${C.muted};font-style:italic">“${escape(e.quote)}”</div>
        <div style="color:${C.muted};margin-top:3px">→ ${escape(e.por_que)}</div>
      </div>`;
    }).join("");
    return `<div style="margin:0 0 12px">
      <div style="font-weight:700;color:${C.text};font-size:14px;margin-bottom:4px">${escape(o.model_name ?? "")}</div>
      ${obsLis ? `<ul style="margin:0 0 6px;padding-left:18px">${obsLis}</ul>` : ""}${ej}
    </div>`;
  }).join("");

  const models = (p.evaluatedModels ?? []).map((m) => escape(m.model_name)).join(" · ");

  return `<!doctype html><html><body style="margin:0;background:${C.bg};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr><td style="background:linear-gradient(135deg,${C.primary},${C.primaryDark});border-radius:14px 14px 0 0;padding:22px 24px">
          <div style="color:#fff;font-size:20px;font-weight:800">${escape(p.chatterName)}</div>
          <div style="color:#ffffffcc;font-size:12px;margin-top:3px">${escape(p.companyLabel)} · ${escape(p.periodLabel)} · ${escape(p.evaluatorName)}${models ? ` · ${models}` : ""}</div>
          <div style="display:inline-block;margin-top:10px;background:${toneColor(p.tone)};color:#fff;font-weight:700;font-size:13px;border-radius:999px;padding:4px 14px">${escape(p.veredictoLabel)}</div>
        </td></tr>
        <tr><td style="background:${C.card};border:1px solid ${C.border};border-top:0;border-radius:0 0 14px 14px;padding:8px 24px 24px">
          ${r.intro ? `<p style="color:${C.muted};font-size:13px;line-height:1.5;margin:14px 0 0">${richText(r.intro, fi)}</p>` : ""}
          ${r.resumen ? `${sectionTitle("Resumen")}<p style="color:${C.text};font-size:14px;line-height:1.55;margin:0">${richText(r.resumen, fi)}</p>` : ""}
          ${r.aspectos_positivos?.length ? `${sectionTitle("Aspectos positivos")}<ul style="margin:0;padding-left:18px">${li(r.aspectos_positivos, C.good)}</ul>` : ""}
          ${r.aspectos_mejora?.length ? `${sectionTitle("Aspectos de mejora")}${mejoras}` : ""}
          ${r.observaciones_por_modelo?.length ? `${sectionTitle("Observaciones por modelo")}${obs}` : ""}
          ${r.recomendaciones?.length ? `${sectionTitle("Recomendaciones")}<ul style="margin:0;padding-left:18px">${li(r.recomendaciones, C.primary)}</ul>` : ""}
          ${r.conclusion ? `${sectionTitle("Conclusión")}<p style="color:${C.text};font-size:14px;line-height:1.55;margin:0">${richText(r.conclusion, fi)}</p>` : ""}
          ${r.hallazgo_principal ? `<div style="border:1px solid ${toneColor(p.tone)}66;background:${toneSoft(p.tone)};border-radius:10px;padding:12px 14px;margin:18px 0 0">
            <div style="color:${toneColor(p.tone)};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em">Hallazgo principal</div>
            <div style="color:${C.text};font-size:14px;font-weight:600;line-height:1.5;margin-top:3px">${richText(r.hallazgo_principal, fi)}</div>
          </div>` : ""}
          <div style="margin-top:22px;text-align:center">
            <a href="${escape(p.appUrl)}/agency-qa?role=chatters-qa&tab=qa" style="display:inline-block;background:${C.primary};color:#fff;text-decoration:none;font-weight:700;font-size:14px;border-radius:8px;padding:10px 22px">Ver reporte completo en Maven →</a>
          </div>
        </td></tr>
        <tr><td style="padding:14px 24px;text-align:center;color:${C.muted};font-size:11px">Maven CRM · QA de Chatters</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

// Lámina HTML de la parrilla para Gotenberg — espejo estático del tablero del
// editor (ParrillaPage.tsx / DayColumn). Mismo orden visual: cabecera del día
// (día de semana, número, fecha, formato), idea, copy, franja, acción extra con
// sus burbujas y referencias, y la regla de ejecución al pie. Sin controles.
export interface Theme { foto: string; video: string; telegram: string; urgencia: string; base: string; tinta: string }
export const DEFAULT_THEME: Theme = { foto: "#b08d2f", video: "#d6336c", telegram: "#7048e8", urgencia: "#e8590c", base: "#faf6ef", tinta: "#1a1a1a" };

const EXTRA_META: Record<string, { label: string; colorKey: keyof Theme }> = {
  dinamica_lanzamiento: { label: "Dinámica de urgencia · Lanzamiento", colorKey: "urgencia" },
  reel: { label: "Reel del día", colorKey: "video" },
  tg_3pub: { label: "3 publicaciones del día", colorKey: "telegram" },
  tg_audio: { label: "Audios de buenos días", colorKey: "telegram" },
  dinamica_cierre: { label: "Dinámica de urgencia · Cierre", colorKey: "urgencia" },
  custom: { label: "Acción extra", colorKey: "foto" },
};
const WEEKDAYS = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];
const weekday = (iso: string) => WEEKDAYS[new Date(iso + "T12:00:00Z").getUTCDay()];
const fmtDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nl = (s: unknown) => esc(s).replace(/\n/g, "<br>");
const isHttp = (u: string) => /^https?:\/\//i.test((u ?? "").trim());

// Ancho útil de un A3 horizontal (16,54 in) menos márgenes, en px CSS a 96 dpi.
export const A3_LANDSCAPE_IN = { width: 16.54, height: 11.69 };
const COL_W = 300, GAP = 12, USABLE_PX = 1500;

export function renderParrillaHtml(args: { title: string; week_start: string; week_end: string; theme: Partial<Theme> | null; days: any[] }): string {
  const t: Theme = { ...DEFAULT_THEME, ...(args.theme ?? {}) };
  const days = [...args.days].sort((a, b) => a.day_index - b.day_index);
  const sheetW = days.length * COL_W + Math.max(0, days.length - 1) * GAP;
  const zoom = Math.min(1, USABLE_PX / sheetW);

  const cols = days.map((d) => {
    const meta = EXTRA_META[d.extra_type] ?? EXTRA_META.custom;
    const extraColor = t[meta.colorKey];
    const topColor = d.format_badge === "video_corto" ? t.video : t.foto;
    const items: any[] = Array.isArray(d.extra_items) ? d.extra_items.filter((it: any) => (it.label ?? "").trim() || (it.copy ?? "").trim()) : [];
    const refs: any[] = Array.isArray(d.refs) ? d.refs.filter((r: any) => (r.url ?? "").trim()) : [];
    return `
    <div class="col">
      <div class="head" style="border-top:4px solid ${topColor}">
        <div class="row"><span class="wd">${weekday(d.date)}</span><span class="num">${String(d.day_index).padStart(2, "0")}</span></div>
        <div class="row"><span class="date">${fmtDia(d.date)}</span><span class="badge">${d.format_badge === "video_corto" ? "VIDEO CORTO" : "FLYER O FOTO"}</span></div>
      </div>
      <div class="body">
        <p class="lbl">Idea de material</p>
        <div class="idea">${nl(d.idea)}</div>
        <p class="lbl">Copy sugerido</p>
        <div class="copy" style="background:${topColor}14">${nl(d.copy_sugerido)}</div>
        <p class="franja"><span class="lbl">Franja</span> ${esc(d.franja)}</p>
      </div>
      <div class="extra" style="border-top:2px solid ${extraColor};background:${extraColor}0d">
        <p class="lbl" style="color:${extraColor}">Acción extra del día</p>
        <p class="etitle">${esc(d.extra_title || meta.label)}</p>
        <div class="edesc">${nl(d.extra_desc)}</div>
        ${items.map((it) => `<div class="item"><div class="ilbl">${esc(it.momento ? `${it.momento} · ` : "")}${esc(it.label)}</div><div class="icopy">${nl(it.copy)}</div></div>`).join("")}
        ${refs.map((r, i) => `<div class="ref" style="border-color:${extraColor}55"><span class="rurl">${esc(r.url)}</span><span class="rn" style="color:${extraColor}">${esc((r.nicho ?? "").trim() || String(i + 1))}</span>${isHttp(r.url) ? `<a href="${esc(r.url)}" style="color:${extraColor}">Ver reel →</a>` : ""}</div>`).join("")}
      </div>
    </div>`;
  }).join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(args.title)}</title>
<style>
  @page { margin: 0.3in; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; background: ${t.base}; color: ${t.tinta}; font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Noto Color Emoji", sans-serif; font-size: 12px; }
  .sheet { zoom: ${zoom.toFixed(3)}; width: ${sheetW}px; }
  .title { display: flex; align-items: baseline; gap: 12px; margin: 0 0 12px; }
  .title h1 { margin: 0; font-size: 20px; font-weight: 900; letter-spacing: -0.01em; }
  .title h1 span { color: ${t.video}; }
  .title small { font-size: 12px; color: #6b6b76; }
  .board { display: flex; gap: ${GAP}px; align-items: stretch; }
  .col { width: ${COL_W}px; flex: 0 0 ${COL_W}px; display: flex; flex-direction: column; background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; overflow: hidden; }
  .head { padding: 8px 12px 6px; }
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .wd { font-size: 14px; font-weight: 900; letter-spacing: 0.04em; }
  .num { font-size: 24px; font-weight: 900; opacity: .15; line-height: 1; }
  .date { font-size: 11px; color: #6b6b76; }
  .badge { font-size: 10px; font-weight: 700; text-transform: uppercase; border: 1px solid #e4e4e7; border-radius: 999px; padding: 1px 8px; }
  .body { padding: 0 12px 12px; }
  .lbl { margin: 8px 0 3px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; color: #6b6b76; }
  .idea { font-size: 12px; line-height: 1.35; border: 1px dashed #d4d4d8; border-radius: 6px; padding: 6px; min-height: 60px; }
  .copy { font-size: 12px; line-height: 1.35; font-style: italic; border-radius: 8px; padding: 8px; min-height: 44px; }
  .franja { margin: 8px 0 0; font-size: 11px; display: flex; align-items: center; gap: 6px; }
  .franja .lbl { margin: 0; }
  .extra { flex: 1; padding: 8px 12px 12px; }
  .etitle { margin: 2px 0 4px; font-size: 14px; font-weight: 900; text-transform: uppercase; line-height: 1.15; }
  .edesc { font-size: 12px; line-height: 1.35; border: 1px dashed #d4d4d8; border-radius: 6px; padding: 6px; min-height: 50px; }
  .item { margin-top: 6px; border: 1px solid #e4e4e7; border-radius: 8px; background: rgba(255,255,255,.7); padding: 6px; }
  .ilbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #6b6b76; }
  .icopy { margin-top: 2px; font-size: 11px; font-style: italic; line-height: 1.35; }
  .ref { margin-top: 6px; display: flex; align-items: center; gap: 6px; border: 1px solid; border-radius: 999px; padding: 4px 8px; font-size: 10px; }
  .rurl { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .rn { font-size: 9px; font-weight: 700; text-transform: uppercase; }
  .ref a { font-size: 9px; font-weight: 700; text-transform: uppercase; text-decoration: none; white-space: nowrap; }
  .rule { margin-top: 10px; font-size: 10px; line-height: 1.5; color: #6b6b76; background: rgba(255,255,255,.6); border: 1px solid #e4e4e7; border-radius: 8px; padding: 8px 12px; }
</style></head><body>
<div class="sheet">
  <div class="title"><h1>PARRILLA DE <span>PROMOCIÓN</span></h1><small>${days.length} días · ${fmtDia(args.week_start)} → ${fmtDia(args.week_end)} · contenido diario en Instagram + acción extra en Reels, Telegram y X</small></div>
  <div class="board">${cols}</div>
  <div class="rule"><b>Regla de ejecución</b> — <b>Instagram:</b> lenguaje limpio y no sexual, sin precios ni llamadas agresivas; el 💙 es el único código permitido. · <b>X + Telegram:</b> canal directo de venta; toda urgencia debe ser real y toda oferta activa antes de anunciarla. · <b>Sábado y domingo:</b> 3 publicaciones en Telegram (mañana, tarde y noche). · <b>Tu manager:</b> te envía el flyer y los enlaces, valida cupos y promos.</div>
</div>
</body></html>`;
}

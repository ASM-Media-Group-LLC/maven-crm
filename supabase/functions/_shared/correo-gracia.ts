// Correo del descuento del día (minutos de gracia de Argos, Alvaro 16/11/2026).
//
// Cada turno tiene 15 min sin pantalla y 15 min sin cámara de gracia. Lo que pasa
// de ahí no se paga. Al cerrar el turno, si hubo descuento, le llega un correo a
// la persona, a su jefe y a RR. HH. para que «no venga la sorpresita a fin de mes».
// Si RR. HH. devuelve minutos después del correo, sale uno de corrección.
//
// Este archivo solo arma el texto. La cuenta la hace la base
// (argos_gracia_calculo) y el envío lo hace detectar-tardanzas.

export interface CierreGracia {
  user_id: string;
  turno: string; // AAAA-MM-DD
  nombre: string;
  rol: string | null;
  inicio: string; // ISO
  fin: string; // ISO
  conectado_min: number;
  trabajo_min: number;
  pausa_min: number;
  sin_pantalla_min: number;
  sin_camara_min: number;
  gracia_pantalla_min: number;
  gracia_camara_min: number;
  extra_pantalla_min: number;
  extra_camara_min: number;
  descuento_min: number;
  a_pagar_min: number;
  ensayo: boolean;
  es_correccion: boolean;
  motivos: string | null;
  destinatarios: string[];
}

/** «7 h 05 min», «45 min», «0 min». */
export function formatoMin(min: number): string {
  const m = Math.max(0, Math.round(Number(min) || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, "0")} min`;
}

/** Lo que pasó de la gracia, por separado (pantalla y cámara). */
export function excesos(c: Pick<CierreGracia, "sin_pantalla_min" | "sin_camara_min" | "gracia_pantalla_min" | "gracia_camara_min">): { pantalla: number; camara: number } {
  return {
    pantalla: Math.max(0, Math.round(c.sin_pantalla_min) - Math.round(c.gracia_pantalla_min)),
    camara: Math.max(0, Math.round(c.sin_camara_min) - Math.round(c.gracia_camara_min)),
  };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];

/** «lun 16 nov» para el turno AAAA-MM-DD. */
export function fechaCorta(turno: string): string {
  const [a, m, d] = turno.split("-").map(Number);
  if (!a || !m || !d) return turno;
  const dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${dias[dow]} ${d} ${MESES[m - 1]}`;
}

function hhmm(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function asuntoGracia(c: CierreGracia): string {
  const quien = c.nombre;
  if (c.es_correccion) {
    return c.descuento_min > 0
      ? `Corrección del descuento — ${quien} (${fechaCorta(c.turno)}): ahora ${formatoMin(c.descuento_min)}`
      : `Corrección del descuento — ${quien} (${fechaCorta(c.turno)}): sin descuento`;
  }
  const base = `Descuento del día — ${quien} (${fechaCorta(c.turno)}): ${formatoMin(c.descuento_min)}`;
  return c.ensayo ? `Ensayo · ${base}` : base;
}

function escapar(s: string): string {
  return (s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
}

export function correoGraciaHTML(c: CierreGracia): string {
  const ex = excesos(c);
  const rojo = "#e23d5b";
  const morado = "#6d5efc";
  const chip = c.es_correccion
    ? `<span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${morado};background:#efedff;padding:5px 10px;border-radius:999px">Corrección</span>`
    : c.ensayo
    ? `<span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8a5a00;background:#fff4dc;padding:5px 10px;border-radius:999px">Ensayo · esta semana no se descuenta</span>`
    : `<span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${rojo};background:#fdeef1;padding:5px 10px;border-radius:999px">Descuento del día</span>`;

  const titulo = c.es_correccion
    ? (c.descuento_min > 0 ? `RR. HH. devolvió minutos: el descuento ahora es de ${formatoMin(c.descuento_min)}` : "RR. HH. devolvió minutos: ya no hay descuento")
    : `${escapar(c.nombre)} tuvo ${formatoMin(c.descuento_min)} de descuento`;

  const explicacion = c.es_correccion
    ? `Se recalculó el turno del ${fechaCorta(c.turno)} con los minutos que devolvió RR. HH.${c.motivos ? ` Motivo: «${escapar(c.motivos)}».` : ""}`
    : c.ensayo
    ? `Cada turno tiene ${c.gracia_pantalla_min} min sin compartir pantalla y ${c.gracia_camara_min} min sin cámara de gracia. Lo que pasa de ahí no se paga. Esta semana es de ensayo: este descuento <b>no se aplica</b>, es para que veas cómo va a funcionar.`
    : `Cada turno tiene ${c.gracia_pantalla_min} min sin compartir pantalla y ${c.gracia_camara_min} min sin cámara de gracia. Lo que pasa de ahí no se paga.`;

  const fila = (k: string, v: string, color?: string, borde = true) =>
    `<tr><td style="padding:12px 16px;font-size:14px;color:#6b7183;${borde ? "border-bottom:1px solid #e7e9f0;" : ""}">${k}</td><td style="padding:12px 16px;font-size:14px;font-weight:700;text-align:right;font-variant-numeric:tabular-nums;${color ? `color:${color};` : ""}${borde ? "border-bottom:1px solid #e7e9f0;" : ""}">${escapar(v)}</td></tr>`;

  const graciaP = c.extra_pantalla_min > 0 ? `${c.gracia_pantalla_min} (incluye ${c.extra_pantalla_min} de RR. HH.)` : `${c.gracia_pantalla_min}`;
  const graciaC = c.extra_camara_min > 0 ? `${c.gracia_camara_min} (incluye ${c.extra_camara_min} de RR. HH.)` : `${c.gracia_camara_min}`;

  const filas = [
    fila("Empleado", `${c.nombre}${c.rol ? " · " + c.rol : ""}`),
    fila("Turno", `${fechaCorta(c.turno)} · ${hhmm(c.inicio)}–${hhmm(c.fin)}`),
    fila("Conectado", formatoMin(c.conectado_min)),
    fila("En pausa (comida y baño)", formatoMin(c.pausa_min)),
    fila(`Sin pantalla · gracia ${graciaP} min`, formatoMin(c.sin_pantalla_min), ex.pantalla > 0 ? rojo : undefined),
    fila(`Sin cámara · gracia ${graciaC} min`, formatoMin(c.sin_camara_min), ex.camara > 0 ? rojo : undefined),
    fila("A pagar", formatoMin(c.a_pagar_min), "#0f8a5f"),
    fila(c.ensayo ? "Descuento (ensayo, no se aplica)" : "Descuento", formatoMin(c.descuento_min), c.descuento_min > 0 ? rojo : undefined, false),
  ].join("");

  return `<!doctype html><html><body style="margin:0;background:#eef1f6;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f1222">
<div style="max-width:600px;margin:0 auto;padding:28px 16px 40px">
  <div style="background:#fff;border:1px solid #e7e9f0;border-radius:18px;overflow:hidden">
    <div style="height:5px;background:${morado}"></div>
    <div style="padding:28px 30px">
      <div style="margin-bottom:22px"><b style="font-size:15px">Maven</b><div style="font-size:12px;color:#6b7183">Argos · Control de asistencia</div></div>
      ${chip}
      <h1 style="font-size:22px;line-height:1.25;margin:14px 0 6px;font-weight:800">${titulo}</h1>
      <p style="font-size:14px;color:#6b7183;margin:0 0 22px;line-height:1.5">${explicacion}</p>
      <div style="background:#f6f7fb;border:1px solid #e7e9f0;border-radius:14px;padding:16px 18px;margin-bottom:22px">
        <span style="font-size:40px;font-weight:800;color:${c.descuento_min > 0 ? rojo : "#0f8a5f"};line-height:1;font-variant-numeric:tabular-nums">${formatoMin(c.descuento_min)}</span>
        <span style="font-size:13px;color:#6b7183;font-weight:600;margin-left:8px">${c.descuento_min > 0 ? "sin pagar en este turno" : "de descuento"}</span>
      </div>
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border:1px solid #e7e9f0;border-radius:14px;border-collapse:separate;overflow:hidden;margin-bottom:20px">${filas}</table>
      <p style="font-size:13px;color:#6b7183;margin:0;line-height:1.5">Si fue por una falla (por ejemplo, se dañó la cámara), habla con RR. HH.: puede devolver los minutos y te llega la corrección.</p>
    </div>
    <div style="text-align:center;padding:18px;font-size:11.5px;color:#9aa0b2;background:#f6f7fb;border-top:1px solid #e7e9f0">Maven · generado automáticamente por Argos</div>
  </div>
</div></body></html>`;
}

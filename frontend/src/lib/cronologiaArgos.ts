// La CRONOLOGÍA del día de una persona (Alvaro, 18/11/2026: «cómo vergas voy a
// ver qué hizo»). Convierte los pantallazos sueltos del día en TRAMOS seguidos
// —trabajando, sin cámara, sin pantalla, fuera de lugar, sin capturas— más la
// llegada tarde, para leerlo como un chat: lo malo grande y con su prueba, lo
// bueno en una línea.
//
// Es pura (sin React ni Supabase) para poder probarla.

import type { CapturaDia } from "@/hooks/useExpedienteEmpleado";

export type EstadoTramo = "ok" | "sinCamara" | "sinPantalla" | "fuera" | "sinCapturas" | "tarde";

export interface Tramo {
  estado: EstadoTramo;
  desde: number;   // ms
  hasta: number;   // ms
  capturas: CapturaDia[];
}

/** Cada cuánto se agrupan los pantallazos (Argos toma ~1 por minuto). */
const BALDE_MS = 2 * 60_000;
/** Más de esto sin ninguna captura es un hueco (pausa, sin conexión o fuera). */
const HUECO_MS = 6 * 60_000;
/** Un «sin cámara» o «sin pantalla» más corto que esto es ruido de captura
 *  (la foto de la cámara cayó en el minuto de al lado): se suma al tramo de
 *  antes. «Fuera de lugar» nunca se esconde. */
const MIN_LEVE_MS = 3 * 60_000;
/** Tolerancia de llegada: igual que la Asistencia del Expediente. */
const TOLERANCIA_TARDE_MIN = 5;

function estadoDelBalde(caps: CapturaDia[]): EstadoTramo {
  const pant = caps.filter((c) => c.tipo === "pantalla");
  const cams = caps.filter((c) => c.tipo === "camara");
  if (pant.some((c) => c.fueraDeLugar === true && !c.perdonado)) return "fuera";
  if (pant.length === 0) return "sinPantalla";
  if (cams.length === 0 || cams.every((c) => c.caraVisible === false)) return "sinCamara";
  return "ok";
}

/** «08:00» + el día → ms de esa hora en Bogotá (UTC−5, sin horario de verano). */
export function msDeHoraBogota(fecha: string, hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const ms = Date.parse(`${fecha}T${m[1].padStart(2, "0")}:${m[2]}:00-05:00`);
  return Number.isFinite(ms) ? ms : null;
}

export function armarTramos(
  capturas: CapturaDia[],
  opts: { fecha: string; entroAt?: string | null; horarioEntrada?: string | null },
): Tramo[] {
  const orden = [...capturas]
    .filter((c) => Number.isFinite(Date.parse(c.createdAt)))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  // 1) Baldes de 2 minutos.
  const baldes = new Map<number, CapturaDia[]>();
  for (const c of orden) {
    const k = Math.floor(Date.parse(c.createdAt) / BALDE_MS);
    const lista = baldes.get(k);
    if (lista) lista.push(c); else baldes.set(k, [c]);
  }

  // 2) Tramos seguidos, con huecos donde no hubo capturas.
  const crudos: Tramo[] = [];
  let finPrevio: number | null = null;
  for (const [k, caps] of [...baldes.entries()].sort((a, b) => a[0] - b[0])) {
    const desde = k * BALDE_MS;
    const hasta = desde + BALDE_MS;
    if (finPrevio != null && desde - finPrevio > HUECO_MS) {
      crudos.push({ estado: "sinCapturas", desde: finPrevio, hasta: desde, capturas: [] });
    }
    const estado = estadoDelBalde(caps);
    const ult = crudos[crudos.length - 1];
    if (ult && ult.estado === estado && (finPrevio == null || desde - finPrevio <= HUECO_MS)) {
      ult.hasta = hasta;
      ult.capturas.push(...caps);
    } else {
      crudos.push({ estado, desde: finPrevio != null && desde - finPrevio <= HUECO_MS ? finPrevio : desde, hasta, capturas: [...caps] });
    }
    finPrevio = hasta;
  }

  // 3) El ruido corto se suma al tramo de antes (y se vuelven a unir iguales).
  const limpios: Tramo[] = [];
  for (const tr of crudos) {
    const leve = tr.estado === "sinCamara" || tr.estado === "sinPantalla";
    const prev = limpios[limpios.length - 1];
    if (leve && prev && tr.hasta - tr.desde < MIN_LEVE_MS) {
      prev.hasta = tr.hasta;
      prev.capturas.push(...tr.capturas);
      continue;
    }
    if (prev && prev.estado === tr.estado) {
      prev.hasta = tr.hasta;
      prev.capturas.push(...tr.capturas);
      continue;
    }
    limpios.push({ ...tr, capturas: [...tr.capturas] });
  }

  // 4) La llegada tarde, al principio.
  const inicio = opts.horarioEntrada ? msDeHoraBogota(opts.fecha, opts.horarioEntrada) : null;
  const entro = opts.entroAt ? Date.parse(opts.entroAt) : NaN;
  if (inicio != null && Number.isFinite(entro) && entro - inicio > TOLERANCIA_TARDE_MIN * 60_000) {
    limpios.unshift({ estado: "tarde", desde: inicio, hasta: entro, capturas: [] });
  }
  return limpios;
}

/** Minutos de un tramo, redondeados (mínimo 1). */
export function minutosDe(tr: Tramo): number {
  return Math.max(1, Math.round((tr.hasta - tr.desde) / 60_000));
}

/** La frase de Argos más representativa del tramo (la primera pantalla juzgada). */
export function veredictoDe(tr: Tramo): string | null {
  return tr.capturas.find((c) => c.tipo === "pantalla" && c.veredicto)?.veredicto ?? null;
}

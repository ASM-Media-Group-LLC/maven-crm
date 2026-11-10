// MEDIDOR DEL NAS (Alvaro, 10/11/2026): qué tan lleno está, cuánto falta y qué
// ocupa más. Los números vienen de la RPC nas_espacio_resumen (muestras reales
// del disco que deja la edge drive-aporte-nas cada hora). Acá solo la lógica
// pura del bloque, sin React: se prueba en test/centro/espacioNas.test.ts.

export interface ResumenNas {
  sin_muestras?: boolean;
  medido_at: string;
  total: number;
  libre: number;
  usado: number;
  /** Lo que queda antes del 95 % (el NAS no deja usar el último 5 % de cada disco). */
  util_restante: number;
  discos: { total: number; libre: number }[];
  /** Bytes por semana. */
  ritmo_semana: number | null;
  /** «disco» = medido con muestras reales (≥ 7 días); «drive» = lo que entró al Drive en 28 días. */
  ritmo_fuente: "disco" | "drive";
  semanas_para_llenarse: number | null;
  fecha_llena: string | null;
  /** null en unidad = «Mi unidad» de cada persona. */
  que_ocupa: { unidad: string | null; bytes: number; archivos: number }[];
  alertas: { nivel: number; avisado_at: string }[];
}

/** Marcas de la barra: el aviso (80 %), el urgente (90 %) y el tope real (95 %). */
export const ALERTA_PCT = 80;
export const URGENTE_PCT = 90;
export const LLENO_PCT = 95;

export function pctUsado(r: Pick<ResumenNas, "usado" | "total">): number {
  return r.total > 0 ? (r.usado / r.total) * 100 : 0;
}

export type TonoNas = "ok" | "atento" | "urgente";
export function tonoDelNas(pct: number): TonoNas {
  if (pct >= URGENTE_PCT) return "urgente";
  if (pct >= ALERTA_PCT) return "atento";
  return "ok";
}

/** «34,1 TB» / «59,9 GB» con el separador del idioma. Decimal (1 TB = 10¹² B),
 *  como lo cuentan los discos. */
export function tamanoNas(bytes: number, idioma: string): string {
  const loc = idioma === "es" ? "es-CO" : "en-US";
  const b = Math.max(0, Number(bytes) || 0);
  const [n, u] = b >= 1e12 ? [b / 1e12, "TB"] : b >= 1e9 ? [b / 1e9, "GB"] : [b / 1e6, "MB"];
  return `${n.toLocaleString(loc, { maximumFractionDigits: n < 100 ? 1 : 0 })} ${u}`;
}

/** Cuánto falta, en la unidad que se entiende de un vistazo. null = no crece. */
export function cuantoFalta(semanas: number | null): { n: number; unidad: "semanas" | "meses" | "anios" } | null {
  if (semanas == null || !Number.isFinite(semanas) || semanas <= 0) return null;
  if (semanas < 9) return { n: Math.max(1, Math.round(semanas)), unidad: "semanas" };
  if (semanas < 104) return { n: Math.round(semanas / 4.345), unidad: "meses" };
  return { n: Math.round((semanas / 52.18) * 10) / 10, unidad: "anios" };
}

/** Cada unidad como parte de lo usado (para la barra de «qué ocupa más»). */
export function partesDeLoUsado(r: Pick<ResumenNas, "que_ocupa" | "usado">) {
  const usado = Math.max(1, r.usado);
  return r.que_ocupa.map((u) => ({ ...u, pct: (u.bytes / usado) * 100 }));
}

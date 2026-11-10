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
  /** El más alto de los dos (conservador): «anual» = promedio del último año en el
   *  Drive; «disco» = medido en el disco con ≥ 30 días de muestras. */
  ritmo_fuente: "disco" | "anual";
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

// ── Página completa (nas_historia / nas_entro_semana / nas_por_modelo / nas_que_liberar) ──

export interface HistoriaNas {
  /** TB acumulados por mes según la fecha de cada archivo (últimos 24 meses). */
  meses: { mes: string; bytes: number; total: number }[];
  /** Mediciones reales del disco (una por día). */
  muestras: { dia: string; usado: number; total: number }[];
}

export interface EntroSemana {
  total: { bytes: number; archivos: number };
  por_dia: { dia: string; bytes: number; archivos: number }[];
  /** Lo que subió el equipo (sin lo que llegó por los links de las modelos). */
  por_persona: { nombre: string | null; bytes: number; archivos: number }[];
  /** Lo que mandaron las modelos por su link. */
  por_modelo: { nombre: string; padre: string | null; carpeta_id: string; bytes: number; archivos: number; pidio: string | null }[];
}

export interface PorModelo {
  modelos: { nombre: string; carpetas: number; bytes: number; archivos: number }[];
  cuantas: number;
  /** Lo que está en carpetas con el nombre de una modelo. */
  atribuido: number;
  usado: number;
}

export interface QueLiberar {
  copias: { grupos: number; copias_de_mas: number; bytes: number };
  top: { nombre: string; size: number; copias: number; recupera: number; unidades: string[] }[];
  /** Lo tirado uno por uno + TODO lo que está debajo de una carpeta tirada. */
  papelera: { bytes: number; archivos: number };
  /** Las carpetas tiradas más pesadas (siguen ocupando disco hasta vaciar la papelera). */
  carpetas_tiradas?: { id: string; nombre: string; padre: string | null; tirada: string; por: string | null; bytes: number; archivos: number }[];
}

/** «ene 25» / «Jan 25» para el eje de la gráfica. */
export function mesCorto(mes: string, idioma: string): string {
  const [a, m] = mes.split("-").map(Number);
  if (!a || !m) return mes;
  const nombre = new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString(idioma === "es" ? "es-CO" : "en-US", { month: "short", timeZone: "UTC" });
  return `${nombre.replace(".", "")} ${String(a).slice(2)}`;
}

/** Los puntos de la gráfica en TB (lo acumulado y lo que entró ese mes). */
export function puntosDeHistoria(h: Pick<HistoriaNas, "meses">, idioma: string) {
  return h.meses.map((m) => ({ mes: mesCorto(m.mes, idioma), tb: m.total / 1e12, entro: m.bytes / 1e12 }));
}

/** Nombre de la carpeta de la modelo con la de arriba cuando la del link es genérica
 *  («YOISNIA › SCRIPT»): sin eso «SCRIPT» no dice de quién es. */
export function nombreConPadre(nombre: string, padre: string | null | undefined): string {
  return padre && !/^contenido\b/i.test(padre) ? `${padre} › ${nombre}` : nombre;
}

// ── Área del NAS (nas_explorar / nas_por_tipo / nas_mas_pesados / nas_ficha) ──

export interface CarpetaNas { id: string; nombre: string; bytes: number; archivos: number; carpetas: number; ultimo: string | null }
export interface ArchivoNas { id: string; nombre: string; size: number | null; mime: string | null; creado: string }

export interface ExplorarNas {
  /** null = la raíz del Drive. */
  carpeta: { id: string; nombre: string } | null;
  /** De la raíz hacia abajo, sin la raíz y CON la carpeta actual. */
  ruta: { id: string; nombre: string }[];
  /** Las carpetas de este nivel, de la más pesada a la menos. */
  hijos: CarpetaNas[];
  /** Los 100 archivos sueltos más pesados de este nivel. */
  sueltos: ArchivoNas[];
  sueltos_total: { bytes: number; archivos: number };
  total: { bytes: number; archivos: number };
}

export type TipoNas = "video" | "foto" | "audio" | "documento" | "comprimido" | "otro";
export interface PorTipoNas {
  tipos: { tipo: TipoNas; bytes: number; archivos: number; extensiones: { ext: string; bytes: number; archivos: number }[] }[];
}

export interface MasPesadosNas {
  archivos: { id: string; nombre: string; size: number; carpeta_id: string | null; carpeta: string | null; unidad: string | null; dueno: string | null; creado: string; tipo: TipoNas }[];
}

export interface FichaNas {
  archivos: number; carpetas: number; unidades: number; personas: number; links_modelos: number;
  desde: string | null;
  nas: { caido: boolean; desde: string | null; actualizado: string } | null;
}

/** Qué parte del nivel ocupa cada carpeta (para su barrita). */
export function pctDelNivel(bytes: number, total: number): number {
  return total > 0 ? (bytes / total) * 100 : 0;
}

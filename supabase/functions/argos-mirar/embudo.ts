// EL EMBUDO DE ARGOS (Alvaro, 17/11 aprobado; 19/11 «prender ya así»).
//
// Lógica pura (sin red ni base): qué hace el juez con cada pantallazo según lo
// que dijeron los filtros gratis (SQL argos_embudo_filtros), la IA chica y el
// tope de gasto del día. La usa index.ts y la prueban embudo.test.ts y la
// guarda del frontend (test/argosEmbudo.test.ts).
//
//   1) igual      → copia el veredicto anterior (gratis)
//   2) lista      → «trabajo» por la app/página aprobada (gratis)
//      contenedor → escritorio remoto o app que muestra cualquier cosa adentro:
//                   a la IA chica, nunca aprobada por el nombre
//   3) IA chica   → «sí» = trabajo; «no» / «no sé» / error → Argos detallado
//   4) Argos detallado, y además una revisión al azar (10 %) de lo que el
//      embudo dio por bueno (filtros 1–3) para medir escapadas.
//
// TOPE DEL DÍA (monitor_config.argos_tope_dia_usd, USD 1,50): nunca se pide una
// mirada que lo pase. Desde el 70 % del tope, modo ahorro: sin revisión al azar,
// la IA chica decide sola («no sé» = sin falta, como Argos ante la duda) y
// Argos detallado solo mira los «no» seguros. Si la detallada no cabe, queda lo
// que dijo la chica; si no cabe ni la chica, la foto queda sin juzgar.
//
// Con el interruptor apagado (monitor_config.argos_filtros_activos=false) o sin
// la migración aplicada, TODO va directo a Argos detallado, como antes (el tope
// sigue valiendo si está puesto).

export type Filtro = "igual" | "lista" | "contenedor" | null;
export type RespuestaChica = "si" | "no" | "no_se";
export type JuzgadaPor = "argos" | "argos_azar" | "ia_chica" | "filtro_igual" | "filtro_lista";
export type FiltroDecia =
  | "igual"
  | "lista"
  | "ia_chica_si"
  | "ia_chica_no"
  | "ia_chica_no_se"
  | "ia_chica_error";

/** Lo que el SQL argos_embudo_filtros devuelve para una foto. */
export interface FiltroFoto {
  id: string;
  filtro: Filtro;
  prev_veredicto: string | null;
  prev_fuera: boolean | null;
  app: string | null;
  titulo: string | null;
  lista_nota: string | null;
}

export interface ConfigEmbudo {
  /** La migración está aplicada (monitor_config trae argos_filtros_activos). */
  listo: boolean;
  activos: boolean;
  /** 0–1: probabilidad de mandar a Argos detallado algo que el embudo dio por bueno. */
  azar: number;
}

export const AZAR_POR_DEFECTO = 0.1;
/** Desde esta fracción del tope del día se entra en modo ahorro. */
export const FRACCION_AHORRO = 0.7;

/** Lee la fila de monitor_config (select *) sin suponer que la migración ya está. */
export function configEmbudo(cfg: Record<string, unknown> | null | undefined): ConfigEmbudo {
  const listo = !!cfg && typeof cfg.argos_filtros_activos === "boolean";
  const crudo = cfg?.argos_revision_azar;
  const azarCrudo = crudo === null || crudo === undefined ? NaN : Number(crudo);
  const azar = Number.isFinite(azarCrudo) ? Math.min(1, Math.max(0, azarCrudo)) : AZAR_POR_DEFECTO;
  return { listo, activos: listo && cfg!.argos_filtros_activos === true, azar };
}

/** Lo que se escribe en monitor_capturas sin llamar a Argos detallado. */
export interface Salto {
  veredicto: string;
  fuera_de_lugar: boolean;
  juzgada_por: JuzgadaPor;
  filtro_decia: FiltroDecia;
}

export type PasoArgos = {
  tipo: "argos";
  juzgada_por: "argos" | "argos_azar";
  filtro_decia: FiltroDecia | null;
  /** Revisión al azar: lo que decía el filtro, por si la detallada no cabe en el tope. */
  respaldo?: Salto;
};
export type Paso =
  /** Se escribe sin IA detallada (filtros 1–2, o la chica decidió). */
  | { tipo: "saltar"; salto: Salto }
  /** Pasa a la IA chica (filtro 3). */
  | { tipo: "ia_chica" }
  /** Argos detallado; juzgada_por y filtro_decia para anotar en la fila. */
  | PasoArgos;

export interface Chica {
  respuesta: RespuestaChica;
  sistema: string;
}

/** Frase que se guarda cuando decide la lista: el sistema por delante, como Argos. */
export function veredictoLista(f: Pick<FiltroFoto, "lista_nota" | "app" | "titulo">): string {
  const sistema = (f.lista_nota || f.app || f.titulo || "App de trabajo").trim();
  return `${sistema} · app de trabajo de la lista aprobada`;
}

/** Frase cuando decide la IA chica. */
export function veredictoChica(r: Chica): string {
  const s = r.sistema.trim();
  const que = r.respuesta === "no" ? "fuera de lugar (revisión rápida)" : "herramienta de trabajo (revisión rápida)";
  return s ? `${s} · ${que}` : que.charAt(0).toUpperCase() + que.slice(1);
}

/** Lo que se guarda cuando la IA chica decide sola. */
export function saltoChica(r: Chica): Salto {
  return {
    veredicto: veredictoChica(r),
    fuera_de_lugar: r.respuesta === "no",
    juzgada_por: "ia_chica",
    filtro_decia: r.respuesta === "si" ? "ia_chica_si" : r.respuesta === "no" ? "ia_chica_no" : "ia_chica_no_se",
  };
}

/**
 * Paso 1–2: con lo que dijo el SQL, ¿se salta, va a la IA chica o a Argos?
 * `tiro` es un número al azar en [0, 1) (Math.random en la edge).
 */
export function pasoInicial(cfg: ConfigEmbudo, f: FiltroFoto | undefined, tiro: number, ahorro = false): Paso {
  if (!cfg.activos) return { tipo: "argos", juzgada_por: "argos", filtro_decia: null };
  const filtro = f?.filtro ?? null;
  const azar = !ahorro && tiro < cfg.azar;
  if (f && filtro === "igual" && f.prev_veredicto) {
    const salto: Salto = {
      veredicto: f.prev_veredicto,
      fuera_de_lugar: f.prev_fuera === true,
      juzgada_por: "filtro_igual",
      filtro_decia: "igual",
    };
    if (azar) return { tipo: "argos", juzgada_por: "argos_azar", filtro_decia: "igual", respaldo: salto };
    return { tipo: "saltar", salto };
  }
  if (f && filtro === "lista") {
    const salto: Salto = { veredicto: veredictoLista(f), fuera_de_lugar: false, juzgada_por: "filtro_lista", filtro_decia: "lista" };
    if (azar) return { tipo: "argos", juzgada_por: "argos_azar", filtro_decia: "lista", respaldo: salto };
    return { tipo: "saltar", salto };
  }
  // contenedor / escritorio remoto, sin app conocida o pantalla distinta → IA chica.
  return { tipo: "ia_chica" };
}

/** Paso 3–4: con la respuesta de la IA chica (null = falló), ¿listo o Argos? */
export function despuesDeChica(cfg: ConfigEmbudo, r: Chica | null, tiro: number, ahorro = false): Exclude<Paso, { tipo: "ia_chica" }> {
  if (!r) return { tipo: "argos", juzgada_por: "argos", filtro_decia: "ia_chica_error" };
  if (r.respuesta === "si") {
    if (!ahorro && tiro < cfg.azar) return { tipo: "argos", juzgada_por: "argos_azar", filtro_decia: "ia_chica_si" };
    return { tipo: "saltar", salto: saltoChica(r) };
  }
  if (r.respuesta === "no_se" && ahorro) return { tipo: "saltar", salto: saltoChica(r) };
  return { tipo: "argos", juzgada_por: "argos", filtro_decia: r.respuesta === "no" ? "ia_chica_no" : "ia_chica_no_se" };
}

/**
 * Argos detallado no cabe en el tope: queda lo que decía el filtro (revisión al
 * azar) o lo que dijo la IA chica. null = nadie miró la foto → sin juzgar.
 */
export function saltoSinPresupuesto(paso: PasoArgos, r: Chica | null): Salto | null {
  if (paso.respaldo) return paso.respaldo;
  return r ? saltoChica(r) : null;
}

/** Lee la respuesta de la IA chica: {"trabajo":"si|no|no_se","sistema":"..."}. */
export function parsearChica(text: string): Chica | null {
  const i = text.indexOf("{");
  const j = text.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try {
    const p = JSON.parse(text.slice(i, j + 1));
    const t = String(p.trabajo ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, "_");
    const respuesta: RespuestaChica | null = t === "si" ? "si" : t === "no" ? "no" : t === "no_se" || t === "nose" ? "no_se" : null;
    if (!respuesta) return null;
    return { respuesta, sistema: String(p.sistema ?? "").trim().slice(0, 80) };
  } catch {
    return null;
  }
}

/** Campos extra de la fila juzgada por Argos detallado (solo con la migración puesta). */
export function camposArgos(cfg: ConfigEmbudo, p: PasoArgos): Record<string, string | null> {
  if (!cfg.listo) return {};
  return { juzgada_por: p.juzgada_por, filtro_decia: p.filtro_decia };
}

/**
 * El tope de gasto del día. Se arma con lo ya gastado hoy (argos_gasto_hoy) y
 * cada mirada se RESERVA antes de pedirla: si no cabe, no se pide. Las
 * miradas de la ronda corren en paralelo, pero JS no corta entre leer y sumar,
 * así que la reserva no se pisa. Una mirada que falla devuelve su reserva.
 */
export class Presupuesto {
  private gastado: number;
  constructor(gastadoHoy: number, readonly tope: number | null) {
    this.gastado = Number.isFinite(gastadoHoy) && gastadoHoy > 0 ? gastadoHoy : 0;
  }
  get usd(): number {
    return this.gastado;
  }
  /** Cerca del tope: sin revisión al azar y la IA chica decide sola. */
  get ahorro(): boolean {
    return this.tope !== null && this.gastado >= this.tope * FRACCION_AHORRO;
  }
  /** true = cabe y quedó reservada. */
  reservar(costo: number): boolean {
    if (this.tope !== null && this.gastado + costo > this.tope + 1e-9) return false;
    this.gastado += costo;
    return true;
  }
  liberar(costo: number): void {
    this.gastado = Math.max(0, this.gastado - costo);
  }
}

/** Lee lo que devuelve argos_gasto_hoy (o null si la consulta falló / no hay migración). */
export function presupuestoDe(
  r: { usd?: unknown; tope?: unknown; precio_foto?: unknown; precio_chica?: unknown } | null | undefined,
  cfg: Record<string, unknown> | null | undefined,
): { presupuesto: Presupuesto; precioFoto: number; precioChica: number } {
  const num = (v: unknown, d: number) => {
    const n = v === null || v === undefined || v === "" ? NaN : Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const precioFoto = num(r?.precio_foto, 0.0022);
  const precioChica = num(r?.precio_chica, num(cfg?.argos_precio_chica_usd, 0.0003));
  // El tope sale de monitor_config; si el gasto de hoy no se pudo leer y hay
  // tope, se asume el tope ya alcanzado (no se gasta a ciegas).
  const topeCrudo = cfg?.argos_tope_dia_usd;
  const tope = topeCrudo === null || topeCrudo === undefined ? null : num(topeCrudo, NaN);
  const topeOk = tope !== null && Number.isFinite(tope) ? tope : null;
  const gastado = r ? num(r.usd, topeOk ?? 0) : (topeOk ?? 0);
  return { presupuesto: new Presupuesto(gastado, topeOk), precioFoto, precioChica };
}

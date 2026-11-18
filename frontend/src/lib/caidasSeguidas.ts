// «TU INTERNET SE ESTÁ CORTANDO SEGUIDO» (Alvaro, 17/11/2026: «aviso automático
// a la persona y su supervisor»).
//
// El 16/11 una sola chatter puso 36 de las 37 caídas del día. Nadie se enteraba:
// ella creía que la llamada «se cae sola» y su supervisor no lo veía en el hub.
// Esto NO castiga a nadie: solo lo hace visible, a ella y a quien la supervisa.
//
//  1. A LA PERSONA, en su llamada: con 3 caídas suyas en 30 minutos sale un
//     cartel amable con un consejo y la guía de conexión (/conexion). Una vez por
//     hora como mucho. La cuenta la lleva SU navegador (no la base): así funciona
//     aunque el internet esté tan mal que el corte ni llegue a anotarse.
//  2. A SU SUPERVISOR, en el hub de Cowork: un chip «Internet inestable · N
//     caídas» con 3 caídas o más en la última hora (lo cuenta la base, con la
//     RPC cowork_caidas_recientes; ver hooks/useCaidasDelEquipo.ts).
//
// QUÉ ES UNA CAÍDA: la fase «caida» de llamada_cortes, y nada más.
//  · «caida» abre cada episodio en que la llamada se cayó de verdad (la que
//    anota useLiveKit en el Disconnected). Si la vuelta automática también
//    falla, el MISMO episodio cierra con «reentrada_agotada»: contarla sería
//    contar dos veces la misma caída.
//  · Los parpadeos (parpadeo / parpadeo_ok) los cura LiveKit en segundos sin
//    sacar a nadie: no son caídas.
//  · «recarga» es la página que se recargó, no el internet.
//  · Con el equipo dormido la fase llega como «equipo_dormido» (faseSegunSueno):
//    eso tampoco es el internet.
//
// LOS NÚMEROS (medidos en producción, 7 días al 17/11/2026): 16 personas tuvieron
// alguna caída, pero solo 3 llegaron a 3 caídas en 30 minutos (y las mismas 3 en
// 60). El máximo fue 4 en 30 minutos y 5 en una hora. Con 3 se encuentra a
// quien tiene el problema sin molestar a quien se cayó una vez.

import { useSyncExternalStore } from "react";

/** La única fase que cuenta como caída (ver arriba por qué no las demás). */
export const FASE_DE_CAIDA = "caida";

/** Cuántas caídas propias hacen falta para avisarle a la persona… */
export const CAIDAS_PARA_AVISAR = 3;
/** …dentro de esta ventana. */
export const VENTANA_DE_LA_PERSONA_MS = 30 * 60_000;
/** A la persona se le avisa una vez por hora como mucho. */
export const AVISO_A_LA_PERSONA_CADA_MS = 60 * 60_000;
/** El cartel se va solo pasado este tiempo (o antes, si lo cierra). */
export const AVISO_VISIBLE_MS = 5 * 60_000;
/** Tope de marcas guardadas: una conexión que va y viene no llena el almacén. */
const MAX_MARCAS = 50;

/** Desde cuántas caídas en la ventana del hub sale el chip del supervisor. */
export const CAIDAS_PARA_EL_CHIP = 3;
/** La ventana del chip, en minutos (va tal cual a la RPC). */
export const VENTANA_DEL_CHIP_MIN = 60;
/** El hub vuelve a leer las caídas cada 2 minutos, y solo con la pestaña a la vista. */
export const LEER_CAIDAS_CADA_MS = 2 * 60_000;
/** Holgura del reloj: un intervalo que llega unos ms antes no se salta una lectura. */
const HOLGURA_LECTURA_MS = 5_000;

export function cuentaComoCaida(fase: string): boolean {
  return fase === FASE_DE_CAIDA;
}

/** Las marcas que siguen dentro de la ventana (las del futuro, por un reloj que
 *  se movió, se descartan: si no, no saldrían nunca). */
export function dentroDeLaVentana(marcas: readonly number[], ahora: number, ventanaMs = VENTANA_DE_LA_PERSONA_MS): number[] {
  return marcas.filter((m) => Number.isFinite(m) && m <= ahora && ahora - m < ventanaMs);
}

export interface EstadoCaidas {
  /** Cuándo fue cada caída reciente (epoch ms). */
  marcas: number[];
  /** Cuándo se le avisó por última vez (epoch ms), o null si nunca. */
  ultimoAviso: number | null;
}

export const CAIDAS_INICIAL: EstadoCaidas = { marcas: [], ultimoAviso: null };

/** ¿Ya se le avisó en la última hora? */
export function avisoReciente(ultimoAviso: number | null, ahora: number): boolean {
  return ultimoAviso !== null && ultimoAviso <= ahora && ahora - ultimoAviso < AVISO_A_LA_PERSONA_CADA_MS;
}

/** Anota una caída de la persona y dice si toca avisarle AHORA. */
export function anotarCaida(prev: EstadoCaidas, ahora: number): { estado: EstadoCaidas; avisar: boolean } {
  const marcas = [...dentroDeLaVentana(prev.marcas, ahora), ahora].slice(-MAX_MARCAS);
  const avisar = marcas.length >= CAIDAS_PARA_AVISAR && !avisoReciente(prev.ultimoAviso, ahora);
  return { estado: { marcas, ultimoAviso: avisar ? ahora : prev.ultimoAviso }, avisar };
}

// ── Dónde se guarda la cuenta ──────────────────────────────────────────────
// En localStorage, para que una recarga de la página no la ponga en cero ni
// vuelva a mostrar el cartel dentro de la hora. Todo con try/catch: sin
// almacén (ventana privada, bloqueado) se cuenta igual, en memoria.

const CLAVE = "maven.caidasSeguidas.v1";

type Almacen = Pick<Storage, "getItem" | "setItem">;

function almacenLocal(): Almacen | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Lo guardado, o null si no hay almacén o no se pudo leer. */
export function leerCaidas(almacen: Almacen | null = almacenLocal()): EstadoCaidas | null {
  if (!almacen) return null;
  try {
    const crudo = almacen.getItem(CLAVE);
    if (!crudo) return CAIDAS_INICIAL;
    const v = JSON.parse(crudo) as { marcas?: unknown; ultimoAviso?: unknown };
    const marcas = Array.isArray(v.marcas) ? v.marcas.filter((m): m is number => typeof m === "number" && Number.isFinite(m)) : [];
    const ultimoAviso = typeof v.ultimoAviso === "number" && Number.isFinite(v.ultimoAviso) ? v.ultimoAviso : null;
    return { marcas, ultimoAviso };
  } catch {
    return null;
  }
}

export function guardarCaidas(estado: EstadoCaidas, almacen: Almacen | null = almacenLocal()): void {
  if (!almacen) return;
  try {
    almacen.setItem(CLAVE, JSON.stringify(estado));
  } catch { /* sin almacén: queda en memoria */ }
}

// ── El cartel ──────────────────────────────────────────────────────────────
// Un estado chiquito de módulo: lo prende useLiveKit (anotarCorte) y lo lee la
// vista de la llamada. Así useLiveKit solo suma una línea.

let enMemoria: EstadoCaidas = CAIDAS_INICIAL;
let visible = false;
let temporizador: ReturnType<typeof setTimeout> | null = null;
const oyentes = new Set<() => void>();

function avisarOyentes() {
  for (const o of oyentes) o();
}

function fijarVisible(v: boolean) {
  if (temporizador !== null) {
    clearTimeout(temporizador);
    temporizador = null;
  }
  if (v) temporizador = setTimeout(() => fijarVisible(false), AVISO_VISIBLE_MS);
  if (visible === v) return;
  visible = v;
  avisarOyentes();
}

/**
 * Lo llama anotarCorte con la fase YA corregida por el sueño. Cuenta solo las
 * caídas y, si toca, prende el cartel. Devuelve si lo prendió. Nunca tira.
 */
export function registrarCorteParaElAviso(fase: string, ahora = Date.now(), almacen: Almacen | null = almacenLocal()): boolean {
  try {
    if (!cuentaComoCaida(fase)) return false;
    const base = leerCaidas(almacen) ?? enMemoria;
    const { estado, avisar } = anotarCaida(base, ahora);
    enMemoria = estado;
    guardarCaidas(estado, almacen);
    if (avisar) fijarVisible(true);
    return avisar;
  } catch {
    return false;
  }
}

export function cerrarAvisoCaidas(): void {
  fijarVisible(false);
}

export function avisoCaidasVisible(): boolean {
  return visible;
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => { oyentes.delete(oyente); };
}

/** ¿Se muestra el cartel «tu internet se está cortando seguido»? */
export function useAvisoCaidasSeguidas(): boolean {
  return useSyncExternalStore(suscribir, avisoCaidasVisible, () => false);
}

/** Solo para las pruebas: deja el módulo como recién cargado. */
export function reiniciarAvisoCaidas(): void {
  enMemoria = CAIDAS_INICIAL;
  fijarVisible(false);
}

// ── El chip del supervisor ─────────────────────────────────────────────────

/** uid → caídas en la ventana del hub. */
export type CaidasPorPersona = Record<string, number>;

/**
 * Las filas de cowork_caidas_recientes como mapa. null si la respuesta no es una
 * lista: un fallo no es «nadie se cayó».
 */
export function caidasPorPersona(filas: unknown): CaidasPorPersona | null {
  if (!Array.isArray(filas)) return null;
  const out: CaidasPorPersona = {};
  for (const f of filas) {
    if (!f || typeof f !== "object") continue;
    const { user_id, caidas } = f as { user_id?: unknown; caidas?: unknown };
    const n = typeof caidas === "number" ? caidas : typeof caidas === "string" ? Number(caidas) : NaN;
    if (typeof user_id === "string" && Number.isFinite(n) && n > 0) out[user_id] = n;
  }
  return out;
}

/** ¿Lleva el chip «Internet inestable» con estas caídas? */
export function hayChipDeCaidas(caidas: number | null | undefined): caidas is number {
  return typeof caidas === "number" && caidas >= CAIDAS_PARA_EL_CHIP;
}

/** ¿Toca leer otra vez? Solo con la pestaña a la vista y cada 2 minutos como mucho. */
export function tocaLeerCaidas(ahora: number, ultimaLectura: number | null, pestanaVisible: boolean): boolean {
  if (!pestanaVisible) return false;
  return ultimaLectura === null || ahora - ultimaLectura >= LEER_CAIDAS_CADA_MS - HOLGURA_LECTURA_MS;
}

/** Errores que no se arreglan reintentando: sin permiso (42501) o la RPC todavía
 *  no existe en la base (PGRST202, migración sin aplicar). Ahí se deja de leer. */
export function errorSinArreglo(codigo: string | null | undefined): boolean {
  return codigo === "42501" || codigo === "PGRST202";
}

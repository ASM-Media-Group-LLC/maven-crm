// LA PRESENCIA DE COWORK NO REDIBUJA EL HUB SI NADA CAMBIÓ (19/11/2026).
//
// Cada persona de Cowork vuelve a publicar su estado cada ~10 s aunque no haya
// cambiado nada, y cada publicación llega al Supervisor Hub como tres avisos
// (leave + join + sync). Antes, cada aviso armaba objetos NUEVOS para todos y el
// tablero entero (≈3.500 líneas, todas las tarjetas) se redibujaba: con 40
// personas eran varias veces por segundo. Es lo que medía llamada_salud como
// «vendor-radix.js:B» (el motor de React, que vive en ese archivo).
//
// Ahora cada persona que quedó igual conserva su objeto de antes, y si nadie
// cambió se devuelve el MISMO registro: React no redibuja nada. Lo que se ve en
// el tablero es exactamente lo mismo.
//
// El reloj trabajado viaja con la hora en que el servidor lo dijo (`relojEn`), y
// esa hora avanza en cada latido aunque el número que se MUESTRA sea el mismo
// (segundosHoy + lo corrido desde `relojEn`). Por eso el reloj se compara por lo
// que muestra, no campo por campo (lib/coworkReloj.segundosMostrados).
import { cuentaComoTrabajo, ESTADOS_TIEMPO, type EstadoTiempo } from "@/lib/coworkTiempoRegla";

/** Diferencia (s) que se tolera entre lo que mostraría el reloj viejo y el nuevo.
 *  Es el ruido normal del latido (red, redondeo a segundos). */
export const TOLERANCIA_RELOJ_SEG = 1.5;

interface ConReloj {
  relojEstado?: string | null;
  relojSegundosHoy?: number | null;
  relojEn?: number | null;
}

const CAMPOS_RELOJ = new Set(["relojEstado", "relojSegundosHoy", "relojEn"]);
const ESTADOS = new Set<string>(ESTADOS_TIEMPO);

/** ¿Los dos relojes MUESTRAN lo mismo (ahora y en adelante)? */
export function mismoRelojMostrado(a: ConReloj, b: ConReloj): boolean {
  if (a.relojEstado !== b.relojEstado) return false;
  const sa = a.relojSegundosHoy, sb = b.relojSegundosHoy;
  if (typeof sa !== "number" || typeof sb !== "number") return sa === sb && a.relojEn === b.relojEn;
  if (typeof a.relojEn !== "number" || typeof b.relojEn !== "number") return sa === sb && a.relojEn === b.relojEn;
  const corre = !!a.relojEstado && ESTADOS.has(a.relojEstado) && cuentaComoTrabajo(a.relojEstado as EstadoTiempo);
  // Detenido: se muestra el número tal cual, la hora no importa.
  if (!corre) return sa === sb;
  // Corriendo: se muestra segundos + lo corrido desde `en`. Si el nuevo dice lo
  // mismo que ya iba a mostrar el viejo, no hay nada que redibujar.
  return Math.abs((sb - sa) - (b.relojEn - a.relojEn) / 1000) <= TOLERANCIA_RELOJ_SEG;
}

/** Mismo contenido campo por campo (el reloj, por lo que muestra). */
export function mismoEstadoDePresencia<T extends object>(a: T, b: T): boolean {
  if (a === b) return true;
  const ka = Object.keys(a) as Array<keyof T & string>;
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    if (CAMPOS_RELOJ.has(k)) continue;
    if (a[k] !== b[k]) return false;
  }
  return mismoRelojMostrado(a as ConReloj, b as ConReloj);
}

/**
 * El registro nuevo, pero reusando lo de `antes` que no cambió. Si nada cambió
 * (mismas personas, mismo contenido) devuelve `antes` tal cual, y el setState
 * de React no redibuja. Sirve para objetos (el estado de cada persona) y para
 * valores sueltos (el estado de cada supervisor, desde cuándo).
 */
export function registroEstable<V>(antes: Record<string, V>, llegado: Record<string, V>): Record<string, V> {
  if (antes === llegado) return antes;
  const claves = Object.keys(llegado);
  let cambio = claves.length !== Object.keys(antes).length;
  const salida: Record<string, V> = {};
  for (const k of claves) {
    const v = llegado[k];
    const viejo = antes[k];
    if (!(k in antes)) { cambio = true; salida[k] = v; continue; }
    const igual = viejo === v || (
      viejo !== null && v !== null && typeof viejo === "object" && typeof v === "object"
      && mismoEstadoDePresencia(viejo as object, v as object)
    );
    if (igual) salida[k] = viejo;
    else { cambio = true; salida[k] = v; }
  }
  return cambio ? salida : antes;
}

/**
 * El registro por sala con la lista de `clave` puesta, pero el MISMO registro si
 * la lista no cambió (mismos elementos, mismo orden). Para los avisos de las
 * salas del Hub (quién habla, quién comparte, quién está), que LiveKit repite.
 */
export function conLista<T extends string[] | null>(registro: Record<string, T>, clave: string, lista: T): Record<string, T> {
  if (clave in registro) {
    const antes = registro[clave];
    if (antes === lista) return registro;
    if (antes && lista && antes.length === lista.length && antes.every((x, i) => x === lista[i])) return registro;
  }
  return { ...registro, [clave]: lista };
}

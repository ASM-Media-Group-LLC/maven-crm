// PENDIENTES Y SUGERENCIAS (Alvaro, 27/11/2026): qué se muestra y qué se
// escondió. Puro, para probarlo sin navegador.

export interface ItemPendiente {
  clave: "horarios" | "sin_posicion" | "comida_sin_hora" | "turnos_sin_crear" | "turnos_sin_usar";
  tipo: "pendiente" | "sugerencia";
  n: number;
  ruta: string;
}

export interface Ocultos { hoy: boolean; sugerencias: string[] }

const CLAVE_HOY = "maven.pendientes.cerradoA";
const CLAVE_SUG = "maven.pendientes.sugerenciasDespues";
/** «Ahora no» deja una sugerencia escondida una semana. */
const DIAS_SUGERENCIA = 7;

const dia = (d: Date) => d.toISOString().slice(0, 10);

function leer(k: string): string | null {
  try { return window.localStorage.getItem(k); } catch { return null; }
}
function escribir(k: string, v: string) {
  try { window.localStorage.setItem(k, v); } catch { /* sin almacenamiento */ }
}

export function leerOcultos(ahora: Date): Ocultos {
  // 27/11/2026 (Alvaro): la X lo esconde solo 5 minutos; después vuelve a salir
  // mientras quede algo. Guarda la hora en que se cerró.
  const cerradoEn = Number(leer(CLAVE_HOY) ?? "");
  const hoy = Number.isFinite(cerradoEn) && cerradoEn > 0 && ahora.getTime() - cerradoEn < VUELVE_MS;
  let mapa: Record<string, string> = {};
  try { mapa = JSON.parse(leer(CLAVE_SUG) ?? "{}") as Record<string, string>; } catch { mapa = {}; }
  const sugerencias = Object.entries(mapa).filter(([, hasta]) => hasta > dia(ahora)).map(([k]) => k);
  return { hoy, sugerencias };
}

/** Cada cuánto vuelve a salir después de cerrarlo con la X. */
export const VUELVE_MS = 5 * 60_000;

/** La X: lo esconde 5 minutos (y vuelve mientras quede algo). */
export function ocultarHoy(ahora: Date) { escribir(CLAVE_HOY, String(ahora.getTime())); }

export function ocultarSugerencia(clave: string, ahora: Date) {
  let mapa: Record<string, string> = {};
  try { mapa = JSON.parse(leer(CLAVE_SUG) ?? "{}") as Record<string, string>; } catch { mapa = {}; }
  mapa[clave] = dia(new Date(ahora.getTime() + DIAS_SUGERENCIA * 86_400_000));
  escribir(CLAVE_SUG, JSON.stringify(mapa));
}

/** Primero lo pendiente, después las sugerencias; nada si se cerró hoy. */
export function itemsVisibles(items: ItemPendiente[], ocultos: Ocultos): ItemPendiente[] {
  if (ocultos.hoy) return [];
  return items
    .filter((i) => !(i.tipo === "sugerencia" && ocultos.sugerencias.includes(i.clave)))
    .sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "pendiente" ? -1 : 1));
}

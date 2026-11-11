// ¿Esta persona está AHORA en una llamada de Maven que no es su sala de Cowork?
// (una videollamada del Messenger, un Meet, la 1:1 con el coordinador…)
//
// El supervisor de encuadre vive dentro de la llamada de Cowork, que sobrevive
// a navegar — a propósito. Pero cuando la persona atiende una llamada REAL de
// Maven, su cámara se va a esa llamada y el supervisor de Cowork empezaba a
// reclamarle "enciende la cámara / encuádrate" en plena reunión (lo reportó
// Grace, 01/09/2026). Estar en una llamada de la empresa es trabajo, no una
// ausencia: se silencia igual que una pausa marcada.
//
// A diferencia de la pausa (module-level, misma pestaña), las llamadas abren en
// OTRA pestaña (/call/... , Meet). Por eso la marca vive en localStorage como
// un latido con fecha: la pestaña de la llamada lo refresca mientras está
// montada, y la de Cowork lo consulta en cada tic. Si la pestaña de la llamada
// muere de golpe (crash, cierre), el latido caduca solo — sin latido fresco no
// hay silencio, así que un cierre sucio no deja el supervisor mudo para siempre.

const KEY = "mvn_en_llamada_maven";

/** Cada cuánto refresca el latido la pestaña que está en llamada. */
export const LATIDO_LLAMADA_MS = 10_000;

/** Cuánto puede envejecer el latido y seguir contando como "en llamada".
 *  Mayor que el intervalo del latido, para tolerar un tic perdido (pestaña
 *  en segundo plano con timers estrangulados por el navegador). */
export const VIGENCIA_LLAMADA_MS = 45_000;

/** Lo llama la pestaña de la llamada (montaje + cada latido). */
export function latirEnLlamada(ahora: number = Date.now()) {
  try {
    localStorage.setItem(KEY, String(ahora));
  } catch {
    /* modo privado / cuota: sin marca, el supervisor sigue como siempre */
  }
}

/** Lo llama la pestaña de la llamada al desmontar la vista. */
export function salirDeLlamada() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

/** Lo consulta el supervisor de Cowork en cada tic, igual que la pausa. */
export function estaEnLlamadaDeMaven(ahora: number = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const cuando = Number(raw);
    if (!Number.isFinite(cuando)) return false;
    return ahora - cuando < VIGENCIA_LLAMADA_MS;
  } catch {
    return false;
  }
}

// Y en el SERVIDOR (Alvaro, 11/11: «estar en otra llamada de Maven no cuenta
// como salirse de Cowork»). El latido de localStorage solo lo ve el mismo
// navegador; el vigía «fuera de Cowork» corre en la base, así que la llamada
// también deja un latido allá (llamada_maven_latido) cada 30 s. Los registros
// de llamadas no sirven para esto: la mayoría nunca marca su fin.
export const LATIDO_SERVIDOR_MS = 30_000;

type Rpc = { rpc: (f: string, a?: Record<string, unknown>) => PromiseLike<unknown> };

export function latirLlamadaEnServidor(cliente: Rpc, sala: string): void {
  try { void Promise.resolve(cliente.rpc("latir_llamada_maven", { _sala: sala })).catch(() => {}); } catch { /* sin red: el próximo latido */ }
}

export function salirLlamadaEnServidor(cliente: Rpc): void {
  try { void Promise.resolve(cliente.rpc("salir_llamada_maven")).catch(() => {}); } catch { /* caduca solo a los 90 s */ }
}

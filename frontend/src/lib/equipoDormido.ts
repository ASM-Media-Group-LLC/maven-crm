// EL EQUIPO SE DURMIÓ (Alvaro, 17/11/2026).
//
// Un Mac que se duerme se «cae» de la llamada cada vez que despierta un minuto
// (Power Nap, mantenimiento): el 16-17/11 uno solo sumó 36 caídas y 26
// parpadeos, cada 16 minutos exactos toda la noche, el 60 % de los cortes de
// todo el equipo. Maven lo volvía a meter a la sala solo, entraba sin nadie
// delante y a los 45-60 s se volvía a dormir. No era la red: era un equipo
// dormido, y el reloj de Cowork le pagaba esos minutos como «caída».
//
// Cómo se sabe: un reloj que suena cada pocos segundos. Si entre un toque y el
// siguiente pasó más de un minuto de más, el equipo estuvo dormido (con el
// equipo dormido no corre nada). El reloj vive en un Worker (relojesFirmes.ts):
// a los relojes de la página Chrome los adormece en segundo plano (una vez por
// minuto), y eso daría falsos «dormido» con Cowork detrás de otra pestaña.
//
// Qué cambia (useLiveKit.ts y LiveKitCallView.tsx):
//  • El corte se anota con su propia fase (`equipo_dormido`, `…_tras_dormir`),
//    que las métricas de caídas no cuentan.
//  • Maven NO lo vuelve a meter solo: espera a que la persona toque el mouse,
//    el teclado o la pantalla, o vuelva a la pestaña.
//  • Al reloj de Cowork va «dormido»: ese tiempo no se paga.
import { crearRelojesFirmes } from "@/lib/relojesFirmes";

/** Cuánto de más tiene que durar el hueco entre dos toques para decir «se durmió». */
export const SALTO_DE_SUENO_MS = 60_000;
/** Un sueño de hace menos que esto todavía explica un corte (al despertar, la
 *  sala tarda unos segundos en darse por caída). */
export const SUENO_RECIENTE_MS = 3 * 60_000;
/** Cada cuánto suena el reloj. */
export const TOQUE_CADA_MS = 5_000;

export interface Sueno { ms: number }

export interface VigiaDelSueno {
  /** ¿El equipo se durmió hace poco (o está despertando ahora mismo)? */
  durmioHacePoco: () => Sueno | null;
  parar: () => void;
}

interface Relojes {
  setInterval: (fn: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
}

/** El vigía, con el reloj y la hora inyectables para los tests. */
export function crearVigiaDelSueno(o: { ahora?: () => number; relojes?: Relojes; cadaMs?: number } = {}): VigiaDelSueno {
  // La hora de pared: performance.now() en algunos sistemas NO avanza mientras
  // el equipo duerme, y es justo lo que se quiere medir.
  const ahora = o.ahora ?? (() => Date.now());
  const cada = o.cadaMs ?? TOQUE_CADA_MS;
  const relojes: Relojes = o.relojes ?? (() => {
    const firmes = crearRelojesFirmes();
    if (firmes) return { setInterval: (fn, ms) => firmes.setInterval(fn, ms), clearInterval: (id) => firmes.clearInterval(id) };
    return { setInterval: (fn, ms) => window.setInterval(fn, ms), clearInterval: (id) => window.clearInterval(id) };
  })();
  let ultimo = ahora();
  let ultimoSueno: { at: number; ms: number } | null = null;
  const id = relojes.setInterval(() => {
    const t = ahora();
    const hueco = t - ultimo - cada;
    if (hueco > SALTO_DE_SUENO_MS) ultimoSueno = { at: t, ms: hueco };
    ultimo = t;
  }, cada);
  return {
    durmioHacePoco: () => {
      const t = ahora();
      // Recién despierta: el toque que lo delata todavía no sonó.
      const hueco = t - ultimo - cada;
      if (hueco > SALTO_DE_SUENO_MS) return { ms: hueco };
      if (ultimoSueno && t - ultimoSueno.at <= SUENO_RECIENTE_MS) return { ms: ultimoSueno.ms };
      return null;
    },
    parar: () => relojes.clearInterval(id),
  };
}

let vigia: VigiaDelSueno | null = null;

/** El vigía de la pestaña: uno solo, arranca la primera vez que se pide. */
export function vigiaDelSueno(): VigiaDelSueno {
  if (!vigia) vigia = crearVigiaDelSueno();
  return vigia;
}

/** La fase con la que se anota un corte. Si el equipo se durmió, el corte no es
 *  una caída de la llamada: va con su propia fase, que las métricas de caídas
 *  (diagnostico_de_llamada, argos_llamadas_hoy, el vigía de cortes) no cuentan
 *  porque solo cuentan parpadeo_ok, caida, reentrada_agotada y recarga. */
export function faseSegunSueno(fase: string, durmio: boolean): string {
  if (!durmio) return fase;
  if (fase === "caida") return "equipo_dormido";
  if (fase === "parpadeo" || fase === "parpadeo_ok" || fase === "reentrada_agotada" || fase === "reentrada_ok") {
    return `${fase}_tras_dormir`;
  }
  return fase;
}

// «TU INTERNET ESTÁ DÉBIL» (Alvaro, 17/11/2026: «solo avisarle»).
//
// Cuando la conexión de alguien está mala en la llamada, se le avisa con un
// cartel discreto antes de que se corte, para que se acerque al router o use
// cable. Solo se avisa: no se apaga nada (la cámara y la pantalla las manejan sus
// perfiles, lib/perfilDeCamara.ts y lib/perfilDePantalla.ts).
//
// «Mala» es: la calidad de conexión que mide LiveKit en POOR o LOST, o el
// codificador limitado por ancho de banda (qualityLimitationReason "bandwidth").
// Tiene que DURAR para que salga el cartel (un bache de dos segundos no es
// noticia), y se va cuando lleva unos segundos bien, sin parpadear.

/** Cuánto tiene que durar lo malo para que salga el cartel. */
export const DEBIL_SOSTENIDO_MS = 10_000;
/** Cuánto tiene que durar lo bueno para que se vaya. */
export const BIEN_SOSTENIDO_MS = 6_000;
/** Cada cuánto se mira. */
export const MIRAR_DEBIL_CADA_MS = 2_000;

export interface EstadoDebil {
  mostrando: boolean;
  /** Desde cuándo viene mala (o bien, si se está mostrando). */
  desde: number | null;
}

export const DEBIL_INICIAL: EstadoDebil = { mostrando: false, desde: null };

/** El siguiente estado del cartel con la lectura de ahora. */
export function siguienteDebil(prev: EstadoDebil, mala: boolean, ahora: number): EstadoDebil {
  if (!prev.mostrando) {
    if (!mala) return DEBIL_INICIAL;
    const desde = prev.desde ?? ahora;
    return ahora - desde >= DEBIL_SOSTENIDO_MS ? { mostrando: true, desde: null } : { mostrando: false, desde };
  }
  if (mala) return { mostrando: true, desde: null };
  const desde = prev.desde ?? ahora;
  return ahora - desde >= BIEN_SOSTENIDO_MS ? DEBIL_INICIAL : { mostrando: true, desde };
}

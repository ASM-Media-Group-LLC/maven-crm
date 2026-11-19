import { ConnectionQuality, ConnectionState } from "livekit-client";

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

// 18/11/2026 (Alvaro: «cada rato dice que el internet está bajo»; eligió «solo
// si de verdad se corta»). Medido ese día: el codificador «limitado por ancho de
// banda» salía el 22 % del tiempo y es normal (la calidad se acomoda sola), así
// que ya NO cuenta. Solo cuenta la conexión en POOR o LOST, y 20 s seguidos.
//
// 19/11/2026 (Alvaro, ventanita del Hub: «solo cuando de verdad se cae»). Un
// bajón de calidad (POOR) ya NO cuenta: no se muestra nada. Solo cuenta la
// llamada CAÍDA de verdad: reconectando, o conectada pero con la conexión en
// LOST, y sostenido más de 20 s. Desconectada del todo la maneja su propio
// cartel (salaCaida en LiveKitCallView), no este.

/** ¿La llamada está caída de verdad con esta lectura? Lo que alimenta a siguienteDebil. */
export function llamadaCaida(estado: ConnectionState, calidad: ConnectionQuality): boolean {
  if (estado === ConnectionState.Reconnecting || estado === ConnectionState.SignalReconnecting) return true;
  return estado === ConnectionState.Connected && calidad === ConnectionQuality.Lost;
}

/** Cuánto tiene que durar lo malo para que salga el cartel. */
export const DEBIL_SOSTENIDO_MS = 20_000;
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

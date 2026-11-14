// EN SU SALA DE COWORK, EL CHATTER NO RECIBE EL VIDEO DE SUS COMPAÑEROS
// (Alvaro, 13/11/2026).
//
// En una sala de Cowork cada chatter trabaja con cámara y pantalla compartida,
// y LiveKit le mandaba a cada uno el video de TODOS los demás. Nadie lo mira
// —cada quien está en lo suyo— pero se descargaba igual, y en una conexión de
// ~1 Mbps eso compite con lo que esa persona tiene que SUBIR: su cámara, su
// pantalla y su voz. Los parpadeos de la llamada salen de ahí.
//
// Desde ahora, en SU sala de Cowork, el participante:
//   · sigue oyendo a todos (micrófonos y audio de pantallas compartidas);
//   · ve su propia cámara y su propia pantalla, como siempre;
//   · NO se suscribe al video (cámara ni pantalla) de los compañeros: se los
//     muestra como recuadro de nombre, con un rótulo «solo audio».
//
// El video de un SUPERVISOR sí le llega: el coordinador puede transmitir su
// cámara y su pantalla a las salas desde el tablero (identidad `…__monitor…`,
// ver CoworkRoomMonitor) o entrar a la sala como anfitrión (token con
// `isHost: true` en la metadata, ver cowork-session › createLKToken). Eso es
// para que el equipo lo vea; cortarlo dejaría a la sala sin la explicación.
//
// NO cambia nada para quien supervisa (tablero, miniaturas y monitor de salas,
// el Hub, Argos en vivo, el incógnito del admin): esos conectan con su propia
// sala de LiveKit o entran como anfitrión, y reciben todo como hoy. Tampoco
// cambian las llamadas del Messenger, /call/:sala, los meets de Cowork ni las
// llamadas 1:1 con el supervisor.

/** Las salas de Cowork que NO son de trabajo: el Hub, los meets y las 1:1. */
const SALAS_DE_COWORK_QUE_NO_SON_DE_TRABAJO = /^cowork_(hub|meet|1on1)_/;

/** ¿Es la sala de trabajo de Cowork (`cowork_<sesión>_<n>`)? */
export function esSalaDeTrabajoDeCowork(sala: string | null | undefined): boolean {
  return !!sala && sala.startsWith("cowork_") && !SALAS_DE_COWORK_QUE_NO_SON_DE_TRABAJO.test(sala);
}

/**
 * ¿Esta conexión recibe solo el audio de los compañeros? Hacen falta las tres
 * cosas: que la vista lo pida (solo la sala del participante lo pide), que no
 * entre como admin y que la sala sea de trabajo de Cowork. Así, un descuido en
 * quien llama no puede apagarle el video a un supervisor ni a una llamada común.
 */
export function soloAudioDeLosCompaneros(o: { sala: string | null | undefined; sinVideoAjeno?: boolean; isAdmin?: boolean }): boolean {
  return !!o.sinVideoAjeno && !o.isAdmin && esSalaDeTrabajoDeCowork(o.sala);
}

/** ¿Este participante remoto es un supervisor? (su video sí se recibe) */
export function esSupervisorEnLaSala(p: { identity: string; metadata?: string | null }): boolean {
  if (p.identity.includes("__monitor")) return true;
  if (!p.metadata) return false;
  try {
    return (JSON.parse(p.metadata) as { isHost?: unknown } | null)?.isHost === true;
  } catch {
    return false;
  }
}

/** ¿Se recibe esta pista? Todo el audio sí; el video, solo el de un supervisor. */
export function seRecibe(pista: { kind: string }, de: { identity: string; metadata?: string | null }, soloAudio: boolean): boolean {
  if (!soloAudio || pista.kind === "audio") return true;
  return esSupervisorEnLaSala(de);
}

/** Lo mínimo de una sala de LiveKit que hace falta para ajustar las suscripciones. */
export interface SalaConSuscripciones {
  remoteParticipants: Map<string, {
    identity: string;
    metadata?: string | null;
    trackPublications: Map<string, { kind: string; isDesired: boolean; setSubscribed: (s: boolean) => void }>;
  }>;
}

/**
 * Deja cada suscripción como manda `seRecibe`. Solo toca lo que está distinto
 * (`isDesired`), porque cada `setSubscribed` es un mensaje al servidor y esto
 * corre cada pocos segundos como red de seguridad. Devuelve cuántas cambió.
 *
 * La sala del participante se conecta con `autoSubscribe: false`, así que nada
 * llega solo: si este ajuste no corriera, la persona no oiría a nadie. Por eso
 * se llama al conectar, al entrar alguien, al publicar alguien, al reconectar y
 * en el repaso periódico de la lista de participantes.
 */
export function ajustarSuscripciones(sala: SalaConSuscripciones, soloAudio: boolean): number {
  let cambios = 0;
  sala.remoteParticipants.forEach((p) => {
    p.trackPublications.forEach((pub) => {
      const quiere = seRecibe(pub, p, soloAudio);
      if (pub.isDesired === quiere) return;
      try {
        pub.setSubscribed(quiere);
        cambios += 1;
      } catch { /* una publicación que se fue en el medio */ }
    });
  });
  return cambios;
}

import { ScreenSharePresets } from "livekit-client";
import type { ScreenShareCaptureOptions, TrackPublishOptions } from "livekit-client";

// CON QUÉ CALIDAD SE COMPARTE LA PANTALLA, SEGÚN EL INTERNET DE QUIEN COMPARTE.
//
// ── EL PERFIL NORMAL (el de siempre) ─────────────────────────────────────────
//
// Hasta el 18/09 la pantalla se publicaba SIN opciones, así que heredaba el
// `simulcast: true` de publishDefaults, que se escribió pensando en CÁMARAS.
// Para una pantalla, LiveKit arma con eso DOS codificaciones en paralelo —
// 1080p@15 y 540p@15— las dos a resolución alta y a 15 fps, sobre contenido en
// movimiento. Sumadas a las TRES capas de la cámara, son cinco codificaciones
// de video al mismo tiempo en un portátil.
//
// Ninguno de los dos cambios toca la nitidez de la capa principal:
//
//  1. La capa chica pasó de 540p@15 a 360p@3. Sirve para lo mismo —las
//     miniaturas del tablero de Cowork, donde un supervisor mira varias
//     pantallas a la vez— pero cuesta del orden de cinco veces menos.
//     ⚠️ NO se apaga el simulcast del todo, que es lo que uno haría de primera:
//     sin capa chica cada miniatura de Cowork se traería el 1080p entero y el
//     que sufriría sería el supervisor. Se abarata la capa, no se elimina.
//
//  2. `maintain-framerate` le dice al codificador que cuando no dé abasto
//     ACHIQUE la imagen en vez de congelarla. Es exactamente el fallo medido:
//     se aferró a los 540p y se desplomó a 2,5 fps. Una pantalla que se achica
//     se sigue leyendo; una que se congela, no.
//
// 13/11/2026 (Alvaro: «compartir pantalla en modo chiquito se ve todo
// pixelado»): la capa chica a 360p@3 se veía borrosa y a saltos en las
// miniaturas del tablero de supervisión. Subió a 720p@5: se lee en chiquito y
// aun así cuesta menos que el 540p@15 de antes (≈4,6 M px/s contra 7,5 M px/s).
//
// Lo que NO se toca a propósito en el perfil normal: la capa principal sigue en
// 1080p. Bajarla a TODOS les volvería ilegible una hoja de cálculo o un código,
// que es lo que el equipo comparte casi siempre. Solo baja (a 720p) para quien
// tiene la subida floja medida: es el perfil liviano de abajo.
//
// publishDefaults se COMBINA con esto (LocalParticipant hace
// `Object.assign({}, publishDefaults, options)`), así que dtx, red y el códec
// vp8 se heredan igual; acá solo va lo que cambia.
export const PUBLICACION_DE_PANTALLA: TrackPublishOptions = {
  screenShareSimulcastLayers: [ScreenSharePresets.h720fps5],
  degradationPreference: "maintain-framerate",
};

// ── EL PERFIL LIVIANO (13/11/2026, Alvaro) ───────────────────────────────────
//
// 87 cortes en 12 horas, la mayoría parpadeos de gente con ~1 Mbps de subida. El
// perfil normal pide hasta 2,5 Mbps para la capa de 1080p más 0,8 para la de
// 720p: en una subida de 1 Mbps no cabe, el control de congestión empuja, se
// pierden paquetes y la llamada parpadea.
//
// A quien tiene la subida floja se le comparte la pantalla con UNA sola capa de
// 720p a 5 cuadros por segundo y 500 kbps como mucho (≈ una sexta parte):
//
//  · 720p y no 360p/540p: es lo mismo que hoy recibe cada miniatura del tablero
//    (la capa chica del perfil normal), así que el supervisor la ve igual que
//    siempre, y una hoja de cálculo todavía se lee a pantalla completa.
//  · Una sola capa: con 720p arriba, una capa extra más chica (360p@3) volvería
//    a dejar pixeladas las miniaturas, que es lo que Alvaro pidió no hacer.
//    Por eso aquí SÍ se apaga el simulcast: lo más grande que se trae una
//    miniatura es 720p@5, igual que con el perfil normal.
//  · 500 kbps: la pantalla casi quieta (texto) gasta mucho menos; el tope solo
//    muerde al hacer scroll, y con `maintain-framerate` el codificador achica la
//    imagen en vez de congelarla.
//  · La captura misma se pide a 1280×720 y 5 fps: el navegador no captura (ni
//    codifica) píxeles que se van a tirar.
export const PUBLICACION_DE_PANTALLA_LIVIANA: TrackPublishOptions = {
  simulcast: false,
  screenShareEncoding: { maxBitrate: 500_000, maxFramerate: 5 },
  // A 5 cuadros por segundo, cuidar la NITIDEZ (18/11/2026, ver abajo).
  degradationPreference: "maintain-resolution",
};
export const CAPTURA_LIVIANA: Pick<ScreenShareCaptureOptions, "resolution" | "contentHint"> = {
  resolution: { width: 1280, height: 720, frameRate: 5 },
  contentHint: "text",
};

// ── COWORK: TODO EN VIVO, MÁS LIVIANO (Alvaro, 17/11/2026) ───────────────────
//
// En Cowork la pantalla se sigue viendo en vivo y en 1080p (una hoja de cálculo
// tiene que leerse), pero a 5 cuadros por segundo en vez de 15, con el tope de
// bitrate en proporción: 1,2 Mbps en vez de 2,5. Lo que se comparte en Cowork es
// trabajo casi quieto (texto, planillas, chats): 5 fps alcanzan, y es la mitad
// del internet de subida. La capa chica de las miniaturas sigue igual (720p@5).
// El perfil liviano ya estaba en 5 fps y 500 kbps: no cambia. Meet no se toca.
//
// 18/11/2026 (Alvaro: «cuando me comparten pantalla se mira muy pixeleado,
// mejorarlo inmediatamente»). A 5 fps, «maintain-framerate» era lo contrario de
// lo que sirve: cuando el codificador se apuraba (al hacer scroll en un chat)
// ACHICABA la imagen para no perder cuadros, y el texto llegaba pixeleado.
// Ahora, en los perfiles de 5 fps (Cowork y liviano), «maintain-resolution»:
// si se apura, baja cuadros pero NO resolución, así el texto siempre se lee; y
// la captura va marcada como texto (contentHint «text»), que en Chrome activa el
// modo de pantalla del codificador (nítido en letras, barato en lo quieto). Las
// llamadas comunes (15 fps) siguen como estaban: ahí una pantalla congelada es
// peor (el fallo medido del 18/09).
export const PUBLICACION_DE_PANTALLA_COWORK: TrackPublishOptions = {
  screenShareEncoding: { maxBitrate: 1_200_000, maxFramerate: 5 },
  screenShareSimulcastLayers: [ScreenSharePresets.h720fps5],
  degradationPreference: "maintain-resolution",
};
export const CAPTURA_COWORK: Pick<ScreenShareCaptureOptions, "resolution" | "contentHint"> = {
  resolution: { width: 1920, height: 1080, frameRate: 5 },
  contentHint: "text",
};

/** Debajo de esto (subida medida de verdad, en Mbps) se comparte con el perfil liviano. */
export const SUBIDA_PARA_PANTALLA_NORMAL_MBPS = 1.5;
/** Una prueba de velocidad más vieja que esto ya no dice nada del internet de ahora. */
export const PRUEBA_VIGENTE_MS = 60 * 60_000;

export type PerfilDePantalla = "normal" | "liviano";

/**
 * Se decide CADA VEZ que alguien empieza a compartir, con lo último que se sabe:
 *
 *  1. La prueba de velocidad real (lib/pruebaDeRed.ts, en Cowork al entrar y cada
 *     30 min): subida medida por debajo de 1,5 Mbps → liviano.
 *  2. El modo ahorro prendido (lib/modoAhorro.ts: el navegador lleva minutos
 *     limitando el video por ancho de banda, o la prueba salió floja) → liviano.
 *  3. La última muestra de la llamada dice que el codificador está limitado por
 *     ancho de banda ahora mismo → liviano.
 *
 * Sin ninguna señal, el normal de siempre: no se le baja la calidad a nadie sin
 * evidencia. La estimación de WebRTC (availableOutgoingBitrate) NO decide aquí:
 * refleja lo que la llamada usa, no lo que el internet aguanta.
 *
 * Mientras la pantalla ya está al aire, si la conexión empeora, el modo ahorro le
 * baja cuadros y bitrate en vivo (sender.setParameters, sin volver a publicar);
 * el perfil completo se vuelve a elegir la próxima vez que comparta.
 */
export function elegirPerfilDePantalla(s: {
  prueba: { subida_mbps: number | null; edadMs: number } | null;
  ahorroActivo: boolean;
  limiteCam: string | null;
  limitePant: string | null;
}): PerfilDePantalla {
  const prueba = s.prueba && s.prueba.edadMs <= PRUEBA_VIGENTE_MS ? s.prueba.subida_mbps : null;
  if (prueba !== null && prueba < SUBIDA_PARA_PANTALLA_NORMAL_MBPS) return "liviano";
  if (s.ahorroActivo) return "liviano";
  if (s.limiteCam === "bandwidth" || s.limitePant === "bandwidth") return "liviano";
  return "normal";
}

/** ¿La pantalla de esta sala es la del trabajo vigilado de Cowork (5 fps)? Las
 *  salas de Cowork empiezan con `cowork_`; el hub de supervisores (`cowork_hub_…`)
 *  NO: ahí un supervisor le muestra algo al dueño y tiene que verse bien
 *  (Alvaro, 17/11/2026), así que va con la calidad de una llamada normal. */
export function pantallaDeTrabajoCowork(sala: string | null | undefined): boolean {
  return !!sala && sala.startsWith("cowork_") && !sala.startsWith("cowork_hub_");
}

/** Las opciones de captura y de publicación de cada perfil. En Cowork, el
 *  normal va a 5 fps (PUBLICACION_DE_PANTALLA_COWORK); el liviano ya lo estaba. */
export function opcionesDePantalla(
  perfil: PerfilDePantalla,
  captura: ScreenShareCaptureOptions,
  enCowork = false,
): { captura: ScreenShareCaptureOptions; publicacion: TrackPublishOptions } {
  if (perfil === "liviano") {
    return { captura: { ...captura, ...CAPTURA_LIVIANA }, publicacion: PUBLICACION_DE_PANTALLA_LIVIANA };
  }
  if (enCowork) return { captura: { ...captura, ...CAPTURA_COWORK }, publicacion: PUBLICACION_DE_PANTALLA_COWORK };
  return { captura, publicacion: PUBLICACION_DE_PANTALLA };
}

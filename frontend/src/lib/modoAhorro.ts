// MODO AHORRO: LA LLAMADA SE ACOMODA AL INTERNET DE SUBIDA (Alvaro, 11/11/2026).
//
// La medición (saludDeLlamada.ts) mostró que los computadores están bien (0 % de
// traba por CPU) y que lo que falta es SUBIDA: 10 de 18 personas suben con 0,4 a
// 1 Mbps, y en Cowork mandan a la vez la cámara (hasta 720p) y la pantalla
// completa en 1080p. No cabe: el video se traba y la llamada se reconecta.
//
// Alvaro eligió «automático según su internet»: a quien tenga la subida lenta,
// Maven le baja SOLO a esa persona la cámara a calidad media y la pantalla a 5
// cuadros por segundo (se sigue leyendo); quien tiene buen internet, igual.
//
// La decisión (esta función) se toma con la muestra de cada minuto y con
// histéresis para no subir y bajar a cada rato: se prende con 2 minutos
// seguidos de subida mala y se apaga con 5 seguidos de subida holgada.

export const MALAS_PARA_PRENDER = 2;
export const BUENAS_PARA_APAGAR = 5;
/** Debajo de esto (kbps de subida disponible) no caben cámara + pantalla. */
export const SUBIDA_JUSTA_KBPS = 1200;
/** Encima de esto hay holgura de sobra para volver a la calidad normal. */
export const SUBIDA_HOLGADA_KBPS = 2500;
/** Sin video mandándose, WebRTC informa una «subida» enorme que no significa nada. */
const SUBIDA_SIN_SENTIDO_KBPS = 50_000;

/** Lo que el modo ahorro le pone a la pantalla compartida. */
export const PANTALLA_AHORRO = { maxFramerate: 5, maxBitrate: 700_000 };

export interface EstadoAhorro {
  activo: boolean;
  malas: number;
  buenas: number;
}

export const AHORRO_INICIAL: EstadoAhorro = { activo: false, malas: 0, buenas: 0 };

export function siguienteAhorro(
  prev: EstadoAhorro,
  m: { subida_kbps: number | null; limite_cam: string | null; limite_pant: string | null },
): EstadoAhorro {
  const subida = m.subida_kbps !== null && m.subida_kbps < SUBIDA_SIN_SENTIDO_KBPS ? m.subida_kbps : null;
  const limitada = m.limite_cam === "bandwidth" || m.limite_pant === "bandwidth";
  const mala = limitada || (subida !== null && subida < SUBIDA_JUSTA_KBPS);
  const buena = !limitada && subida !== null && subida >= SUBIDA_HOLGADA_KBPS;
  const malas = mala ? prev.malas + 1 : 0;
  const buenas = buena ? prev.buenas + 1 : 0;
  if (!prev.activo && malas >= MALAS_PARA_PRENDER) return { activo: true, malas, buenas: 0 };
  if (prev.activo && buenas >= BUENAS_PARA_APAGAR) return { activo: false, malas: 0, buenas };
  return { activo: prev.activo, malas, buenas };
}

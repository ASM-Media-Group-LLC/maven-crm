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
// (13/11/2026: lo de la cámara lo aplica su perfil, lib/perfilDeCamara.ts, que
// cuenta el modo ahorro como una de sus señales.)
//
// La decisión (esta función) se toma con la muestra de cada minuto y con
// histéresis para no subir y bajar a cada rato: se prende con 2 minutos
// seguidos de subida mala y se apaga con 5 seguidos de subida holgada.

export const MALAS_PARA_PRENDER = 2;
export const BUENAS_PARA_APAGAR = 5;
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

// ⚠️ 17/11/2026 (Alvaro: «si él comparte, lo tengo que ver sí o sí, y en buena
// calidad»): la subida que llega acá es lo que la llamada ESTÁ USANDO, no lo que
// el internet aguanta. Una pantalla quieta a 5 fps y una cámara liviana usan
// 150–900 kbps con cualquier internet, así que «menos de 1200» prendía el ahorro
// a TODOS (también con internet excelente) y «más de 2500» para apagarlo nunca
// llegaba: el ahorro quedaba pegado y las pantallas salían en la calidad mínima.
// Ahora solo cuenta la señal real del navegador —el codificador limitado por
// ancho de banda— y la prueba de velocidad (ahorroPorPrueba). Se apaga con 5
// minutos seguidos sin esa limitación.
export function siguienteAhorro(
  prev: EstadoAhorro,
  m: { subida_kbps: number | null; limite_cam: string | null; limite_pant: string | null },
): EstadoAhorro {
  const subida = m.subida_kbps !== null && m.subida_kbps < SUBIDA_SIN_SENTIDO_KBPS ? m.subida_kbps : null;
  const limitada = m.limite_cam === "bandwidth" || m.limite_pant === "bandwidth";
  const mala = limitada;
  // Sin video mandándose (subida sin sentido o sin dato) no hay con qué juzgar.
  const buena = !limitada && subida !== null;
  const malas = mala ? prev.malas + 1 : 0;
  const buenas = buena ? prev.buenas + 1 : 0;
  if (!prev.activo && malas >= MALAS_PARA_PRENDER) return { activo: true, malas, buenas: 0 };
  if (prev.activo && buenas >= BUENAS_PARA_APAGAR) return { activo: false, malas: 0, buenas };
  return { activo: prev.activo, malas, buenas };
}

// 13/11/2026: la subida de arriba es la ESTIMACIÓN de WebRTC, que refleja lo que
// la llamada usa y no lo que el internet aguanta. En Cowork ahora además se mide
// de verdad (lib/pruebaDeRed.ts). Una prueba que da menos de 1,5 Mbps de subida
// prende el ahorro en el acto, sin esperar los dos minutos: es una medida real,
// no una sospecha. Una prueba buena NO lo apaga: si el navegador sigue limitando
// el video por ancho de banda, eso manda (se apaga con la regla de siempre).
export const SUBIDA_PRUEBA_JUSTA_MBPS = 1.5;

export function ahorroPorPrueba(prev: EstadoAhorro, subidaMbps: number | null): EstadoAhorro {
  if (prev.activo || subidaMbps === null || !(subidaMbps < SUBIDA_PRUEBA_JUSTA_MBPS)) return prev;
  return { activo: true, malas: Math.max(prev.malas, MALAS_PARA_PRENDER), buenas: 0 };
}

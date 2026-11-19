// PANTALLA COMPARTIDA EN NEGRO (Alvaro, 18/11/2026: «muchas pantallas del Hub se
// ven negras, no sirve»).
//
// En un Mac, si el permiso de «Grabación de pantalla» quedó de una versión vieja
// de la app (otra firma), macOS deja capturar… pero manda cuadros NEGROS: la
// pantalla «se comparte» y el dueño no ve nada. Para Maven eso es lo mismo que
// no compartir. Se mira la pantalla propia cada 10 s en un cuadrito de 64×36 (no
// cuesta nada) y, si 3 seguidos salen negros (~30 s), se la da por negra.
//
// «Negro» es estricto a propósito: un modo oscuro con letras, un fondo negro con
// el reloj o la barra del sistema NO cuentan (siempre hay algún píxel claro).

/** Brillo máximo (0–255) que se acepta en un cuadro «negro». */
export const BRILLO_MAXIMO_NEGRO = 12;
/** Cada cuánto se mira la pantalla propia. */
export const MUESTRA_CADA_MS = 10_000;
/** Cuántas muestras negras seguidas hacen falta. */
export const MUESTRAS_NEGRAS = 3;

/** ¿El cuadro (RGBA) es negro? Ningún píxel pasa del brillo máximo. */
export function cuadroEsNegro(datos: ArrayLike<number>): boolean {
  if (!datos || datos.length < 4) return false;
  for (let i = 0; i + 2 < datos.length; i += 4) {
    if (datos[i] > BRILLO_MAXIMO_NEGRO || datos[i + 1] > BRILLO_MAXIMO_NEGRO || datos[i + 2] > BRILLO_MAXIMO_NEGRO) return false;
  }
  return true;
}

/**
 * Decide con las muestras: «negra» tras MUESTRAS_NEGRAS seguidas, «no negra» con
 * UNA muestra con imagen. Al empezar no se sabe nada (ni se avisa): una pantalla
 * nueva que sigue negra no borra la marca de la anterior mientras se mide.
 */
export function juezDePantallaNegra(alCambiar: (negra: boolean) => void): (esNegro: boolean) => void {
  let negras = 0;
  let negra: boolean | null = null;
  return (esNegro) => {
    if (!esNegro) {
      negras = 0;
      if (negra !== false) { negra = false; alCambiar(false); }
      return;
    }
    negras += 1;
    if (negras >= MUESTRAS_NEGRAS && negra !== true) { negra = true; alCambiar(true); }
  };
}

/**
 * Vigila una pantalla propia y avisa cuando queda en negro (true) o vuelve (false).
 * Devuelve cómo dejar de vigilar. Sin canvas (pruebas, navegador raro) no hace nada.
 */
export function vigilarPantallaNegra(
  track: MediaStreamTrack,
  alCambiar: (negra: boolean) => void,
  cada = MUESTRA_CADA_MS,
): () => void {
  if (typeof document === "undefined" || typeof MediaStream === "undefined") return () => {};
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 36;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return () => {};
  try {
    video.srcObject = new MediaStream([track]);
    void video.play().catch(() => {});
  } catch {
    return () => {};
  }
  const juez = juezDePantallaNegra(alCambiar);
  let parado = false;
  let midiendo = false;
  const leerCuadro = () => juez(cuadroEsNegro(ctx.getImageData(0, 0, canvas.width, canvas.height).data));
  // SIN TRABAR LA PÁGINA (19/11/2026). La medición de llamadas marcaba esta
  // función («index.js:o», ~0,9 s de promedio y picos de varios segundos):
  // `drawImage(video)` sobre un lienzo de lectura frecuente (que vive en la CPU)
  // bajaba el cuadro ENTERO de la pantalla —en un Mac retina, 5K— al hilo
  // principal para reducirlo a 64×36. Ahora la reducción la hace
  // createImageBitmap, fuera del hilo principal, y aquí solo se dibuja el
  // cuadrito ya reducido. El veredicto es el mismo.
  const mirar = () => {
    if (parado || midiendo || track.readyState !== "live" || video.readyState < 2) return;
    if (typeof createImageBitmap === "function") {
      midiendo = true;
      createImageBitmap(video, { resizeWidth: canvas.width, resizeHeight: canvas.height, resizeQuality: "low" })
        .then((cuadro) => {
          try {
            if (!parado) { ctx.drawImage(cuadro, 0, 0); leerCuadro(); }
          } finally { cuadro.close(); }
        })
        .catch(() => { /* un cuadro que no se pudo leer no dice nada */ })
        .finally(() => { midiendo = false; });
      return;
    }
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      leerCuadro();
    } catch { /* un cuadro que no se pudo leer no dice nada */ }
  };
  const id = window.setInterval(mirar, cada);
  return () => {
    parado = true;
    window.clearInterval(id);
    try { video.pause(); video.srcObject = null; } catch { /* noop */ }
  };
}

// El tamaño de las imágenes pegadas en un correo (Keila, 06/10: «se está
// enviando en tamaño real y al salir a correos de terceros distorsionan el
// mensaje»). Como Gmail: entran ajustadas al ancho de un correo (600 px) y, al
// tocarlas, se elige Pequeña, Mediana, Grande u Original. Al enviar, cada
// <img> lleva su ancho (el atributo, que es lo que respeta Outlook de
// escritorio) y max-width:100% (para la pantalla del teléfono).

/** El ancho de un correo: lo que usan Gmail y casi todas las plantillas. */
export const ANCHO_AJUSTADO = 600;

/** Los tamaños del menú, en px. `null` = Original (su ancho real, sin pasarse
 *  del ancho de la pantalla). */
export const TAMANOS = [
  { clave: "pequena", ancho: 200 },
  { clave: "mediana", ancho: 400 },
  { clave: "grande", ancho: ANCHO_AJUSTADO },
  { clave: "original", ancho: null },
] as const;

/** Lado más largo con el que se guarda una imagen pegada. Una captura de un
 *  monitor 4K pesa varios MB y viaja entera aunque se vea a 600 px: se achica
 *  ANTES de meterla al correo (con margen para pantallas de alta densidad). */
export const LADO_MAXIMO = 1600;

/** Con qué ancho entra una imagen al pegarla: la suya si es chica; si no, 600. */
export function anchoInicial(anchoNatural: number): number {
  const w = Math.round(anchoNatural);
  return w > 0 ? Math.min(w, ANCHO_AJUSTADO) : ANCHO_AJUSTADO;
}

/** Las medidas para que el lado más largo no pase de `max` (sin agrandar nunca). */
export function medidasAchicadas(ancho: number, alto: number, max = LADO_MAXIMO): { ancho: number; alto: number } {
  const lado = Math.max(ancho, alto);
  if (lado <= max || lado <= 0) return { ancho, alto };
  const f = max / lado;
  return { ancho: Math.round(ancho * f), alto: Math.round(alto * f) };
}

/** El ancho que tiene escrito un <img> (atributo), o null. */
export function anchoDeAtributo(valor: string | null | undefined): number | null {
  const w = Number(valor);
  return Number.isFinite(w) && w > 0 ? Math.round(w) : null;
}

const cargar = (src: string) =>
  new Promise<HTMLImageElement>((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => mal(new Error("no se pudo leer la imagen"));
    img.src = src;
  });

/** Prepara una imagen pegada: la achica si es enorme (no los GIF, que perderían
 *  la animación) y dice con qué ancho entra. Si algo falla, va tal cual. */
export async function prepararImagen(dataUrl: string, tipo: string): Promise<{ src: string; ancho: number }> {
  try {
    const img = await cargar(dataUrl);
    const { ancho, alto } = medidasAchicadas(img.naturalWidth, img.naturalHeight);
    if (tipo === "image/gif" || ancho === img.naturalWidth) return { src: dataUrl, ancho: anchoInicial(img.naturalWidth) };
    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return { src: dataUrl, ancho: anchoInicial(img.naturalWidth) };
    ctx.drawImage(img, 0, 0, ancho, alto);
    // Una foto sigue siendo JPEG; una captura (PNG), PNG: que el texto no se ensucie.
    const salida = tipo === "image/jpeg" ? lienzo.toDataURL("image/jpeg", 0.9) : lienzo.toDataURL("image/png");
    return { src: salida, ancho: anchoInicial(ancho) };
  } catch {
    return { src: dataUrl, ancho: ANCHO_AJUSTADO };
  }
}

// Las reglas de la edge `drive` que no dependen de la red ni de la base:
// separadas para poder probarlas sin levantar el servidor.

/** Tope por archivo. Por partes de 95 MB, son ~216 partes. */
export const MAX_ARCHIVO = 20 * 1024 * 1024 * 1024;
/** Tiene que coincidir con MAX_POR_PEDIDO del NAS (el proxy corta en 100 MB). */
export const TAMANO_PARTE = 95 * 1024 * 1024;

export class HttpError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** Nombre de archivo sano: sin barras (serían carpetas), sin caracteres de
 *  control, y con largo razonable. Lo mismo exige la base. */
export function nombreValido(n: unknown): string {
  const s = typeof n === "string" ? n.trim() : "";
  if (!s || s.length > 255 || /[/\\\u0000-\u001f]/.test(s)) throw new HttpError("Nombre de archivo inválido");
  return s;
}

export function planDeSubida(size: number) {
  if (!Number.isFinite(size) || size <= 0) throw new HttpError("El archivo está vacío");
  if (size > MAX_ARCHIVO) throw new HttpError("El archivo pasa el tope de 20 GB");
  return size <= TAMANO_PARTE ? { partes: 0 } : { partes: Math.ceil(size / TAMANO_PARTE) };
}


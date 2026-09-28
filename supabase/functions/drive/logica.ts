// Las reglas de la edge `drive` que no dependen de la red ni de la base:
// separadas para poder probarlas sin levantar el servidor.

/** Tope por archivo. Por partes de 32 MB, son 640 partes. */
export const MAX_ARCHIVO = 20 * 1024 * 1024 * 1024;
/** Cada parte es UN pedido HTTP, y tiene que entrar en la ventana del proxy:
 *  el Traefik de Dokploy (la puerta al NAS, 28/09) corta a los ~60 s. 32 MB a
 *  5 Mbps de subida son 51 s. Tiene que ser menor que MAX_POR_PEDIDO del NAS
 *  (95 MB). */
export const TAMANO_PARTE = 32 * 1024 * 1024;

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


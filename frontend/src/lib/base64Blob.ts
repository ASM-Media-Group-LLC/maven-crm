/** base64 → Blob. Lo usan la descarga de adjuntos y el visor: los dos parten
 *  del mismo `contentBase64` que devuelve la edge, solo cambia el destino. */
export function base64ABlob(base64: string, contentType: string): Blob {
  return new Blob([base64ABytes(base64)], {
    type: contentType || "application/octet-stream",
  });
}

/** base64 → bytes crudos. `atob` devuelve una string latin1, así que hay que
 *  pasarla a Uint8Array carácter por carácter; tomar la string tal cual rompe
 *  cualquier archivo que no sea ASCII. */
export function base64ABytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** base64 → texto. Decodifica como UTF-8 de verdad: `atob` solo llega a
 *  latin1 y dejaría "Ã±" donde el archivo dice "ñ". */
export function base64ATexto(base64: string): string {
  return new TextDecoder("utf-8").decode(base64ABytes(base64));
}

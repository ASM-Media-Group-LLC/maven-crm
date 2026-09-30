// La firma de los permisos del Drive. La MISMA lógica vive en la edge
// `drive` (supabase/functions/_shared/drive-firma.ts): Maven firma, el NAS
// verifica. Si una cambia y la otra no, no pasa ningún archivo — los tests de
// los dos lados usan el mismo vector para que eso salte antes de desplegar.
//
// Un permiso es `<datos>.<firma>`, los dos en base64url:
//   datos = JSON { op, k, e, ... }   (e = vence, en segundos Unix)
//   firma = HMAC-SHA256(secreto, datos)
// Se firma el JSON ENTERO: cambiar cualquier campo (la ruta, el vencimiento,
// el tamaño máximo) invalida la firma.

import { createHmac, timingSafeEqual } from "node:crypto";

const b64u = (buf) => Buffer.from(buf).toString("base64url");

export function firmar(secreto, datos) {
  const cuerpo = b64u(JSON.stringify(datos));
  const firma = b64u(createHmac("sha256", secreto).update(cuerpo).digest());
  return `${cuerpo}.${firma}`;
}

/** Devuelve los datos si la firma es buena y no venció; si no, null. */
export function verificar(secreto, permiso, ahora = Date.now()) {
  if (typeof permiso !== "string" || permiso.length > 4000) return null;
  const [cuerpo, firma, sobra] = permiso.split(".");
  if (!cuerpo || !firma || sobra !== undefined) return null;
  const esperada = createHmac("sha256", secreto).update(cuerpo).digest();
  let recibida;
  try { recibida = Buffer.from(firma, "base64url"); } catch { return null; }
  // Comparación en tiempo constante: con === se puede adivinar la firma byte
  // por byte midiendo cuánto tarda en fallar.
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
  let datos;
  try { datos = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")); } catch { return null; }
  if (!datos || typeof datos !== "object" || typeof datos.e !== "number") return null;
  if (datos.e * 1000 < ahora) return null;
  return datos;
}

/** El recibo de una subida terminada: Maven lo verifica para dar el archivo
 *  por guardado SIN tener que preguntarle al NAS (que puede no estar al
 *  alcance de la edge). */
export function recibo(secreto, { k, size, sha256 }) {
  return firmar(secreto, { op: "recibo", k, size, sha256, e: Math.floor(Date.now() / 1000) + 3600 });
}

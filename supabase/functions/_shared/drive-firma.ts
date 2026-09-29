// La firma de los permisos del Drive, lado Maven. La otra mitad vive en el NAS:
// infra/nas-drive/firma.mjs. Maven firma; el NAS verifica (y firma el recibo
// de cada subida, que Maven verifica). Tienen que coincidir byte por byte: el
// test drive-firma.test.ts lo comprueba contra un vector hecho por el NAS.
//
// Un permiso es `<datos>.<firma>`, los dos en base64url:
//   datos = JSON { op, k, e, ... }   (e = vence, en segundos Unix)
//   firma = HMAC-SHA256(secreto, datos)

const enc = new TextEncoder();

function b64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function deB64u(s: string): Uint8Array {
  const n = s.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(n + "=".repeat((4 - (n.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function clave(secreto: string, uso: KeyUsage[]) {
  return await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, uso);
}

export type DatosDePermiso = { op: string; k: string; e: number } & Record<string, unknown>;

export async function firmar(secreto: string, datos: DatosDePermiso): Promise<string> {
  const cuerpo = b64u(enc.encode(JSON.stringify(datos)));
  const firma = new Uint8Array(await crypto.subtle.sign("HMAC", await clave(secreto, ["sign"]), enc.encode(cuerpo)));
  return `${cuerpo}.${b64u(firma)}`;
}

/** Los datos si la firma es buena y no venció; si no, null. crypto.subtle.verify
 *  compara en tiempo constante. */
export async function verificar(secreto: string, permiso: string, ahora = Date.now()): Promise<DatosDePermiso | null> {
  if (typeof permiso !== "string" || permiso.length > 4000) return null;
  const partes = permiso.split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
  let firma: Uint8Array;
  try { firma = deB64u(partes[1]); } catch { return null; }
  // `as BufferSource`: el tipo de Deno para Uint8Array no encaja con WebCrypto
  // (el mismo choque que el HMAC de LiveKit); en ejecución es lo mismo.
  const ok = await crypto.subtle.verify("HMAC", await clave(secreto, ["verify"]), firma as unknown as BufferSource, enc.encode(partes[0]));
  if (!ok) return null;
  let datos: unknown;
  try { datos = JSON.parse(new TextDecoder().decode(deB64u(partes[0]))); } catch { return null; }
  if (!datos || typeof datos !== "object" || typeof (datos as { e?: unknown }).e !== "number") return null;
  if ((datos as { e: number }).e * 1000 < ahora) return null;
  return datos as DatosDePermiso;
}

/** Cuánto dura cada permiso. Bajar dura horas: un video largo se sigue
 *  pidiendo por pedazos mientras se mira. */
export const VENCE = {
  bajar: 6 * 3600,
  subir: 12 * 3600,
  borrar: 10 * 60,
} as const;

export const ahoraMas = (segundos: number) => Math.floor(Date.now() / 1000) + segundos;

// Cifrado de credenciales de correo.
//
// POR QUÉ CIFRAR SI LA COLUMNA YA ESTÁ FUERA DEL GRANT: son dos amenazas
// distintas. El GRANT protege contra un usuario del navegador; el cifrado
// protege contra quien consigue un volcado de la base (backup filtrado,
// acceso al panel de Supabase, service_role comprometida). Sin la clave,
// que vive en otro sistema, las credenciales no sirven de nada.
//
// AES-GCM y no AES-CBC: GCM es autenticado, así que un ciphertext
// manipulado falla al descifrar en vez de devolver basura silenciosamente.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const CURRENT_KEY_VERSION = 1;

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

// Se construye sobre un ArrayBuffer propio (y no con Uint8Array.from) para
// que el tipo sea Uint8Array<ArrayBuffer>: el tipado nuevo de TS rechaza
// ArrayBufferLike donde WebCrypto espera BufferSource.
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const raw = atob(s);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Deriva la clave AES del secret. Acepta versión para poder rotar. */
async function loadKey(version: number): Promise<CryptoKey | null> {
  // v1 = MAIL_CRED_KEY. Al rotar: MAIL_CRED_KEY_V2, y las filas viejas
  // siguen descifrándose con la anterior hasta que se re-cifren.
  const raw = version === CURRENT_KEY_VERSION
    ? Deno.env.get("MAIL_CRED_KEY")
    : Deno.env.get(`MAIL_CRED_KEY_V${version}`);
  if (!raw) return null;

  // El secret es texto arbitrario; lo pasamos por SHA-256 para tener
  // exactamente 256 bits, en vez de exigir un largo puntual al cargarlo.
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(raw));
  return await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export function cryptoConfigured(): boolean {
  return !!Deno.env.get("MAIL_CRED_KEY");
}

export interface Sealed {
  cipher: string;
  nonce: string;
  keyVersion: number;
}

export async function seal(plaintext: string): Promise<Sealed | null> {
  const key = await loadKey(CURRENT_KEY_VERSION);
  if (!key) return null;
  // Nonce de 12 bytes, nuevo por credencial. Reusar un nonce con la misma
  // clave rompe la garantía de AES-GCM, así que nunca se deriva de nada.
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    enc.encode(plaintext),
  );
  return {
    cipher: b64(new Uint8Array(buf)),
    nonce: b64(nonce),
    keyVersion: CURRENT_KEY_VERSION,
  };
}

export async function unseal(s: Sealed): Promise<string | null> {
  const key = await loadKey(s.keyVersion);
  if (!key) return null;
  try {
    const buf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(s.nonce) },
      key,
      unb64(s.cipher),
    );
    return dec.decode(buf);
  } catch {
    // Clave equivocada o ciphertext manipulado. No distinguimos el motivo
    // a propósito: un atacante no debería poder usar el error para saber
    // si acertó la clave.
    return null;
  }
}

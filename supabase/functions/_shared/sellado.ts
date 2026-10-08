// Cifrar una credencial con una llave de los secretos de las funciones.
//
// El mismo esquema que mail-crypto.ts (credenciales de correo), pero con el
// NOMBRE de la llave como parámetro: cada clase de credencial con su llave
// (ACCESOS_CRED_KEY para OnlyFans, MAIL_CRED_KEY para el correo). Si una se
// filtra, la otra no.
//
// AES-GCM: autenticado, así que un texto cifrado manipulado falla al abrir en
// vez de devolver basura. Nonce de 12 bytes NUEVO por cada vez que se cifra
// (reusarlo con la misma llave rompe la garantía). La llave se deriva con
// SHA-256 del secreto: cualquier texto sirve, sin exigir un largo.
//
// Versionada para poder rotar: la v1 es <NOMBRE>; la v2, <NOMBRE>_V2, y lo
// viejo se sigue abriendo con la anterior hasta que se vuelva a cifrar.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const VERSION_ACTUAL = 1;

export interface Sellado {
  cipher: string;
  nonce: string;
  keyVersion: number;
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function desdeB64(s: string): Uint8Array<ArrayBuffer> {
  const raw = atob(s);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** El cifrador de una llave. `leer` es Deno.env.get (en las pruebas, otra cosa). */
export function sellador(nombre: string, leer: (k: string) => string | undefined = (k) => Deno.env.get(k)) {
  const secretoDe = (version: number) => leer(version === VERSION_ACTUAL ? nombre : `${nombre}_V${version}`);

  async function llave(version: number): Promise<CryptoKey | null> {
    const secreto = secretoDe(version);
    if (!secreto) return null;
    const digest = await crypto.subtle.digest("SHA-256", enc.encode(secreto));
    return await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  return {
    configurado: (): boolean => !!secretoDe(VERSION_ACTUAL),

    async sellar(texto: string): Promise<Sellado | null> {
      const k = await llave(VERSION_ACTUAL);
      if (!k) return null;
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k, enc.encode(texto));
      return { cipher: b64(new Uint8Array(buf)), nonce: b64(nonce), keyVersion: VERSION_ACTUAL };
    },

    /** null si no hay llave, o si la llave es otra o el texto fue tocado (no se
     *  distingue a propósito). */
    async abrir(s: Sellado): Promise<string | null> {
      const k = await llave(s.keyVersion);
      if (!k) return null;
      try {
        const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: desdeB64(s.nonce) }, k, desdeB64(s.cipher));
        return dec.decode(buf);
      } catch {
        return null;
      }
    },
  };
}

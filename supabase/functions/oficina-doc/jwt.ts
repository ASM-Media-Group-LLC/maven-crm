// La firma que exige ONLYOFFICE (JWT HS256, sin dependencias).
//
// Vive aparte de index.ts para poder probarla: index.ts arranca el servidor
// apenas se importa. La usan la apertura de un documento, la de un adjunto del
// correo, la de un archivo del Drive y el pedido de conversión.

const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const textoAb64url = (s: string) => b64url(new TextEncoder().encode(s));

async function clave(secreto: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}

/** ONLYOFFICE exige que la configuración venga firmada: sin esto contesta
 *  "The document security token is not correctly formed" y no abre nada. */
export async function firmar(payload: unknown, secreto: string): Promise<string> {
  const cabecera = textoAb64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const cuerpo = textoAb64url(JSON.stringify(payload));
  const firma = await crypto.subtle.sign(
    "HMAC", await clave(secreto), new TextEncoder().encode(`${cabecera}.${cuerpo}`),
  );
  return `${cabecera}.${cuerpo}.${b64url(new Uint8Array(firma))}`;
}

/** El aviso de guardado también viene firmado, y hay que comprobarlo: sin esta
 *  verificación cualquiera que adivine la URL podría reemplazar un documento. */
export async function verificar(jwt: string, secreto: string): Promise<boolean> {
  const partes = jwt.split(".");
  if (partes.length !== 3) return false;
  const esperado = await crypto.subtle.sign(
    "HMAC", await clave(secreto), new TextEncoder().encode(`${partes[0]}.${partes[1]}`),
  );
  return b64url(new Uint8Array(esperado)) === partes[2];
}

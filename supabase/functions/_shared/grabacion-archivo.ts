// Dónde vive el MP4 de una grabación (R2 o el disco del VPS vía rec-server) y
// cómo se lee, se mide y se borra. Lo usan la edge `recordings` y
// `grabaciones-al-drive` (que lo copia al Drive): una sola verdad sobre dónde
// buscar el archivo.

import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

// ── Dónde vive el MP4 ───────────────────────────────────────────────────────
//
// Hasta el 08/09/2026 el egress dejaba el archivo en el disco del VPS y
// rec-server lo servía. Ese día se lo configuró para que suba directo a
// Cloudflare R2 (#1713) — pero la mitad de la lectura quedó sin hacer, y esta
// función siguió preguntándole a rec-server por un archivo que ya no estaba
// ahí. Resultado: TODAS las grabaciones desde entonces se veían en la lista y
// al darles play tiraban "No se pudo reproducir", y descargarlas fallaba igual.
//
// Ahora se busca en los DOS lados: primero R2, y si no está, rec-server. Eso
// deja andando a la vez las viejas (que siguen en el VPS y mueren solas con la
// retención de 90 días) y las nuevas.

/** El nombre del objeto en R2.
 *
 *  ⚠️ LA BARRA INICIAL SOBREVIVE. Se siguió el fuente del egress v1.9: la ruta
 *  que se le manda (`filepath: /out/<id>.mp4`) pasa por `clean()`, que solo
 *  saca prefijos `../`, y después por `path.Join(prefix, ...)` con el prefijo
 *  vacío — así que la llave que llega al SDK es `/out/<id>.mp4`, CON la barra.
 *  Mi primera versión probaba solo las formas normalizadas y por eso no
 *  encontraba nada. Se prueban las tres porque no está garantizado que el SDK
 *  o R2 no normalicen en el camino. */
function llavesPosibles(archivo: string): string[] {
  return [`/out/${archivo}`, `out/${archivo}`, archivo];
}

function r2(): { cliente: AwsClient; base: string } | null {
  const cuenta = Deno.env.get("R2_ACCOUNT_ID");
  // Los DOS nombres, igual que en creator-video: el egress de LiveKit ya usaba
  // R2_ACCESS_KEY/R2_SECRET en Dokploy.
  const key = Deno.env.get("R2_ACCESS_KEY_ID") ?? Deno.env.get("R2_ACCESS_KEY");
  const secret = Deno.env.get("R2_SECRET_ACCESS_KEY") ?? Deno.env.get("R2_SECRET");
  const bucket = Deno.env.get("R2_BUCKET_GRABACIONES") ?? "maven-grabaciones";
  if (!cuenta || !key || !secret) return null;   // sin R2 configurado: solo rec-server
  return {
    // region "auto" es lo que R2 espera; con otra, la firma no valida.
    cliente: new AwsClient({ accessKeyId: key, secretAccessKey: secret, service: "s3", region: "auto" }),
    base: `https://${cuenta}.r2.cloudflarestorage.com/${bucket}`,
  };
}

async function firmarR2(metodo: "GET" | "DELETE", llave: string, segundos: number, extraQuery = ""): Promise<string | null> {
  const c = r2();
  if (!c) return null;
  const url = new URL(`${c.base}/${llave}${extraQuery ? `?${extraQuery}` : ""}`);
  url.searchParams.set("X-Amz-Expires", String(segundos));
  const firmada = await c.cliente.sign(new Request(url, { method: metodo }), { aws: { signQuery: true } });
  return firmada.url;
}

/** Tamaño del objeto en R2, o null si no está (o si R2 no está configurado). */
/** Lo que R2 tiene para decir de un archivo.
 *
 *  `concluyente` distingue "R2 contestó y NO está" de "R2 ni siquiera me dejó
 *  preguntar". Sin esa diferencia, un token mal alcanzado se veía EXACTO igual
 *  que un archivo inexistente: se caía a rec-server, se respondía 404 y no
 *  quedaba ni una línea en los logs. Un error de configuración con forma de
 *  pérdida de datos.
 */
async function buscarEnR2(
  archivo: string,
): Promise<{ hallado: { llave: string; size: number } | null; concluyente: boolean }> {
  const c = r2();
  if (!c) return { hallado: null, concluyente: false };   // sin R2: no sabemos nada
  let concluyente = true;
  for (const llave of llavesPosibles(archivo)) {
    try {
      const firmada = await c.cliente.sign(
        new Request(`${c.base}/${llave}`, { method: "HEAD" }), { aws: { signQuery: true } },
      );
      const r = await fetch(firmada.url, { method: "HEAD" });
      if (r.ok) return { hallado: { llave, size: Number(r.headers.get("content-length")) || 0 }, concluyente: true };
      if (r.status !== 404) {
        // 403 = el token no alcanza este bucket. Hay que poder verlo en los logs.
        concluyente = false;
        console.warn(`[recordings] R2 respondió ${r.status} en ${llave} — ¿el token alcanza el bucket?`);
      }
    } catch (e) {
      concluyente = false;
      console.warn("[recordings] HEAD R2:", llave, (e as Error).message);
    }
  }
  return { hallado: null, concluyente };
}

/** La URL para ver o bajar, mire donde mire. `null` si el archivo no está. */
export async function urlDelArchivo(archivo: string, accion: "d" | "v", vidaSegundos: number): Promise<string | null> {
  const { hallado } = await buscarEnR2(archivo);
  if (hallado) {
    // Descargar tiene que DESCARGAR. rec-server mandaba `Content-Disposition:
    // attachment`; una URL firmada de R2 es un GET pelado y el egress sube los
    // objetos como `inline`, así que sin esto el botón Descargar abría el video
    // en otra pestaña y sin nombre de archivo.
    const extra = accion === "d"
      ? `response-content-disposition=${encodeURIComponent(`attachment; filename="${archivo}"`)}`
      : "";
    const url = await firmarR2("GET", hallado.llave, vidaSegundos, extra);
    if (url) return url;
  }
  const r = await fetch(await firmarUrl(archivo, "stat", 60)).catch(() => null);
  if (r?.ok) return await firmarUrl(archivo, accion, vidaSegundos);
  return null;
}

/** Cuánto pesa, mire donde mire. `null` = no está en ninguno de los dos. */
export async function tamanoDelArchivo(archivo: string): Promise<number | null> {
  const { hallado } = await buscarEnR2(archivo);
  if (hallado) return hallado.size || null;
  try {
    const r = await fetch(await firmarUrl(archivo, "stat", 60));
    if (r.ok) return (await r.json()).size ?? null;
  } catch { /* sin tamaño */ }
  return null;
}

/** Lo borra de donde esté. */
export async function borrarArchivo(archivo: string): Promise<void> {
  const { hallado, concluyente } = await buscarEnR2(archivo);
  if (hallado) {
    const url = await firmarR2("DELETE", hallado.llave, 60);
    if (url) {
      const r = await fetch(url, { method: "DELETE" });
      if (!r.ok && r.status !== 404) throw new Error(`R2 ${r.status}`);
      return;
    }
  }
  // ⚠️ Si R2 no contestó de forma concluyente, NO se puede dar por borrado.
  // rec-server va a decir 404 —el archivo está en R2, no en el disco— y eso se
  // leería como "ya no estaba": la fila quedaría marcada como borrada y el MP4
  // seguiría en R2 para siempre, pagándose, sin ninguna fila que lo nombre.
  if (!concluyente) throw new Error("R2 no contestó: no se puede confirmar el borrado");

  const r = await fetch(await firmarUrl(archivo, "f", 60), { method: "DELETE" });
  // 404 = el archivo ya no está: no es un huérfano.
  if (!r.ok && r.status !== 404) throw new Error(`rec-server ${r.status}`);
}

export async function firmarUrl(archivo: string, accion: "d" | "v" | "f" | "stat", vidaSegundos: number): Promise<string> {
  const secret = Deno.env.get("RECORDINGS_SIGNING_SECRET")!;
  const base = Deno.env.get("RECORDINGS_BASE_URL")!; // https://rec.asmtech.ai
  const exp = Math.floor(Date.now() / 1000) + vidaSegundos;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${archivo}.${exp}`));
  const sig = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${base}/${accion}/${archivo}?exp=${exp}&sig=${sig}`;
}

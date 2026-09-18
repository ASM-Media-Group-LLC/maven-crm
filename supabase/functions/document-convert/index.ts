// document-convert — ver fiel dentro de Maven lo que llega en formato de Office.
//
// Acciones:
//   check   { hash }                      → ¿ya está convertido? { listo, url? }
//   convert { hash, filename, contentBase64 } → convierte y devuelve { url }
//
// Por qué en dos pasos: un adjunto de 20 MB en base64 son ~27 MB de subida. Si
// el PDF ya existe, subirlo otra vez es regalar ancho de banda y tiempo. El
// navegador calcula el hash del archivo que ya tiene y pregunta primero.
//
// ⚠️ LA CACHÉ ES POR CONTENIDO. La llave es el SHA-256 del archivo, así que dos
// personas con la misma hoja de vida comparten el PDF — que es justo lo que se
// quiere. Y conocer el hash implica haber tenido los bytes: no se puede pedir
// el PDF de un archivo ajeno sin haberlo tenido antes.
//
// ⚠️ Convertir es lo ÚNICO caro en CPU de todo el proyecto, y la máquina la
// comparte con whisper. Por eso hay un tope de dos conversiones a la vez
// (tabla conversion_slots): la tercera recibe 429 y el navegador reintenta. Sin
// eso, treinta adjuntos abiertos de golpe ponen lento al bot de WhatsApp.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

class HttpError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Lo que LibreOffice sabe abrir y el navegador no sabe dibujar. El PDF y las
 *  imágenes NO están acá a propósito: esos el navegador ya los muestra solo y
 *  convertirlos sería gastar CPU para empeorarlos. */
const CONVERTIBLES = new Set([
  "doc", "docx", "odt", "rtf",
  "xls", "xlsx", "ods",
  "ppt", "pptx", "odp",
]);

const MAX_BYTES = 20 * 1024 * 1024; // el mismo tope que los adjuntos del correo

function extensionDe(filename: string): string {
  return filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

// ── Gotenberg ───────────────────────────────────────────────────────────────
// Credenciales por env o por el Vault, igual que parrilla-weekly.
async function gotenbergCreds(sb: SupabaseClient) {
  const env = {
    url: Deno.env.get("GOTENBERG_URL"),
    user: Deno.env.get("GOTENBERG_USER"),
    pass: Deno.env.get("GOTENBERG_PASS"),
  };
  if (env.url && env.user && env.pass) return env as { url: string; user: string; pass: string };
  const get = async (name: string) => {
    const { data, error } = await sb.rpc("internal_secret", { p_name: name });
    if (error) throw new HttpError(`No pude leer el secreto ${name}: ${error.message}`, 500);
    return String(data ?? "");
  };
  const creds = {
    url: await get("gotenberg_url"),
    user: await get("gotenberg_user"),
    pass: await get("gotenberg_pass"),
  };
  if (!creds.url || !creds.user || !creds.pass) {
    throw new HttpError("Gotenberg sin credenciales configuradas", 500);
  }
  return creds;
}

/** ⚠️ Ruta `/forms/libreoffice/convert`, NO la de chromium que usa la Parrilla:
 *  esa renderiza HTML. La imagen oficial `gotenberg/gotenberg:8` trae las dos. */
async function aPdf(
  sb: SupabaseClient, bytes: Uint8Array, filename: string,
): Promise<Uint8Array> {
  const { url, user, pass } = await gotenbergCreds(sb);
  const form = new FormData();
  // El nombre importa: LibreOffice elige el filtro de entrada por la extensión.
  // El cast es por el tipado de Deno: un Uint8Array ES un BlobPart válido en
  // tiempo de ejecución, pero su tipo genérico no encaja en la firma.
  form.append("files", new Blob([bytes as unknown as BlobPart]), filename);
  const resp = await fetch(`${url.replace(/\/$/, "")}/forms/libreoffice/convert`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${user}:${pass}`) },
    body: form,
  });
  if (!resp.ok) {
    throw new HttpError(
      `Gotenberg respondió ${resp.status}: ${(await resp.text()).slice(0, 200)}`,
      502,
    );
  }
  return new Uint8Array(await resp.arrayBuffer());
}

// ── R2 ──────────────────────────────────────────────────────────────────────
function r2() {
  const cuenta = Deno.env.get("R2_ACCOUNT_ID");
  // Los dos nombres, como en creator-video: son el mismo valor con el nombre del
  // estándar S3 en un lado y el de Dokploy en el otro, y ya costó un
  // "faltan los secrets de R2".
  const key = Deno.env.get("R2_ACCESS_KEY_ID") ?? Deno.env.get("R2_ACCESS_KEY");
  const secret = Deno.env.get("R2_SECRET_ACCESS_KEY") ?? Deno.env.get("R2_SECRET");
  const bucket = Deno.env.get("R2_BUCKET_CONVERTIDOS") ?? "maven-convertidos";
  const faltan = [
    !cuenta && "R2_ACCOUNT_ID",
    !key && "R2_ACCESS_KEY_ID (o R2_ACCESS_KEY)",
    !secret && "R2_SECRET_ACCESS_KEY (o R2_SECRET)",
  ].filter(Boolean);
  if (faltan.length) throw new HttpError(`Faltan secretos de R2: ${faltan.join(", ")}`, 500);
  return {
    cliente: new AwsClient({
      accessKeyId: key!, secretAccessKey: secret!, service: "s3", region: "auto",
    }),
    base: `https://${cuenta}.r2.cloudflarestorage.com/${bucket}`,
  };
}

const llaveDe = (hash: string) => `convertidos/${hash}.pdf`;

/** El ORIGINAL, tal cual vino, para que ONLYOFFICE lo abra.
 *
 *  ⚠️ Conserva la extensión porque ONLYOFFICE elige el editor por el
 *  `fileType`, y además la URL firmada que le pasamos tiene que terminar en
 *  algo que reconozca. Y va en otra carpeta que los PDF: son cosas distintas
 *  con vidas distintas. */
const llaveOriginal = (hash: string, ext: string) => `originales/${hash}.${ext}`;

/** Los que ONLYOFFICE abre DE VERDAD, sin pasar por PDF.
 *
 *  Es un subconjunto de `CONVERTIBLES` a propósito: un .doc o un .odt viejos
 *  los abre mejor LibreOffice convirtiéndolos, y un .rtf directamente no es
 *  trabajo para el editor de Office. Para esos tres formatos modernos, en
 *  cambio, convertir a PDF era perder el original: se veía una foto del
 *  documento en vez del documento. */
const ONLYOFFICE_ABRE = new Set(["docx", "xlsx", "pptx"]);

async function urlFirmada(llave: string, segundos: number): Promise<string> {
  const { cliente, base } = r2();
  const firmada = await cliente.sign(
    new Request(`${base}/${llave}?X-Amz-Expires=${segundos}`, { method: "GET" }),
    { aws: { signQuery: true } },
  );
  return firmada.url;
}

async function existeEnR2(llave: string): Promise<boolean> {
  const { cliente, base } = r2();
  const resp = await cliente.fetch(`${base}/${llave}`, { method: "HEAD" });
  return resp.ok;
}

/** Los tipos de los originales. ⚠️ Importa: ONLYOFFICE mira el Content-Type de
 *  lo que baja, y un .xlsx servido como application/pdf lo rechaza sin decir
 *  por qué. */
const MIME_ORIGINAL: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

async function subirAR2(
  llave: string,
  bytes: Uint8Array,
  tipo = "application/pdf",
): Promise<void> {
  const { cliente, base } = r2();
  const resp = await cliente.fetch(`${base}/${llave}`, {
    method: "PUT",
    body: bytes as unknown as BodyInit,
    headers: { "Content-Type": tipo },
  });
  if (!resp.ok) {
    throw new HttpError(`No se pudo guardar el archivo (R2 ${resp.status})`, 502);
  }
}

// ── El turno ────────────────────────────────────────────────────────────────
async function tomarCupo(sb: SupabaseClient, quien: string): Promise<number | null> {
  const { data, error } = await sb.rpc("tomar_cupo_de_conversion", { p_quien: quien });
  if (error) throw new HttpError(`No se pudo pedir turno: ${error.message}`, 500);
  return (data as number | null) ?? null;
}

async function soltarCupo(sb: SupabaseClient, slot: number): Promise<void> {
  // Si esto falla no se le dice a nadie: el cupo se recicla solo a los 2
  // minutos y el usuario ya tiene su PDF. El try/catch es obligatorio y no
  // `.catch()`: `sb.rpc()` devuelve un constructor de consulta, no una promesa.
  try {
    await sb.rpc("soltar_cupo_de_conversion", { p_slot: slot });
  } catch {
    /* el cupo vence solo */
  }
}

// ── Servidor ────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) throw new HttpError("Sin sesión", 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    // Con el token de la persona: solo para confirmar QUIÉN es. Convertir un
    // archivo que ya tiene en la mano no necesita más permiso que estar dentro
    // de Maven.
    const comoLaPersona = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: auth } = await comoLaPersona.auth.getUser();
    if (!auth?.user) throw new HttpError("Sesión inválida", 401);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const accion = String(body.action ?? "");
    const hash = String(body.hash ?? "");
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new HttpError("Hash inválido", 400);

    const llave = llaveDe(hash);

    if (accion === "check") {
      const listo = await existeEnR2(llave);
      return responder({ listo, url: listo ? await urlFirmada(llave, 3600) : null });
    }

    // ── El original, para abrirlo en ONLYOFFICE ────────────────────────────
    // Mismo trato de dos pasos que la conversión: primero se pregunta por la
    // huella, que es barato, y solo si no está se suben los bytes. Un adjunto
    // de 20 MB son ~27 MB en base64 y subirlos cada vez que alguien abre la
    // misma hoja de vida sería regalar tiempo y ancho de banda.
    if (accion === "check_original" || accion === "guardar_original") {
      const ext = extensionDe(String(body.filename ?? ""));
      if (!ONLYOFFICE_ABRE.has(ext)) {
        throw new HttpError(`ONLYOFFICE no abre un .${ext || "?"}`, 400);
      }
      const llaveOrig = llaveOriginal(hash, ext);

      if (await existeEnR2(llaveOrig)) {
        return responder({ listo: true, url: await urlFirmada(llaveOrig, 3600) });
      }
      if (accion === "check_original") return responder({ listo: false, url: null });

      const b64o = String(body.contentBase64 ?? "");
      if (!b64o) throw new HttpError("Sin archivo", 400);
      const bino = atob(b64o);
      if (bino.length > MAX_BYTES) {
        throw new HttpError(`El archivo pasa de ${MAX_BYTES / 1024 / 1024} MB`, 413);
      }
      const bytesO = new Uint8Array(bino.length);
      for (let i = 0; i < bino.length; i++) bytesO[i] = bino.charCodeAt(i);
      // Guardar el original NO consume cupo de conversión: no hay LibreOffice
      // de por medio, es subir bytes. Cobrarle el cupo haría que abrir tres
      // adjuntos seguidos entre en la fila de espera sin motivo.
      await subirAR2(llaveOrig, bytesO, MIME_ORIGINAL[ext]);
      return responder({ listo: true, url: await urlFirmada(llaveOrig, 3600) });
    }

    if (accion !== "convert") throw new HttpError("Acción desconocida", 400);

    const filename = String(body.filename ?? "archivo");
    const ext = extensionDe(filename);
    if (!CONVERTIBLES.has(ext)) {
      throw new HttpError(`No se convierte un .${ext || "?"}`, 400);
    }

    // Puede haberlo convertido otro mientras este pedido viajaba.
    if (await existeEnR2(llave)) {
      return responder({ url: await urlFirmada(llave, 3600), yaEstaba: true });
    }

    const b64 = String(body.contentBase64 ?? "");
    if (!b64) throw new HttpError("Sin archivo", 400);
    const bin = atob(b64);
    if (bin.length > MAX_BYTES) {
      throw new HttpError(`El archivo pasa de ${MAX_BYTES / 1024 / 1024} MB`, 413);
    }
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const cupo = await tomarCupo(admin, auth.user.id);
    if (cupo === null) {
      // 429 y no un error: el navegador reintenta solo. Es una fila de espera,
      // no una falla.
      return responder(
        { error: "Hay otras conversiones en curso. Reintentá en unos segundos.", reintentar: true },
        429,
      );
    }

    try {
      const pdf = await aPdf(admin, bytes, filename);
      await subirAR2(llave, pdf);
      return responder({ url: await urlFirmada(llave, 3600), bytes: pdf.length });
    } finally {
      await soltarCupo(admin, cupo);
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const mensaje = e instanceof Error ? e.message : "Error desconocido";
    if (status >= 500) console.error("[document-convert]", mensaje);
    return responder({ error: mensaje }, status);
  }
});

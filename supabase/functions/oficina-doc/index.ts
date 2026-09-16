// oficina-doc — el puente entre Maven y ONLYOFFICE.
//
// ONLYOFFICE no guarda nada: abre un archivo que le pasás por URL y, cuando la
// última persona cierra el documento, le avisa a quien vos le digas que hay una
// versión nueva para bajar. Todo lo demás —quién puede, dónde vive el archivo,
// qué versión es— lo pone Maven. Esta función es ese "todo lo demás".
//
// Acciones (con sesión de Maven):
//   crear  { titulo?, extension? } → { id }
//   abrir  { id }                  → { servidor, config }  ← se lo das al editor
//
// Y una que NO lleva sesión, porque la llama el servidor de ONLYOFFICE:
//   ?guardar=<token>               ← el aviso de "hay versión nueva"
//
// ⚠️ EL ARCHIVO NO PASA POR ACÁ AL ABRIR. A ONLYOFFICE se le entrega una URL
// firmada de R2 que vence en una hora: bajar el documento es entre él y
// Cloudflare. Proxearlo por la edge sería meter un archivo de megas en una
// función con 256 MB de memoria para no ganar nada.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

class HttpError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const EXTENSIONES = new Set(["docx", "xlsx", "pptx"]);

/** Qué editor de ONLYOFFICE abrir según el archivo. */
const TIPO_DE_EDITOR: Record<string, string> = {
  docx: "word", xlsx: "cell", pptx: "slide",
};

/** Un `.docx` vacío, válido y con hoja carta. Va acá adentro y no en R2 porque
 *  es la semilla de TODO documento nuevo: tenerlo en el código lo hace
 *  imposible de borrar por accidente. 2,3 KB. */
const DOCX_EN_BLANCO = [
  "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",
  "AABKBwAAAAA=",
].join("");

// ── Firma de ONLYOFFICE (JWT HS256, sin dependencias) ───────────────────────
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
async function firmar(payload: unknown, secreto: string): Promise<string> {
  const cabecera = textoAb64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const cuerpo = textoAb64url(JSON.stringify(payload));
  const firma = await crypto.subtle.sign(
    "HMAC", await clave(secreto), new TextEncoder().encode(`${cabecera}.${cuerpo}`),
  );
  return `${cabecera}.${cuerpo}.${b64url(new Uint8Array(firma))}`;
}

/** El aviso de guardado también viene firmado, y hay que comprobarlo: sin esta
 *  verificación cualquiera que adivine la URL podría reemplazar un documento. */
async function verificar(jwt: string, secreto: string): Promise<boolean> {
  const partes = jwt.split(".");
  if (partes.length !== 3) return false;
  const esperado = await crypto.subtle.sign(
    "HMAC", await clave(secreto), new TextEncoder().encode(`${partes[0]}.${partes[1]}`),
  );
  return b64url(new Uint8Array(esperado)) === partes[2];
}

// ── R2 ──────────────────────────────────────────────────────────────────────
function r2() {
  const cuenta = Deno.env.get("R2_ACCOUNT_ID");
  // Los dos nombres, como en creator-video y document-convert: el mismo valor
  // con el nombre del estándar S3 en un lado y el de Dokploy en el otro.
  const key = Deno.env.get("R2_ACCESS_KEY_ID") ?? Deno.env.get("R2_ACCESS_KEY");
  const secret = Deno.env.get("R2_SECRET_ACCESS_KEY") ?? Deno.env.get("R2_SECRET");
  const bucket = Deno.env.get("R2_BUCKET_OFICINA") ?? "maven-oficina";
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

async function urlFirmada(llave: string, segundos: number): Promise<string> {
  const { cliente, base } = r2();
  const firmada = await cliente.sign(
    new Request(`${base}/${llave}?X-Amz-Expires=${segundos}`, { method: "GET" }),
    { aws: { signQuery: true } },
  );
  return firmada.url;
}

async function subir(llave: string, bytes: Uint8Array, tipo: string): Promise<void> {
  const { cliente, base } = r2();
  const resp = await cliente.fetch(`${base}/${llave}`, {
    method: "PUT",
    body: bytes as unknown as BodyInit,
    headers: { "Content-Type": tipo },
  });
  if (!resp.ok) throw new HttpError(`No se pudo guardar el archivo (R2 ${resp.status})`, 502);
}

const MIME: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

// ── Servidor ────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), {
      status, headers: { ...CORS, "Content-Type": "application/json" },
    });

  const url = new URL(req.url);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const secretoOO = Deno.env.get("ONLYOFFICE_JWT_SECRET") ?? "";

  try {
    // ── El aviso de ONLYOFFICE ────────────────────────────────────────────
    // Llega SIN sesión de Maven: lo manda el servidor de ONLYOFFICE, no el
    // navegador. Se identifica con el permiso de un solo uso que le dimos al
    // abrir, y además viene firmado.
    const tokenGuardado = url.searchParams.get("guardar");
    if (tokenGuardado) {
      const cuerpo = await req.json().catch(() => ({} as Record<string, unknown>));

      if (secretoOO) {
        const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "") ||
          String(cuerpo.token ?? "");
        if (!jwt || !(await verificar(jwt, secretoOO))) {
          // ⚠️ Se responde 200 con error:1 y no un 4xx: ONLYOFFICE reintenta el
          // aviso ante cualquier respuesta que no entienda, y un rechazo mal
          // formado lo deja golpeando para siempre.
          console.error("[oficina-doc] aviso con firma inválida");
          return responder({ error: 1 });
        }
      }

      const { data: permiso } = await admin
        .from("document_edit_grants")
        .select("document_id, user_id, puede_guardar, expires_at")
        .eq("token", tokenGuardado)
        .maybeSingle();
      if (!permiso || !permiso.puede_guardar || new Date(permiso.expires_at) < new Date()) {
        console.error("[oficina-doc] permiso inexistente o vencido");
        return responder({ error: 1 });
      }

      // 2 = listo para guardar · 6 = guardado forzado mientras se edita.
      // 1 = alguien está escribiendo · 4 = cerró sin cambios: no hay nada que hacer.
      const estado = Number(cuerpo.status ?? 0);
      if (estado !== 2 && estado !== 6) return responder({ error: 0 });

      const deDonde = String(cuerpo.url ?? "");
      if (!deDonde) {
        console.error("[oficina-doc] aviso de guardado sin url");
        return responder({ error: 1 });
      }

      const { data: doc } = await admin
        .from("documents")
        .select("id, extension, version, storage_key")
        .eq("id", permiso.document_id)
        .maybeSingle();
      if (!doc) return responder({ error: 1 });

      const bajado = await fetch(deDonde);
      if (!bajado.ok) {
        console.error("[oficina-doc] no se pudo bajar de ONLYOFFICE:", bajado.status);
        return responder({ error: 1 });
      }
      const bytes = new Uint8Array(await bajado.arrayBuffer());

      const nuevaVersion = (doc.version as number) + 1;
      const llave = `documentos/${doc.id}/v${nuevaVersion}.${doc.extension}`;
      await subir(llave, bytes, MIME[doc.extension as string] ?? "application/octet-stream");

      // La versión ANTERIOR queda registrada antes de mover el puntero: si algo
      // falla después, el archivo viejo sigue siendo el vigente.
      if (doc.storage_key) {
        await admin.from("document_versions").insert({
          document_id: doc.id,
          version: doc.version,
          storage_key: doc.storage_key,
          saved_by: permiso.user_id,
        });
      }

      await admin
        .from("documents")
        .update({
          storage_key: llave,
          size_bytes: bytes.length,
          version: nuevaVersion,
          updated_by: permiso.user_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", doc.id);

      console.log(`[oficina-doc] ${doc.id} guardado v${nuevaVersion} (${bytes.length} bytes)`);
      return responder({ error: 0 });
    }

    // ── De acá para abajo, todo lleva sesión de Maven ──────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) throw new HttpError("Sin sesión", 401);
    const comoLaPersona = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: auth } = await comoLaPersona.auth.getUser();
    if (!auth?.user) throw new HttpError("Sesión inválida", 401);
    const user = auth.user;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const accion = String(body.action ?? "");

    if (accion === "crear") {
      const extension = String(body.extension ?? "docx");
      if (!EXTENSIONES.has(extension)) throw new HttpError("Formato no soportado", 400);
      if (extension !== "docx") {
        throw new HttpError("Por ahora solo documentos de texto (.docx)", 400);
      }

      const { data: fila, error } = await comoLaPersona
        .from("documents")
        .insert({
          title: String(body.titulo ?? "Sin título").slice(0, 200),
          visibility: body.visibility === "equipo" ? "equipo" : "privado",
          owner_id: user.id,
          updated_by: user.id,
          extension,
        })
        .select("id")
        .single();
      if (error) throw new HttpError(error.message, 400);

      const id = (fila as { id: string }).id;
      const llave = `documentos/${id}/v1.${extension}`;
      const bin = atob(DOCX_EN_BLANCO);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await subir(llave, bytes, MIME[extension]);
      await admin
        .from("documents")
        .update({ storage_key: llave, size_bytes: bytes.length })
        .eq("id", id);

      return responder({ id });
    }

    if (accion !== "abrir") throw new HttpError("Acción desconocida", 400);

    const servidor = (Deno.env.get("ONLYOFFICE_URL") ?? "").replace(/\/$/, "");
    if (!servidor) throw new HttpError("ONLYOFFICE_URL sin configurar", 500);

    const id = String(body.id ?? "");
    // Se consulta CON EL TOKEN DE LA PERSONA para que conteste la misma RLS que
    // gobierna el resto de Maven, en vez de reimplementar quién puede ver qué.
    const { data: doc, error: errDoc } = await comoLaPersona
      .from("documents")
      .select("id, title, extension, version, storage_key, owner_id, visibility")
      .eq("id", id)
      .maybeSingle();
    if (errDoc) throw new HttpError(errDoc.message, 400);
    if (!doc) throw new HttpError("Sin acceso a este documento", 403);
    if (!doc.storage_key) throw new HttpError("El documento todavía no tiene archivo", 409);

    const puedeEditar = doc.owner_id === user.id || doc.visibility === "equipo";

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const vence = new Date(Date.now() + 12 * 3600_000);
    await admin.rpc("limpiar_permisos_de_edicion");
    await admin.from("document_edit_grants").insert({
      token, document_id: doc.id, user_id: user.id,
      puede_guardar: puedeEditar, expires_at: vence.toISOString(),
    });

    const perfil = await comoLaPersona
      .from("profiles").select("full_name").eq("id", user.id).maybeSingle();

    const config: Record<string, unknown> = {
      documentType: TIPO_DE_EDITOR[doc.extension as string] ?? "word",
      document: {
        // ⚠️ La `key` DEBE cambiar cuando cambia el archivo. Si se repite,
        // ONLYOFFICE sirve la versión que tiene en caché y la persona jura que
        // no se guardó lo suyo.
        key: `${doc.id}-v${doc.version}`,
        title: `${doc.title}.${doc.extension}`,
        fileType: doc.extension,
        // URL firmada de R2: el archivo viaja entre ONLYOFFICE y Cloudflare sin
        // pasar por la edge.
        url: await urlFirmada(doc.storage_key as string, 3600),
        permissions: { edit: puedeEditar, download: true, print: true },
      },
      editorConfig: {
        lang: "es",
        mode: puedeEditar ? "edit" : "view",
        callbackUrl: puedeEditar
          ? `${supabaseUrl}/functions/v1/oficina-doc?guardar=${token}`
          : undefined,
        user: {
          id: user.id,
          name: (perfil.data?.full_name as string) || user.email || "Alguien",
        },
        customization: {
          autosave: true,
          forcesave: true,
          compactHeader: false,
          // No se toca el logo: la edición Community obliga a mantener la marca
          // de ONLYOFFICE, y quitarla exige licencia comercial.
        },
      },
    };
    if (secretoOO) config.token = await firmar(config, secretoOO);

    return responder({ servidor, config });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const mensaje = e instanceof Error ? e.message : "Error desconocido";
    if (status >= 500) console.error("[oficina-doc]", mensaje);
    return responder({ error: mensaje }, status);
  }
});

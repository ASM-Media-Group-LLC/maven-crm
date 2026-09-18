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
//   historial            { id }              → { currentVersion, history[] }
//   historial-version    { id, version }     → lo que come `setHistoryData`
//   historial-restaurar  { id, version }     → { version } la nueva vigente
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
import {
  archivoDeLaVersion, armarHistorial,
  type DocumentoParaHistorial, type FilaDeVersion,
} from "./historial.ts";
import { EN_BLANCO } from "./plantillas.ts";
import { ALLOWED_ORIGINS } from "../_shared/cors.ts";

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

async function bajar(llave: string): Promise<Uint8Array> {
  const { cliente, base } = r2();
  const resp = await cliente.fetch(`${base}/${llave}`, { method: "GET" });
  if (!resp.ok) throw new HttpError(`No se pudo leer el archivo (R2 ${resp.status})`, 502);
  return new Uint8Array(await resp.arrayBuffer());
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
      // `EXTENSIONES` es la única puerta: mientras exista la plantilla en
      // blanco del formato, se puede crear. Acá vivía además un `extension !==
      // "docx"` que sobraba desde que existen las tres — y que no se veía
      // leyendo las constantes, porque las constantes ya las aceptaban.
      if (!EXTENSIONES.has(extension)) throw new HttpError("Formato no soportado", 400);
      if (!EN_BLANCO[extension]) {
        throw new HttpError(`Falta la plantilla en blanco de .${extension}`, 500);
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
      // Cada formato nace de SU archivo en blanco: un .xlsx que por dentro
      // sea un .docx lo rechaza ONLYOFFICE sin explicar por qué.
      const bin = atob(EN_BLANCO[extension]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await subir(llave, bytes, MIME[extension]);
      await admin
        .from("documents")
        .update({ storage_key: llave, size_bytes: bytes.length })
        .eq("id", id);

      return responder({ id });
    }

    // ── Ver un ADJUNTO del correo en ONLYOFFICE ───────────────────────────
    // Antes un .docx o un .xlsx adjunto se convertían a PDF: se veía una FOTO
    // del documento. Las fórmulas de una hoja no se podían mirar, las pestañas
    // no se podían cambiar, y una tabla ancha salía cortada por el salto de
    // página que LibreOffice inventaba. Ahora se abre el archivo de verdad.
    //
    // La URL firmada la produce `document-convert` (que ya guarda el original
    // en R2 con caché por SHA-256); acá solo se arma y se FIRMA la config, que
    // es lo que no se puede hacer en el navegador sin regalar el secreto.
    if (accion === "adjunto") {
      const servidorOO = (Deno.env.get("ONLYOFFICE_URL") ?? "").replace(/\/$/, "");
      if (!servidorOO) throw new HttpError("ONLYOFFICE_URL sin configurar", 500);

      const url = String(body.url ?? "");
      const nombre = String(body.nombre ?? "adjunto").slice(0, 200);
      const hash = String(body.hash ?? "");
      const extension = String(body.extension ?? "");

      if (!EXTENSIONES.has(extension)) throw new HttpError("Formato no soportado", 400);
      if (!/^[0-9a-f]{64}$/.test(hash)) throw new HttpError("Hash inválido", 400);
      // ⚠️ La URL va DENTRO de la config firmada, y ONLYOFFICE la va a pedir
      // desde su servidor. Aceptar cualquiera la convertiría en un cliente
      // HTTP nuestro apuntando a donde diga quien llame. Solo R2.
      if (!/^https:\/\/[0-9a-f]+\.r2\.cloudflarestorage\.com\//.test(url)) {
        throw new HttpError("La URL del adjunto no es de R2", 400);
      }

      const perfilAdj = await comoLaPersona
        .from("profiles").select("full_name").eq("id", user.id).maybeSingle();

      const configAdj: Record<string, unknown> = {
        documentType: TIPO_DE_EDITOR[extension] ?? "word",
        document: {
          // La llave es el CONTENIDO: el mismo adjunto abierto por dos
          // personas es el mismo documento para ONLYOFFICE, que así lo cachea
          // una sola vez. Y como un adjunto no cambia nunca, la llave estable
          // no trae el problema de la caché vieja que sí tienen los nuestros.
          key: `adj-${hash.slice(0, 32)}`,
          title: nombre,
          fileType: extension,
          url,
          // ⚠️ SOLO LECTURA, y no por prudencia: un adjunto de un correo no es
          // un documento de Maven. No hay dónde guardarlo — el correo ya se
          // mandó. Dejar editar sería ofrecer un botón de guardar que no
          // guarda en ningún lado.
          permissions: { edit: false, download: true, print: true },
        },
        editorConfig: {
          lang: "es",
          mode: "view",
          // Sin `callbackUrl`: no hay a dónde avisar de un guardado que no
          // puede existir.
          user: {
            id: user.id,
            name: (perfilAdj.data?.full_name as string) || user.email || "Alguien",
          },
          customization: {
            compactHeader: true,
            toolbarHideFileName: true,
            hideRightMenu: true,
            chat: false,
            comments: false,
            feedback: false,
          },
        },
      };
      if (secretoOO) configAdj.token = await firmar(configAdj, secretoOO);
      return responder({ servidor: servidorOO, config: configAdj });
    }

    // ── De acá para abajo, todas las acciones son SOBRE UN DOCUMENTO ──────
    // Comparten el mismo control de acceso a propósito: tenerlo escrito una
    // sola vez es lo que evita que el historial termine siendo la puerta de
    // atrás que deja leer un documento que no se puede abrir.
    const ACCIONES_DE_DOC = new Set([
      "abrir", "historial", "historial-version", "historial-restaurar",
    ]);
    if (!ACCIONES_DE_DOC.has(accion)) throw new HttpError("Acción desconocida", 400);

    const id = String(body.id ?? "");
    // Se consulta CON EL TOKEN DE LA PERSONA para que conteste la misma RLS que
    // gobierna el resto de Maven, en vez de reimplementar quién puede ver qué.
    const { data: doc, error: errDoc } = await comoLaPersona
      .from("documents")
      .select("id, title, extension, version, storage_key, owner_id, visibility, created_at")
      .eq("id", id)
      .maybeSingle();
    if (errDoc) throw new HttpError(errDoc.message, 400);
    if (!doc) throw new HttpError("Sin acceso a este documento", 403);
    if (!doc.storage_key) throw new HttpError("El documento todavía no tiene archivo", 409);

    // ⚠️ El permiso COMPARTIDO tiene que llegar hasta acá. Si no, alguien a
    // quien le dieron permiso de editar abriría el documento en solo lectura
    // y no habría forma de darse cuenta desde la UI: ONLYOFFICE simplemente
    // no deja escribir.
    let puedeEditar = doc.owner_id === user.id || doc.visibility === "equipo";
    if (!puedeEditar) {
      // Con el cliente de la PERSONA: la RLS solo le deja ver su propia fila.
      const { data: compartido } = await comoLaPersona
        .from("document_shares")
        .select("puede_editar")
        .eq("document_id", doc.id)
        .eq("user_id", user.id)
        .maybeSingle();
      puedeEditar = !!(compartido as { puede_editar?: boolean } | null)?.puede_editar;
    }

    // ── Historial de versiones ────────────────────────────────────────────
    if (accion.startsWith("historial")) {
      const paraHistorial = doc as unknown as DocumentoParaHistorial;
      const { data: crudas, error: errVer } = await comoLaPersona
        .from("document_versions")
        .select("version, storage_key, saved_by, created_at")
        .eq("document_id", doc.id)
        .order("version", { ascending: true });
      if (errVer) throw new HttpError(errVer.message, 400);
      const filas = (crudas ?? []) as unknown as FilaDeVersion[];

      if (accion === "historial") {
        const entradas = armarHistorial(paraHistorial, filas);
        // Los nombres en una sola consulta. `profiles` es legible por cualquiera
        // con sesión, así que va con el cliente de la persona y no con el admin:
        // que el historial no pueda mostrar más de lo que ya se puede ver.
        const ids = [...new Set(entradas.map((e) => e.autorId).filter(Boolean))] as string[];
        const { data: perfiles } = ids.length
          ? await comoLaPersona.from("profiles").select("id, full_name").in("id", ids)
          : { data: [] };
        const nombre = new Map(
          ((perfiles ?? []) as { id: string; full_name: string | null }[])
            .map((p) => [p.id, p.full_name]),
        );
        return responder({
          currentVersion: doc.version,
          // Las fechas viajan en ISO y las formatea el NAVEGADOR: el panel las
          // muestra tal cual y la edge no sabe en qué huso está quien mira.
          history: entradas.map((e) => ({
            version: e.version,
            key: e.key,
            created: e.created,
            user: e.autorId ? { id: e.autorId, name: nombre.get(e.autorId) || "Alguien" } : undefined,
          })),
        });
      }

      const version = Number(body.version ?? 0);
      if (!Number.isInteger(version) || version < 1 || version > doc.version) {
        throw new HttpError("Esa versión no existe", 400);
      }

      if (accion === "historial-version") {
        const llave = archivoDeLaVersion(paraHistorial, filas, version);
        if (!llave) throw new HttpError("Esa versión ya no tiene archivo", 410);
        // ⚠️ Este objeto lo recibe el editor en vivo, no viaja dentro del config
        // firmado de la apertura: tiene que llevar SU PROPIA firma o el servidor
        // lo rechaza cuando JWT está prendido.
        const datos: Record<string, unknown> = {
          fileType: doc.extension,
          key: `${doc.id}-v${version}`,
          url: await urlFirmada(llave, 3600),
          version,
        };
        if (secretoOO) datos.token = await firmar(datos, secretoOO);
        return responder(datos);
      }

      // ── Restaurar ───────────────────────────────────────────────────────
      // NO se pisa nada: la versión vieja se copia como una versión NUEVA, que
      // es lo que hace Google. Restaurar borrando sería perder lo que había.
      if (!puedeEditar) throw new HttpError("No podés editar este documento", 403);
      if (version === doc.version) throw new HttpError("Esa ya es la versión vigente", 400);

      const origen = archivoDeLaVersion(paraHistorial, filas, version);
      if (!origen) throw new HttpError("Esa versión ya no tiene archivo", 410);
      if (!doc.storage_key) throw new HttpError("El documento no tiene archivo", 409);

      const bytes = await bajar(origen);
      const nuevaVersion = (doc.version as number) + 1;
      const destino = `documentos/${doc.id}/v${nuevaVersion}.${doc.extension}`;
      await subir(destino, bytes, MIME[doc.extension as string] ?? "application/octet-stream");

      // El mismo orden que el guardado normal: primero se archiva la vigente y
      // recién después se mueve el puntero. Si algo falla en el medio, el
      // documento sigue siendo el que era.
      await admin.from("document_versions").insert({
        document_id: doc.id,
        version: doc.version,
        storage_key: doc.storage_key,
        saved_by: user.id,
      });
      await admin.from("documents").update({
        storage_key: destino,
        size_bytes: bytes.length,
        version: nuevaVersion,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }).eq("id", doc.id);

      console.log(`[oficina-doc] ${doc.id} restaurado v${version} como v${nuevaVersion}`);
      return responder({ version: nuevaVersion });
    }

    const servidor = (Deno.env.get("ONLYOFFICE_URL") ?? "").replace(/\/$/, "");
    if (!servidor) throw new HttpError("ONLYOFFICE_URL sin configurar", 500);

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const vence = new Date(Date.now() + 12 * 3600_000);
    await admin.rpc("limpiar_permisos_de_edicion");
    await admin.from("document_edit_grants").insert({
      token, document_id: doc.id, user_id: user.id,
      puede_guardar: puedeEditar, expires_at: vence.toISOString(),
    });

    const perfil = await comoLaPersona
      .from("profiles").select("full_name").eq("id", user.id).maybeSingle();

    // ── Tema y botón de volver ────────────────────────────────────────────
    // El tema lo sabe el NAVEGADOR (Maven tiene su propio claro/oscuro, que no
    // tiene por qué coincidir con el del sistema operativo), así que viaja en
    // el pedido. `theme-night` y `theme-white` son los valores por defecto de
    // ONLYOFFICE para oscuro y claro.
    //
    // ⚠️ Si la persona cambia el tema DENTRO del editor, ONLYOFFICE lo guarda
    // en su localStorage y a partir de ahí le gana a lo que mandemos. Es lo
    // que queremos: su elección explícita pesa más que nuestra sugerencia.
    const uiTheme = body.tema === "dark"
      ? "theme-night"
      : body.tema === "light"
        ? "theme-white"
        : undefined;

    // La URL de vuelta NO se acepta del cliente: se arma con el origen del
    // pedido y solo si está en la allowlist que ya usa el CORS de Maven. Un
    // `goback.url` libre sería un enlace a donde quisiera quien llame.
    const origen = req.headers.get("origin") ?? "";
    const volverA = ALLOWED_ORIGINS.includes(origen) ? `${origen}/oficina` : null;

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
        // ── Personalización ───────────────────────────────────────────────
        // ⚠️ SOLO lo que la edición Community permite. `logo` y `customer`
        // están marcados "available only for ONLYOFFICE Docs Developer" en la
        // API, y además la AGPL obliga a mantener la marca de ONLYOFFICE
        // visible: no se toca ni se intenta rodear.
        customization: {
          autosave: true,
          forcesave: true,
          // La barra de Maven ya muestra el título y la versión arriba del
          // editor: repetirlos adentro es una fila entera de pantalla gastada
          // en decir dos veces lo mismo.
          compactHeader: true,
          toolbarHideFileName: true,
          // El panel derecho arranca plegado. Se abre con un clic y mientras
          // tanto el documento tiene todo el ancho.
          hideRightMenu: true,
          // ⚠️ El chat del editor SE APAGA. Maven ya tiene Messenger; dejar un
          // segundo lugar para hablar adentro del documento es una trampa:
          // alguien escribe ahí y nadie lo ve nunca.
          chat: false,
          // Los comentarios SÍ quedan: van anclados a un punto del documento,
          // que es algo que el Messenger no puede hacer.
          comments: true,
          // El enlace de feedback apunta a ONLYOFFICE, no a nosotros.
          feedback: false,
          features: { spellcheck: true },
          ...(volverA ? { goback: { text: "Volver a Oficina", url: volverA, blank: false } } : {}),
          ...(uiTheme ? { uiTheme } : {}),
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

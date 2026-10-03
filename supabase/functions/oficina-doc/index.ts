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
//   adjunto      { url, nombre, hash, extension } → { servidor, config } (correo)
//   ver_drive    { id, tema?, idioma? }     → { servidor, config } solo lectura
//   editar_drive { id, tema?, idioma? }     → { servidor, config, modo, motivo, archivo }
//                                             EL MISMO archivo, en modo edición
//   desde_drive  { id }                     → { id, extension } copia editable
//
// (Las dos últimas son para archivos del DRIVE, que viven en el NAS: ver
// drive.ts.)
//
// Y dos que NO llevan sesión, porque las llama el servidor de ONLYOFFICE:
//   ?guardar=<token>               ← el aviso de "hay versión nueva"
//   ?guardar_drive=<permiso>       ← lo mismo, para un archivo del Drive
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
import { firmar, verificar } from "./jwt.ts";
import {
  adivinarDelimitador, codigoDePagina, comoSeAbre, configDeEdicion, configDeVista, errorDeConversion, esDelServidor,
  esUuid, filasDeVersion, formatoDeOffice, nombreSinExtension, pedidoDeConversion, queHacerConElAviso, restauradaEl,
  TAMANO_PARTE_NAS, textoDeMuestra, TOPE_COPIA, TOPE_VISTA,
} from "./drive.ts";
import { ALLOWED_ORIGINS } from "../_shared/cors.ts";
import {
  ahoraMas, firmar as firmarPermisoDelNas, verificar as verificarPermisoDelNas, VENCE,
} from "../_shared/drive-firma.ts";

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

// ── El Drive (NAS) ──────────────────────────────────────────────────────────
// Los archivos del Drive viven en el NAS, no en R2. Para que ONLYOFFICE (o esta
// misma edge) los baje se firma un permiso de lectura con el mismo secreto que
// usa la edge `drive` (ver _shared/drive-firma.ts e infra/nas-drive).

interface FichaDelDrive {
  id: string;
  owner_id: string | null;
  tipo: string;
  nombre: string;
  mime: string | null;
  size: number | null;
  sha256: string | null;
  storage_key: string | null;
  estado: string;
  updated_at: string;
  /** Si es una versión vieja restaurada, cuándo (para la llave de ONLYOFFICE). */
  restaurada_at?: string | null;
}

/** La ficha, leída CON EL TOKEN DE LA PERSONA: si la RLS de drive_items no se
 *  la muestra, no hay vista ni copia. Es el mismo control que la acción
 *  `abrir` de la edge `drive`. */
async function fichaDelDrive(comoLaPersona: SupabaseClient, id: string): Promise<FichaDelDrive> {
  const { data, error } = await comoLaPersona.from("drive_items")
    .select("id, owner_id, tipo, nombre, mime, size, sha256, storage_key, estado, updated_at")
    .eq("id", id).maybeSingle();
  if (error) throw new HttpError(error.message, 400);
  const fila = data as FichaDelDrive | null;
  if (!fila || fila.tipo !== "archivo" || !fila.storage_key) throw new HttpError("No existe o no tienes acceso", 404);
  if (fila.estado !== "listo") throw new HttpError("El archivo todavía se está subiendo", 409);
  // ¿Es una versión vieja restaurada? Entra en la llave de ONLYOFFICE (ver
  // claveDeDrive). Sin la tabla (migración sin aplicar), no hay versiones.
  const { data: mismas, error: eV } = await comoLaPersona.from("drive_versiones")
    .select("created_at").eq("item_id", fila.id).eq("storage_key", fila.storage_key)
    .order("created_at", { ascending: false }).limit(2);
  if (eV && eV.code !== "42P01" && eV.code !== "PGRST205") throw new HttpError(eV.message, 500);
  fila.restaurada_at = restauradaEl((mismas ?? []) as { created_at: string }[]);
  return fila;
}

/** URL firmada para leer un archivo del NAS. */
async function urlDelNas(fila: FichaDelDrive, segundos: number): Promise<string> {
  const base = (Deno.env.get("DRIVE_NAS_URL") ?? "").replace(/\/+$/, "");
  const secreto = Deno.env.get("DRIVE_SECRETO") ?? "";
  if (!base || secreto.length < 32) throw new HttpError("El Drive todavía no está conectado al NAS", 503);
  const permiso = await firmarPermisoDelNas(secreto, {
    op: "get", k: fila.storage_key!, ct: fila.mime ?? "application/octet-stream", n: fila.nombre, dl: false,
    e: ahoraMas(segundos),
  });
  return `${base}/o?t=${permiso}`;
}

/** El secreto del Drive (el mismo del NAS y de la edge `drive`). */
function secretoDelDrive(): string {
  const secreto = Deno.env.get("DRIVE_SECRETO") ?? "";
  if (secreto.length < 32) throw new HttpError("El Drive todavía no está conectado al NAS", 503);
  return secreto;
}

/** Guarda bytes en el NAS como un archivo NUEVO (`clave` nunca existió: el NAS
 *  rechaza pisar uno) y devuelve lo que firmó el NAS al terminar de escribir.
 *  Entero si entra en una parte; si no, por partes, como una subida del Drive. */
async function guardarEnElNas(clave: string, bytes: Uint8Array): Promise<{ size: number; sha256: string }> {
  const base = (Deno.env.get("DRIVE_NAS_URL") ?? "").replace(/\/+$/, "");
  const secreto = secretoDelDrive();
  if (!base) throw new HttpError("El Drive todavía no está conectado al NAS", 503);
  const permiso = async (datos: Record<string, unknown>) =>
    `${base}/o?t=${await firmarPermisoDelNas(secreto, { ...datos, e: ahoraMas(VENCE.subir) } as never)}`;
  const enviar = async (url: string, metodo: string, cuerpo: Uint8Array | null) => {
    const r = await fetch(url, { method: metodo, body: cuerpo as unknown as BodyInit, signal: AbortSignal.timeout(120_000) });
    const j = await r.json().catch(() => null) as { recibo?: string; error?: string } | null;
    if (!r.ok) throw new HttpError(`El NAS no pudo guardar (${r.status}${j?.error ? `: ${j.error}` : ""})`, 502);
    return j;
  };
  let respuesta: { recibo?: string } | null;
  if (bytes.length <= TAMANO_PARTE_NAS) {
    respuesta = await enviar(await permiso({ op: "put", k: clave, max: bytes.length }), "PUT", bytes);
  } else {
    const up = crypto.randomUUID();
    const n = Math.ceil(bytes.length / TAMANO_PARTE_NAS);
    for (let i = 0; i < n; i++) {
      const pedazo = bytes.subarray(i * TAMANO_PARTE_NAS, (i + 1) * TAMANO_PARTE_NAS);
      await enviar(await permiso({ op: "parte", k: clave, up, i, max: TAMANO_PARTE_NAS, total: bytes.length }), "PUT", pedazo);
    }
    respuesta = await enviar(await permiso({ op: "completar", k: clave, up, n, max: bytes.length }), "POST", null);
  }
  const rec = await verificarPermisoDelNas(secreto, String(respuesta?.recibo ?? ""));
  if (!rec || rec.op !== "recibo" || rec.k !== clave) throw new HttpError("El recibo del NAS no es válido", 502);
  return { size: Number(rec.size), sha256: String(rec.sha256) };
}

/** Abrir un archivo cuenta para lo que se archiva (la fecha de la ficha, de
 *  todos) y para MIS «Recientes» (drive_aperturas, de cada uno). Sin `throw`:
 *  nunca impide abrir. */
async function anotarApertura(admin: SupabaseClient, fila: { id: string }, user: { id: string }): Promise<void> {
  const ahora = new Date().toISOString();
  await admin.from("drive_items").update({ last_opened_at: ahora }).eq("id", fila.id);
  await admin.from("drive_aperturas").upsert({ user_id: user.id, item_id: fila.id, abierto_at: ahora }, { onConflict: "user_id,item_id" });
}

const enHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** ¿Hay lugar para guardar ediciones de este archivo? Como una subida: dentro
 *  de una unidad compartida cuenta el espacio de la AGENCIA; si no, el cupo
 *  del DUEÑO del archivo (no el de quien edita, como en Google). Lo importado
 *  sin dueño fuera de una unidad no cuenta en el cupo de nadie.
 *
 *  Se mira al ABRIR, no al guardar: al guardar ya no hay a quién avisarle y
 *  rechazarlo sería perder lo escrito. Con el espacio lleno se abre para ver. */
async function hayEspacioParaEditar(
  admin: SupabaseClient, comoLaPersona: SupabaseClient, fila: FichaDelDrive, yo: string,
): Promise<boolean> {
  const fila1 = (data: unknown) => (Array.isArray(data) ? data[0] : data) as { usado?: number; cupo?: number | null } | undefined;
  const { data: unidad, error: eU } = await admin.rpc("drive_unidad_de", { p_item: fila.id });
  if (eU) throw new HttpError(eU.message, 500);
  if (unidad) {
    // Como la persona: es de la misma agencia que el archivo (la RLS la dejó
    // verlo), y la función mide la agencia de quien llama.
    const { data, error } = await comoLaPersona.rpc("drive_uso_agencia");
    if (error) throw new HttpError(error.message, 500);
    const f = fila1(data);
    return f?.cupo == null || Number(f.usado ?? 0) < Number(f.cupo);
  }
  if (!fila.owner_id) return true;
  const { data, error } = fila.owner_id === yo
    ? await comoLaPersona.rpc("drive_uso")
    // El cupo del dueño: con el admin (drive_uso deja a service_role medir a
    // cualquiera; a una persona, solo el suyo).
    : await admin.rpc("drive_uso", { p_user: fila.owner_id });
  if (error) throw new HttpError(error.message, 500);
  const f = fila1(data);
  const cupo = Number(f?.cupo ?? 0);
  return cupo <= 0 || Number(f?.usado ?? 0) < cupo;
}

/** Baja una URL entera a memoria, cortando si pasa del tope: un archivo más
 *  grande de lo que dice la ficha no puede tumbar la edge. */
async function bajarConTope(url: string, tope: number, cabeceras: Record<string, string> = {}): Promise<Uint8Array> {
  const r = await fetch(url, { headers: cabeceras, signal: AbortSignal.timeout(90_000) });
  if (!r.ok || !r.body) throw new HttpError(`No se pudo leer el archivo (${r.status})`, 502);
  const partes: Uint8Array[] = [];
  let total = 0;
  const lector = r.body.getReader();
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.length;
    if (total > tope) {
      await lector.cancel();
      throw new HttpError("El archivo es demasiado grande para copiarlo a la Oficina", 413);
    }
    partes.push(value);
  }
  const bytes = new Uint8Array(total);
  let i = 0;
  for (const p of partes) { bytes.set(p, i); i += p.length; }
  return bytes;
}

/** Convierte con el conversor de ONLYOFFICE (.doc → .docx, .csv → .xlsx…) y
 *  devuelve el archivo convertido. ONLYOFFICE baja el original del NAS por su
 *  cuenta; acá solo se baja el resultado.
 *
 *  La firma va en el cuerpo (`token`) y también en la cabecera: según la
 *  configuración del servidor se mira una u otra, y mandar las dos no estorba. */
async function convertirConOnlyOffice(
  servidor: string, secreto: string, pedido: Record<string, unknown>,
): Promise<Uint8Array> {
  const cabeceras: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  const cuerpo: Record<string, unknown> = { ...pedido };
  if (secreto) {
    cuerpo.token = await firmar(pedido, secreto);
    cabeceras.Authorization = `Bearer ${await firmar({ payload: pedido }, secreto)}`;
  }
  // Con `async: false` ONLYOFFICE contesta cuando termina o, si tarda, con el
  // porcentaje: se vuelve a preguntar con la MISMA llave hasta que termine.
  const hasta = Date.now() + 100_000;
  for (;;) {
    const r = await fetch(`${servidor}/converter`, {
      method: "POST", headers: cabeceras, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(90_000),
    });
    if (!r.ok) throw new HttpError(`El servidor de Oficina no pudo convertir el archivo (${r.status})`, 502);
    const res = await r.json().catch(() => null) as
      { error?: number; endConvert?: boolean; fileUrl?: string } | null;
    if (!res) throw new HttpError("El servidor de Oficina contestó algo inesperado al convertir", 502);
    if (typeof res.error === "number" && res.error !== 0) throw new HttpError(errorDeConversion(res.error), 502);
    if (res.endConvert && res.fileUrl) {
      if (!esDelServidor(res.fileUrl, servidor)) throw new HttpError("La conversión devolvió una dirección inesperada", 502);
      return await bajarConTope(res.fileUrl, TOPE_COPIA);
    }
    if (Date.now() > hasta) throw new HttpError(errorDeConversion(-2), 504);
    await new Promise((listo) => setTimeout(listo, 2000));
  }
}

const legibleMB = (b: number) => `${Math.round(b / (1024 * 1024))} MB`;

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

    // ── El aviso de ONLYOFFICE para un archivo del DRIVE ─────────────────
    // Como el de arriba, sin sesión: lo manda el servidor de ONLYOFFICE con el
    // permiso que se firmó al abrir (editar_drive). El archivo editado se guarda
    // en el NAS como un archivo NUEVO; el anterior se queda donde está y entra
    // al historial (drive_versiones). Nunca se pisa nada: lo importado de
    // Google (<agencia>/google/<id>) el NAS ni siquiera lo deja tocar.
    const permisoDrive = url.searchParams.get("guardar_drive");
    if (permisoDrive) {
      const cuerpo = await req.json().catch(() => ({} as Record<string, unknown>));
      if (secretoOO) {
        const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "") ||
          String(cuerpo.token ?? "");
        if (!jwt || !(await verificar(jwt, secretoOO))) {
          console.error("[oficina-doc] aviso del Drive con firma inválida");
          return responder({ error: 1 });
        }
      }
      const secreto = Deno.env.get("DRIVE_SECRETO") ?? "";
      const permiso = secreto.length >= 32 ? await verificarPermisoDelNas(secreto, permisoDrive) : null;
      if (!permiso || permiso.op !== "oo-guardar" || !esUuid(permiso.k)) {
        console.error("[oficina-doc] permiso de guardado del Drive inválido o vencido");
        return responder({ error: 1 });
      }
      const servidorOO = (Deno.env.get("ONLYOFFICE_URL") ?? "").replace(/\/$/, "");

      const { data: crudo } = await admin.from("drive_items")
        .select("id, tenant_id, owner_id, tipo, nombre, mime, size, sha256, storage_key, updated_at")
        .eq("id", permiso.k).maybeSingle();
      const fila = crudo as {
        id: string; tenant_id: string; owner_id: string | null; tipo: string; nombre: string; mime: string | null;
        size: number | null; sha256: string | null; storage_key: string | null; updated_at: string;
      } | null;
      if (!fila || fila.tipo !== "archivo" || !fila.storage_key) {
        // Lo borraron para siempre mientras estaba abierto: no hay dónde guardar.
        console.error(`[oficina-doc] aviso para ${permiso.k}: el archivo ya no existe`);
        return responder({ error: 0 });
      }
      const formato = formatoDeOffice(fila.nombre, fila.mime);
      const que = formato
        ? queHacerConElAviso(cuerpo, formato.ext, servidorOO)
        : { accion: "rechazar" as const, motivo: "el archivo ya no es de Office" };
      if (que.accion === "nada") {
        if (/error/.test(que.motivo)) console.error(`[oficina-doc] ${fila.id}: ${que.motivo}`);
        return responder({ error: 0 });
      }
      if (que.accion === "rechazar") {
        // Con error, ONLYOFFICE se queda con lo editado (lista de «olvidados»)
        // en vez de darlo por guardado.
        console.error(`[oficina-doc] ${fila.id}: no se guardó: ${que.motivo}`);
        return responder({ error: 1 });
      }

      try {
        const bytes = await bajarConTope(que.url, TOPE_VISTA);
        const huella = enHex(await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource));
        if (huella === fila.sha256) return responder({ error: 0 }); // nada cambió de verdad

        const llave = `${fila.tenant_id}/${crypto.randomUUID()}`;
        const nas = await guardarEnElNas(llave, bytes);
        if (nas.sha256 !== huella || nas.size !== bytes.length) {
          throw new HttpError("El NAS guardó otra cosa de la que se mandó", 502);
        }
        const usuarios = Array.isArray(cuerpo.users) ? cuerpo.users : [];
        const quien = esUuid(usuarios[0]) ? usuarios[0] : esUuid(permiso.u) ? permiso.u : null;
        const ahora = new Date().toISOString();

        // 1. El historial, ANTES de mover el puntero (como document_versions).
        //    Si falla, se guarda igual: perder lo escrito es peor que un
        //    archivo viejo sin anotar (queda en el log para encontrarlo).
        const { count, error: eC } = await admin.from("drive_versiones")
          .select("id", { count: "exact", head: true }).eq("item_id", fila.id);
        const { error: eV } = eC ? { error: eC } : await admin.from("drive_versiones").insert(filasDeVersion({
          itemId: fila.id,
          anterior: { storage_key: fila.storage_key, size: fila.size, sha256: fila.sha256, updated_at: fila.updated_at, owner_id: fila.owner_id },
          hayHistorial: (count ?? 0) > 0,
          nueva: { storage_key: llave, size: bytes.length, sha256: huella },
          quien,
          ahora,
        }));
        if (eV) console.error(`[oficina-doc] ${fila.id}: sin historial (${eV.message}); la versión anterior sigue en el NAS en ${fila.storage_key}`);

        // 2. El puntero, solo si nadie lo movió mientras tanto.
        const { data: movida, error: eU } = await admin.from("drive_items")
          .update({ storage_key: llave, size: bytes.length, sha256: huella, updated_at: ahora })
          .eq("id", fila.id).eq("storage_key", fila.storage_key)
          .select("id");
        if (eU) throw new HttpError(eU.message, 500);
        if (!movida?.length) {
          console.error(`[oficina-doc] ${fila.id}: otro guardado llegó antes; esta edición quedó en ${llave} (historial)`);
          return responder({ error: 0 });
        }
        console.log(`[oficina-doc] Drive ${fila.id} guardado en ${llave} (${bytes.length} bytes)`);
        return responder({ error: 0 });
      } catch (e) {
        console.error(`[oficina-doc] ${fila.id}: no se pudo guardar:`, e instanceof Error ? e.message : e);
        return responder({ error: 1 });
      }
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

    // ── Un archivo del DRIVE en ONLYOFFICE ────────────────────────────────
    // `ver_drive`: el visor del Drive abre un Word, un Excel o un PowerPoint
    // sin bajarlo, en modo lectura. `desde_drive`: «Editar en Documentos de
    // Maven», una copia editable en la Oficina (el original sigue en el Drive,
    // como cuando Google abre un .docx con Documentos de Google).
    //
    // ⚠️ La ficha se lee con el token de la persona (fichaDelDrive): la RLS de
    // drive_items decide, igual que en la acción `abrir` de la edge `drive`.
    // ── EDITAR un archivo del Drive en su lugar ─────────────────────────────
    // Como el «modo de edición de Office» de Google: se abre EL MISMO archivo y
    // lo guardado vuelve a él (con historial), así que abrirlo dos veces nunca
    // crea dos copias. Se edita si la persona es dueña o editora, el formato
    // vuelve igual de ONLYOFFICE (SE_EDITAN_EN_SU_LUGAR) y hay espacio; si no,
    // se abre para ver y `motivo` dice por qué (la página ofrece la copia).
    if (accion === "editar_drive") {
      const servidorOO = (Deno.env.get("ONLYOFFICE_URL") ?? "").replace(/\/$/, "");
      if (!servidorOO) throw new HttpError("ONLYOFFICE_URL sin configurar", 500);
      const fila = await fichaDelDrive(comoLaPersona, String(body.id ?? ""));
      const formato = formatoDeOffice(fila.nombre, fila.mime);
      if (!formato) throw new HttpError("Este archivo no se abre con la Oficina", 400);
      if (Number(fila.size ?? 0) > TOPE_VISTA) {
        throw new HttpError(`El archivo pesa más de ${legibleMB(TOPE_VISTA)} y no se puede abrir aquí: descárgalo`, 413);
      }
      const idioma = body.idioma === "en" ? "en" : "es";
      const tema = body.tema === "dark" ? "dark" : body.tema === "light" ? "light" : undefined;
      const perfil = await comoLaPersona.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      const usuario = { id: user.id, nombre: (perfil.data?.full_name as string) || user.email || "Alguien" };
      const archivo = { id: fila.id, nombre: fila.nombre, mime: fila.mime, size: fila.size, updated_at: fila.updated_at };

      let motivo: "formato" | "permiso" | "espacio" | null = comoSeAbre(formato) === "editar" ? null : "formato";
      if (!motivo) {
        const { data: rol, error: eR } = await comoLaPersona.rpc("drive_mi_rol", { p_item: fila.id });
        if (eR) throw new HttpError(eR.message, 500);
        if (rol !== "dueno" && rol !== "editor") motivo = "permiso";
      }
      if (!motivo && !(await hayEspacioParaEditar(admin, comoLaPersona, fila, user.id))) motivo = "espacio";

      await anotarApertura(admin, fila, user);
      const urlArchivo = await urlDelNas(fila, VENCE.bajar);
      if (motivo) {
        const config = configDeVista({ archivo: fila, formato, url: urlArchivo, usuario, idioma, tema });
        if (secretoOO) config.token = await firmar(config, secretoOO);
        return responder({ servidor: servidorOO, config, modo: "ver", motivo, archivo });
      }

      // A dónde avisa ONLYOFFICE al guardar: un permiso firmado con el secreto
      // del Drive, solo para ESTE archivo. Dura días y no horas: una hoja puede
      // quedar abierta un fin de semana, y el aviso llega recién al cerrarla.
      const permiso = await firmarPermisoDelNas(secretoDelDrive(), {
        op: "oo-guardar", k: fila.id, u: user.id, e: ahoraMas(3 * 24 * 3600),
      });
      const origen = req.headers.get("origin") ?? "";
      const config = configDeEdicion({
        archivo: fila,
        formato,
        url: urlArchivo,
        callbackUrl: `${supabaseUrl}/functions/v1/oficina-doc?guardar_drive=${encodeURIComponent(permiso)}`,
        usuario,
        idioma,
        tema,
        volverA: ALLOWED_ORIGINS.includes(origen) ? `${origen}/oficina/drive` : null,
      });
      if (secretoOO) config.token = await firmar(config, secretoOO);
      return responder({ servidor: servidorOO, config, modo: "editar", motivo: null, archivo });
    }

    if (accion === "ver_drive" || accion === "desde_drive") {
      const servidorOO = (Deno.env.get("ONLYOFFICE_URL") ?? "").replace(/\/$/, "");
      if (!servidorOO) throw new HttpError("ONLYOFFICE_URL sin configurar", 500);
      const fila = await fichaDelDrive(comoLaPersona, String(body.id ?? ""));
      const formato = formatoDeOffice(fila.nombre, fila.mime);
      if (!formato) throw new HttpError("Este archivo no se abre con la Oficina", 400);
      const peso = Number(fila.size ?? 0);

      if (accion === "ver_drive") {
        if (peso > TOPE_VISTA) {
          throw new HttpError(`El archivo pesa más de ${legibleMB(TOPE_VISTA)} y no se puede ver aquí: descárgalo`, 413);
        }
        const perfil = await comoLaPersona.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
        const config = configDeVista({
          archivo: fila,
          formato,
          // Dura lo mismo que un «abrir» del Drive: ONLYOFFICE lo baja al
          // cargar, pero un documento grande puede quedar abierto horas.
          url: await urlDelNas(fila, VENCE.bajar),
          usuario: { id: user.id, nombre: (perfil.data?.full_name as string) || user.email || "Alguien" },
          idioma: body.idioma === "en" ? "en" : "es",
          tema: body.tema === "dark" ? "dark" : body.tema === "light" ? "light" : undefined,
        });
        if (secretoOO) config.token = await firmar(config, secretoOO);
        // Verlo ES abrirlo: cuenta para lo que se archiva (la fecha de la
        // ficha, de todos) y para MIS «Recientes» (la apertura de cada uno).
        await anotarApertura(admin, fila, user);
        return responder({ servidor: servidorOO, config });
      }

      // ── desde_drive: la copia editable ──────────────────────────────────
      if (peso > TOPE_COPIA) {
        throw new HttpError(`El archivo pesa más de ${legibleMB(TOPE_COPIA)}: es demasiado grande para copiarlo a la Oficina`, 413);
      }
      // Primero se consiguen los bytes y RECIÉN DESPUÉS se crea el documento:
      // si el NAS o la conversión fallan, no queda un documento vacío en la
      // lista de la persona.
      let bytes: Uint8Array;
      if (formato.ext === formato.destino) {
        // Ya es .docx, .xlsx o .pptx: se copia tal cual.
        bytes = await bajarConTope(await urlDelNas(fila, 10 * 60), TOPE_COPIA);
      } else {
        // Un CSV o un .txt no dicen su codificación (ni el CSV su
        // separador): se mira el principio del archivo.
        let delimitador: number | undefined;
        let codePage: number | undefined;
        if (formato.ext === "csv" || formato.ext === "txt") {
          const muestra = await bajarConTope(await urlDelNas(fila, 10 * 60), 64 * 1024, { Range: "bytes=0-16383" })
            .catch(() => new Uint8Array());
          codePage = codigoDePagina(muestra);
          if (formato.ext === "csv") delimitador = adivinarDelimitador(textoDeMuestra(muestra, codePage));
        }
        bytes = await convertirConOnlyOffice(servidorOO, secretoOO, pedidoDeConversion({
          archivo: fila, formato, url: await urlDelNas(fila, 30 * 60), delimitador, codePage,
        }));
      }

      const { data: nuevo, error: errNuevo } = await comoLaPersona
        .from("documents")
        .insert({
          title: nombreSinExtension(fila.nombre).slice(0, 200),
          visibility: "privado",
          owner_id: user.id,
          updated_by: user.id,
          extension: formato.destino,
        })
        .select("id")
        .single();
      if (errNuevo) throw new HttpError(errNuevo.message, 400);
      const docId = (nuevo as { id: string }).id;
      const llave = `documentos/${docId}/v1.${formato.destino}`;
      try {
        await subir(llave, bytes, MIME[formato.destino]);
        const { error: errLlave } = await admin.from("documents")
          .update({ storage_key: llave, size_bytes: bytes.length }).eq("id", docId);
        if (errLlave) throw new HttpError(errLlave.message, 500);
      } catch (e) {
        // Sin archivo, el documento no abre nunca: mejor que no exista.
        await admin.from("documents").delete().eq("id", docId);
        throw e;
      }
      console.log(`[oficina-doc] copia del Drive ${fila.id} → documento ${docId} (${bytes.length} bytes)`);
      // Copiarlo a la Oficina TAMBIÉN es abrirlo: cuenta para lo que se
      // archiva y para MIS «Recientes», como en `ver_drive`. Sin `throw`: la
      // copia ya está hecha y es lo que la persona pidió.
      await anotarApertura(admin, fila, user);
      return responder({ id: docId, extension: formato.destino });
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
      if (!puedeEditar) throw new HttpError("No puedes editar este documento", 403);
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

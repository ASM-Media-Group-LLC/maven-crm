import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ahoraMas, firmar, VENCE } from "../_shared/drive-firma.ts";
import {
  armarListaDelZip, conExtension, extensionParaMiniatura, extensionParaVerComoJpg, type FichaZip, LADO_VISTA,
  nombreDelZip, TOPE_MINIATURAS, TOPE_ZIP_PERMISO, venceMiniatura,
} from "../drive/logica.ts";
import { esTipoParaCompartir, filaDeBitacora, type Hijo, NOMBRE_DEL_EQUIPO, nombreDeLink, nombreDelDia, ordenarHijos, permisosDe, tipoEfectivo } from "./logica.ts";

// drive-aporte — el link público de la carpeta del Drive (Alvaro, 04/11), que
// desde el 10/11 es también LA CARPETA DE LA CREADORA, para dejar Dropbox.
//
// Quien abre /aportar/<token> no tiene cuenta: el token ES la llave, y esta
// edge decide qué deja hacer según el tipo de link (logica.ts → permisosDe):
//
//   · subir (los de siempre) e invitado (para el fotógrafo): solo suben.
//   · personal (el de la creadora): sube, ve y baja todo lo de su carpeta, ve
//     «Del equipo» y saca/cierra links de invitado y de ver.
//   · ver (una carpeta compartida por la creadora): solo ve y baja esa carpeta.
//
// Todo lo que se sube cae en la subcarpeta del día («2026-11-10»), creada sola.
// Los archivos se suben primero a Supabase (bucket privado drive-aportes, con
// TUS) y drive-aporte-nas los pasa al NAS. Para ver y bajar, esta edge firma el
// permiso del NAS (igual que la edge drive) DESPUÉS de comprobar que lo pedido
// está dentro de la carpeta del link. verify_jwt = false.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
const NAS = (Deno.env.get("DRIVE_NAS_URL") ?? "").replace(/\/+$/, "");
const SECRETO = Deno.env.get("DRIVE_SECRETO") ?? "";
const BUCKET = "drive-aportes";

const MIMES: Record<string, string> = {
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm", mkv: "video/x-matroska",
  avi: "video/x-msvideo", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", heic: "image/heic", heif: "image/heif", mp3: "audio/mpeg", wav: "audio/wav",
  m4a: "audio/mp4", aac: "audio/aac", pdf: "application/pdf", zip: "application/zip",
};
const mimeDe = (nombre: string): string => MIMES[(nombre.split(".").pop() ?? "").toLowerCase()] ?? "application/octet-stream";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

class Rechazo extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Clave segura para el storage: sin acentos ni caracteres raros (macOS mete un
// espacio invisible U+202F que rompe la clave entera).
function claveSegura(nombre: string): string {
  const base = (nombre || "archivo")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\- ]+/g, "").trim().slice(0, 120) || "archivo";
  return base.replace(/\s+/g, "_");
}

interface Link {
  token: string; item_id: string; tenant_id: string; activo: boolean; created_by: string | null;
  tipo: string; creator_id: string | null; padre_token: string | null; nombre: string | null;
}
const COLUMNAS_LINK = "token, item_id, tenant_id, activo, created_by, tipo, creator_id, padre_token, nombre";

/** El link, si sigue vivo. Uno sacado por la creadora muere con el de ella. */
async function linkActivo(token: string): Promise<Link | null> {
  const { data } = await admin.from("drive_upload_links").select(COLUMNAS_LINK).eq("token", token).maybeSingle();
  const l = data as Link | null;
  if (!l || !l.activo) return null;
  if (l.padre_token) {
    const { data: padre } = await admin.from("drive_upload_links").select("activo").eq("token", l.padre_token).maybeSingle();
    if (!padre?.activo) return null;
  }
  // El link viejo de una creadora abre su Drive completo (logica.ts → tipoEfectivo).
  if (l.tipo === "subir") {
    const { data: suya } = await admin.from("drive_carpeta_creadora").select("creator_id").eq("item_id", l.item_id).limit(1).maybeSingle();
    const tipo = tipoEfectivo(l.tipo, !!suya);
    if (tipo !== l.tipo) return { ...l, tipo, creator_id: l.creator_id ?? (suya?.creator_id as string | null) ?? null };
  }
  return l;
}

async function dentroDe(item: string, raiz: string): Promise<boolean> {
  if (item === raiz) return true;
  const { data, error } = await admin.rpc("drive_dentro_de", { _item: item, _raiz: raiz });
  if (error) throw new Rechazo(error.message, 500);
  return data === true;
}

/** Una carpeta que el link puede mirar (la suya o una de adentro). */
async function carpetaPermitida(link: Link, carpeta: unknown): Promise<{ id: string; nombre: string; parent_id: string | null }> {
  const id = typeof carpeta === "string" && carpeta ? carpeta : link.item_id;
  if (!(await dentroDe(id, link.item_id))) throw new Rechazo("No existe o no es de este link", 404);
  const { data } = await admin.from("drive_items").select("id, nombre, parent_id, tipo, trashed_at").eq("id", id).maybeSingle();
  if (!data || data.tipo !== "carpeta" || data.trashed_at) throw new Rechazo("No existe o no es de este link", 404);
  return { id: data.id as string, nombre: data.nombre as string, parent_id: (data.parent_id as string | null) ?? null };
}

/** El camino desde la carpeta del link hasta «carpeta», para las migas. */
async function ruta(link: Link, carpeta: { id: string; nombre: string; parent_id: string | null }) {
  const camino = [{ id: carpeta.id, nombre: carpeta.nombre }];
  let padre = carpeta.parent_id;
  let actual = carpeta.id;
  for (let i = 0; i < 30 && actual !== link.item_id && padre; i++) {
    const { data } = await admin.from("drive_items").select("id, nombre, parent_id").eq("id", padre).maybeSingle();
    if (!data) break;
    camino.unshift({ id: data.id as string, nombre: data.nombre as string });
    actual = data.id as string;
    padre = (data.parent_id as string | null) ?? null;
  }
  return camino;
}

const permisoNas = async (datos: Record<string, unknown>, vence: number) =>
  `${NAS}/o?t=${await firmar(SECRETO, { ...datos, e: ahoraMas(vence) } as never)}`;

/** Quién es la creadora del link (para saludarla en la página). */
async function nombreDeLaCreadora(link: Link): Promise<string | null> {
  let creador = link.creator_id;
  if (!creador) {
    const { data } = await admin.from("drive_carpeta_creadora").select("creator_id").eq("item_id", link.item_id).limit(1).maybeSingle();
    creador = (data?.creator_id as string | undefined) ?? null;
  }
  if (!creador) return null;
  const { data: c } = await admin.from("creators").select("name, artistic_name").eq("id", creador).maybeSingle();
  return ((c?.artistic_name as string | null) || (c?.name as string | null)) ?? null;
}

/** Lo que la modelo ve del pedido en la página del link. */
async function elPedido(token: string) {
  const { data: p } = await admin.from("api_pedidos").select("request_id, referencia").eq("link_token", token).maybeSingle();
  if (!p) return null;
  const { data: r } = await admin.from("custom_requests")
    .select("description, due_on, duration_or_qty, content_type, status").eq("id", p.request_id).maybeSingle();
  if (!r) return null;
  return {
    referencia: p.referencia as string,
    que_grabar: r.description as string,
    fecha_limite: (r.due_on as string | null) ?? null,
    duracion: (r.duration_or_qty as string | null) ?? null,
    tipo: (r.content_type as string | null) ?? null,
    cancelado: ["denegado", "reembolsado"].includes(r.status as string),
  };
}

/** Llegó un archivo por el link de un pedido: Backstage lo ve en /contenido/pedidos
 *  y el equipo, como entrega en Personalizados. Si algo de esto falla, el archivo
 *  igual queda en la carpeta del pedido (Backstage lo ve por la carpeta). */
async function yaSubioAlPedido(token: string, f: { itemId: string; nombre: string; mime: string; size: number | null }) {
  try {
    const ahora = new Date().toISOString();
    const { data: p } = await admin.from("api_pedidos").select("request_id, subido_at").eq("link_token", token).maybeSingle();
    if (!p) return;
    await admin.from("api_pedidos").update({ subido_at: (p.subido_at as string | null) ?? ahora, actualizado: ahora }).eq("link_token", token);
    await admin.from("custom_request_attachments").insert({
      request_id: p.request_id, storage_path: null, drive_item_id: f.itemId, file_name: f.nombre.slice(0, 300),
      mime_type: f.mime, size_bytes: f.size, kind: "entrega",
    });
    await admin.from("custom_requests").update({ status: "listo" }).eq("id", p.request_id).in("status", ["aprobado", "en_produccion"]);
  } catch (e) {
    console.error("[drive-aporte] pedido:", (e as { message?: string })?.message ?? e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "método no permitido" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "cuerpo inválido" }, 400); }

  const action = String(body.action ?? "");
  const token = String(body.token ?? "");
  if (!token) return json({ error: "sin token" }, 400);

  try {
    // Info del link (para pintar la página).
    if (action === "info") {
      const { data } = await admin.from("drive_upload_links").select(COLUMNAS_LINK).eq("token", token).maybeSingle();
      const crudo = data as Link | null;
      if (!crudo) return json({ existe: false });
      const link = await linkActivo(token);
      const { data: di } = await admin.from("drive_items").select("nombre").eq("id", crudo.item_id).maybeSingle();
      if (!link) return json({ existe: true, activo: false, carpeta: di?.nombre ?? null, etiqueta: crudo.nombre ?? null });

      const permisos = permisosDe(link.tipo);
      // La de la creadora siempre tiene su «Del equipo» (el equipo le deja ahí).
      let delEquipo: string | null = null;
      if (link.tipo === "personal") {
        const { data: id } = await admin.rpc("drive_carpeta_hija", { _padre: link.item_id, _nombre: NOMBRE_DEL_EQUIPO, _owner: link.created_by });
        delEquipo = (id as string | null) ?? null;
      }
      void admin.from("drive_upload_links").update({ usado_at: new Date().toISOString() }).eq("token", token).then(() => {}, () => {});
      const pedido = link.tipo === "pedido" ? await elPedido(token) : null;
      return json({
        pedido,
        existe: true, activo: true, tipo: link.tipo, permisos,
        carpeta: di?.nombre ?? null, carpeta_id: permisos.ver ? link.item_id : null,
        etiqueta: link.nombre ?? null, creadora: await nombreDeLaCreadora(link), del_equipo_id: delEquipo,
      });
    }

    // Telemetría de fallas (ANTES del check de link para que también funcione si
    // el link fue cerrado mientras la creadora subía).
    if (action === "log_error") {
      await admin.from("drive_aportar_errores").insert({
        token,
        nombre_archivo: String(body.nombre_archivo ?? "").slice(0, 300),
        size_bytes: typeof body.size_bytes === "number" ? body.size_bytes : null,
        etapa: String(body.etapa ?? "").slice(0, 60),
        mensaje: String(body.mensaje ?? "").slice(0, 500),
        status: typeof body.status === "number" ? body.status : null,
        intento: typeof body.intento === "number" ? body.intento : null,
        user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
      }).then(() => {}, () => {});
      return json({ ok: true });
    }

    // La caja negra de cada subida (también ANTES del check de link: si el link
    // se cerró a mitad de una subida, igual queda el rastro). El aviso a quien
    // creó el link lo da el cron vigilar_subidas_trabadas.
    if (action === "bitacora") {
      const fila = filaDeBitacora(body, token, req.headers.get("user-agent") ?? "", new Date().toISOString());
      if (!fila) return json({ error: "intento inválido" }, 400);
      await admin.from("drive_aportar_intentos").upsert(fila, { onConflict: "id" }).then(() => {}, () => {});
      return json({ ok: true });
    }

    const link = await linkActivo(token);
    if (!link) return json({ error: "El link no es válido o ya fue cerrado." }, 403);
    const permisos = permisosDe(link.tipo);

    // ── Subir ──────────────────────────────────────────────────────────────
    // Pide una URL firmada para subir UN archivo.
    if (action === "iniciar") {
      if (!permisos.subir) throw new Rechazo("Este link no deja subir.", 403);
      const nombre = claveSegura(String(body.nombre_archivo ?? "archivo"));
      const path = `${token}/${crypto.randomUUID()}-${nombre}`;
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) return json({ error: error?.message ?? "no se pudo iniciar" }, 500);
      return json({ path: data.path, uploadToken: data.token, signedUrl: data.signedUrl });
    }

    // Confirma que un archivo ya se subió: crea la ficha "procesando" YA, en la
    // carpeta del día (para que el equipo la vea al instante) y dispara la
    // migración al NAS.
    if (action === "confirmar") {
      if (!permisos.subir) throw new Rechazo("Este link no deja subir.", 403);
      const path = String(body.path ?? "");
      if (!path.startsWith(token + "/")) return json({ error: "ruta inválida" }, 400);
      const nombre = String(body.nombre_archivo ?? "archivo").slice(0, 300);
      const size = typeof body.size === "number" ? body.size : null;
      const quien = (String(body.quien ?? "").trim() || null)?.slice(0, 120) ?? null;

      // Ya confirmado (la respuesta anterior se perdió y la página reintenta):
      // no se duplica la ficha.
      const { data: yaEsta } = await admin.from("drive_aportes").select("id").eq("storage_path", path).limit(1).maybeSingle();
      if (yaEsta) return json({ ok: true, repetido: true });

      // El archivo tiene que estar de verdad en el depósito. Antes se confirmaba
      // cualquier ruta: si la subida se había retomado en otra, quedaba una
      // ficha "procesando" para siempre y el video no aparecía (11/11/2026).
      const { data: firmada } = await admin.storage.from(BUCKET).createSignedUrl(path, 60);
      if (!firmada?.signedUrl) {
        return json({ error: "El archivo no terminó de llegar. Vuelve a elegirlo: sigue desde donde quedó." }, 409);
      }

      // El link de un pedido sube DIRECTO a la carpeta del pedido (sin carpeta
      // del día): así Backstage ve justo lo de ese pedido.
      const esPedido = link.tipo === "pedido";
      let dia: string | null = esPedido ? link.item_id : null;
      if (!esPedido) {
        const { data, error: eDia } = await admin.rpc("drive_carpeta_hija", {
          _padre: link.item_id, _nombre: nombreDelDia(), _owner: link.created_by,
        });
        if (eDia || !data) return json({ error: eDia?.message ?? "no se pudo crear la carpeta del día" }, 500);
        dia = data as string;
      }
      // Los avisos y totales van por la carpeta de la creadora (la raíz).
      let raiz = link.item_id;
      if (esPedido && link.creator_id) {
        const { data: suya } = await admin.from("drive_carpeta_creadora").select("item_id").eq("creator_id", link.creator_id).limit(1).maybeSingle();
        raiz = (suya?.item_id as string | undefined) ?? link.item_id;
      }

      const itemId = crypto.randomUUID();
      const up = crypto.randomUUID();
      const storageKey = `${link.tenant_id}/${itemId}`;
      const { error: eFicha } = await admin.from("drive_items").insert({
        id: itemId, tenant_id: link.tenant_id, owner_id: link.created_by ?? null, parent_id: dia as string,
        tipo: "archivo", nombre, mime: mimeDe(nombre), size, storage_key: storageKey, estado: "procesando",
      });
      if (eFicha) return json({ error: eFicha.message }, 500);

      // item_id = la carpeta de la creadora (no la del día): con eso se arman
      // los avisos («llegó contenido de MIMIMOUSE») y los totales por creadora.
      const { error } = await admin.from("drive_aportes").insert({
        token, item_id: raiz, tenant_id: link.tenant_id, nombre_archivo: nombre,
        storage_path: path, size, quien, nas_item_id: itemId, nas_up: up, nas_parte: 0,
      });
      if (error) return json({ error: error.message }, 500);
      if (esPedido) await yaSubioAlPedido(token, { itemId, nombre, mime: mimeDe(nombre), size });

      // Arranca la migración de una (no esperar al cron). Fire-and-forget.
      if (CRON_TOKEN) {
        const tarea = fetch(`${SUPABASE_URL}/functions/v1/drive-aporte-nas`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "X-Cron-Token": CRON_TOKEN, "Content-Type": "application/json" },
          body: "{}",
        }).then(() => {}, () => {});
        // deno-lint-ignore no-explicit-any
        const rt = (globalThis as any).EdgeRuntime;
        if (rt?.waitUntil) rt.waitUntil(tarea); else await tarea.catch(() => {});
      }
      return json({ ok: true });
    }

    // ── Ver y bajar ────────────────────────────────────────────────────────
    if (["listar", "miniaturas", "abrir", "bajar_carpeta"].includes(action)) {
      if (!permisos.ver) throw new Rechazo("Este link solo deja subir.", 403);
      if (!NAS || SECRETO.length < 32) throw new Rechazo("El Drive no está configurado.", 503);
    }

    if (action === "listar") {
      const carpeta = await carpetaPermitida(link, body.carpeta);
      const { data, error } = await admin.rpc("drive_hijos_publicos", { _carpeta: carpeta.id });
      if (error) throw new Rechazo(error.message, 500);
      return json({ carpeta: { id: carpeta.id, nombre: carpeta.nombre }, ruta: await ruta(link, carpeta), hijos: ordenarHijos((data ?? []) as Hijo[]) });
    }

    if (action === "miniaturas") {
      const carpeta = await carpetaPermitida(link, body.carpeta);
      const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((x): x is string => typeof x === "string"))].slice(0, TOPE_MINIATURAS) : [];
      const urls: Record<string, string> = {};
      if (ids.length) {
        const { data, error } = await admin.from("drive_items")
          .select("id, tipo, nombre, mime, storage_key, estado").in("id", ids).eq("parent_id", carpeta.id).is("trashed_at", null);
        if (error) throw new Rechazo(error.message, 500);
        const e = venceMiniatura();
        for (const f of (data ?? []) as { id: string; tipo: string; nombre: string; mime: string | null; storage_key: string | null; estado: string }[]) {
          if (f.tipo !== "archivo" || f.estado !== "listo" || !f.storage_key) continue;
          const x = extensionParaMiniatura(f.nombre, f.mime);
          if (x) urls[f.id] = `${NAS}/o?t=${await firmar(SECRETO, { op: "mini", k: f.storage_key, x, e } as never)}`;
        }
      }
      return json({ urls });
    }

    if (action === "abrir") {
      const { data: f } = await admin.from("drive_items")
        .select("id, tipo, nombre, mime, storage_key, estado, parent_id, trashed_at").eq("id", String(body.id ?? "")).maybeSingle();
      if (!f || f.tipo !== "archivo" || f.trashed_at || !f.parent_id || !(await dentroDe(f.parent_id as string, link.item_id))) {
        throw new Rechazo("No existe o no es de este link", 404);
      }
      if (f.estado !== "listo" || !f.storage_key) throw new Rechazo("El archivo todavía se está procesando", 409);
      const descargar = body.descargar === true;
      // Una HEIC para mirar: el JPG que el NAS convierte. Para bajar, el original.
      const comoJpg = descargar ? null : extensionParaVerComoJpg(f.nombre as string, f.mime as string | null);
      const url = await permisoNas(
        comoJpg
          ? { op: "mini", k: f.storage_key, x: comoJpg, l: LADO_VISTA }
          : { op: "get", k: f.storage_key, ct: (f.mime as string | null) ?? "application/octet-stream", n: conExtension(f.nombre as string, f.mime as string | null), dl: descargar },
        VENCE.bajar,
      );
      return json({ url });
    }

    // Bajar TODO lo de una carpeta (un día, por ejemplo) en un .zip.
    if (action === "bajar_carpeta") {
      const carpeta = await carpetaPermitida(link, body.carpeta);
      const { data, error } = await admin.from("drive_items")
        .select("id, parent_id, tipo, nombre, mime, size, storage_key, estado, trashed_at")
        .eq("parent_id", carpeta.id).eq("tipo", "archivo").is("trashed_at", null).limit(5000);
      if (error) throw new Rechazo(error.message, 500);
      const archivos = (data ?? []) as FichaZip[];
      const { l, archivos: n, bytes } = armarListaDelZip(archivos, new Map());
      const ficha: FichaZip = { id: carpeta.id, parent_id: null, tipo: "carpeta", nombre: carpeta.nombre, size: null, storage_key: null, estado: "listo", trashed_at: null };
      const t = await firmar(SECRETO, { op: "zip", e: ahoraMas(6 * 3600), n: nombreDelZip([ficha]), l } as never);
      if (t.length > TOPE_ZIP_PERMISO) throw new Rechazo("Son demasiados archivos para un solo .zip.", 413);
      return json({ url: `${NAS}/zip`, t, archivos: n, bytes });
    }

    // ── Compartir (solo el link de la creadora) ────────────────────────────
    if (["crear_link", "mis_links", "cerrar_link"].includes(action) && !permisos.compartir) {
      throw new Rechazo("Este link no deja compartir.", 403);
    }

    // Un link para otro: «invitado» (solo sube a su carpeta) o «ver» (solo ve y
    // baja UNA carpeta suya). Sus avisos le llegan a la misma persona del equipo.
    if (action === "crear_link") {
      const tipo = body.tipo;
      if (!esTipoParaCompartir(tipo)) throw new Rechazo("Tipo de link inválido");
      const carpeta = tipo === "ver" ? await carpetaPermitida(link, body.carpeta) : { id: link.item_id };
      const { data, error } = await admin.from("drive_upload_links").insert({
        item_id: carpeta.id, tenant_id: link.tenant_id, created_by: link.created_by, tipo,
        creator_id: link.creator_id, padre_token: token, nombre: nombreDeLink(body.nombre),
      }).select("token").single();
      if (error || !data) throw new Rechazo(error?.message ?? "no se pudo crear el link", 500);
      return json({ token: data.token });
    }

    if (action === "mis_links") {
      const { data, error } = await admin.from("drive_upload_links")
        .select("token, tipo, nombre, item_id, created_at, usado_at").eq("padre_token", token).eq("activo", true)
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw new Rechazo(error.message, 500);
      const filas = (data ?? []) as { token: string; tipo: string; nombre: string | null; item_id: string; created_at: string; usado_at: string | null }[];
      const ids = [...new Set(filas.map((f) => f.item_id))];
      const nombres = new Map<string, string>();
      if (ids.length) {
        const { data: items } = await admin.from("drive_items").select("id, nombre").in("id", ids);
        for (const i of (items ?? []) as { id: string; nombre: string }[]) nombres.set(i.id, i.nombre);
      }
      return json({ links: filas.map((f) => ({ ...f, carpeta: nombres.get(f.item_id) ?? null })) });
    }

    if (action === "cerrar_link") {
      const { error } = await admin.from("drive_upload_links")
        .update({ activo: false }).eq("token", String(body.hijo ?? "")).eq("padre_token", token);
      if (error) throw new Rechazo(error.message, 500);
      return json({ ok: true });
    }

    return json({ error: "acción desconocida" }, 400);
  } catch (e) {
    if (e instanceof Rechazo) return json({ error: e.message }, e.status);
    const status = typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : 500;
    return json({ error: String((e as Error)?.message ?? e) }, status);
  }
});

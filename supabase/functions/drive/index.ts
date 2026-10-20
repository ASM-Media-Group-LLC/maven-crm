// Drive de Oficina — la edge que da los PERMISOS para el NAS.
//
// El contenido de los archivos nunca pasa por acá: el navegador sube y baja
// directo del NAS (infra/nas-drive) por la puerta de Dokploy (infra/nas-drive/puerta), con un permiso
// firmado que sale de esta función. Acá se decide QUIÉN puede QUÉ, con la RLS
// de drive_items como juez: si la persona no puede ver la ficha, no hay
// permiso.
//
// Acciones (POST JSON { action, ... }):
//   subir_iniciar    { parent_id, nombre, mime, size } → permisos para subir
//   subir_confirmar  { id, recibo }                    → el archivo queda listo
//   abrir            { id, descargar? }                → URL para verlo/bajarlo
//   abrir_version    { version }                       → URL para bajar una versión vieja
//   abrir_entrega_pedido { adjunto, descargar? }        → URL de una entrega que subió la creadora
//   restaurar_version { version }                      → (dueño o editor) la vuelve a dejar vigente
//   bajar_varios     { ids }                           → permiso para UN .zip (POST /zip del NAS)
//   miniaturas       { ids }  (hasta 200)              → { urls: { id: URL de la miniatura } }
//   borrar_para_siempre { id }                         → borra en el NAS y la ficha
//   crear_unidad     { nombre }                        → (admins) una unidad compartida
//
// Sin sesión, con permiso firmado por la MINI (mismo DRIVE_SECRETO):
//   indice    { permiso, paginado?, desde? }  → el árbol para el índice diario
//   importar  { permiso, items, compartidos, unidades? } → fichas del archivo de Google
//
// Variables: DRIVE_NAS_URL (la de la puerta), DRIVE_SECRETO (el mismo del NAS).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsFor } from "../_shared/cors.ts";
import { ahoraMas, firmar, verificar, VENCE } from "../_shared/drive-firma.ts";
import {
  armarIndice, chequearCupo, chequearEspacioDeLaAgencia, hayLugarEnElNas, HttpError, madresQueFaltanEnElLote, nombreValido,
  planDeSubida, TAMANO_PARTE, validarLote, validarUnidades, type ItemParaIndice, validarTipos,
} from "./logica.ts";
import {
  armarListaDelZip, CuentaDelZip, entraEnElZip, idsParaZip, nombreDelZip, PROFUNDIDAD_ZIP, TOPE_ZIP_ENTRADAS, TOPE_ZIP_PERMISO,
  type FichaZip,
} from "./logica.ts";
import { conExtension, extensionParaMiniatura, extensionParaVerComoJpg, idsParaMiniaturas, LADO_VISTA, venceMiniatura } from "./logica.ts";
import { type HijosParaPurgar, loQueCuelgaDe, PAGINA_PURGA } from "./logica.ts";

Deno.serve(async (req) => {
  const CORS = corsFor(req, { "Access-Control-Allow-Methods": "POST, OPTIONS" });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const nas = (Deno.env.get("DRIVE_NAS_URL") ?? "").replace(/\/+$/, "");
    const secreto = Deno.env.get("DRIVE_SECRETO") ?? "";
    if (!nas || secreto.length < 32) throw new HttpError("El Drive todavía no está conectado al NAS", 503);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const url = Deno.env.get("SUPABASE_URL")!;

    // ── El índice diario (lo pide la MINI, no una persona) ──────────────────
    // Sin sesión de Maven: la mini se identifica con un permiso firmado con el
    // mismo secreto del Drive (op "indice", vence en minutos). Va ANTES del
    // chequeo de sesión justamente por eso. Devuelve el árbol de TODAS las
    // agencias: solo el NAS tiene el secreto, y el índice se guarda en la
    // carpeta de cada agencia, al lado de sus archivos.
    if (body.action === "indice") {
      const p = await verificar(secreto, String(body.permiso ?? ""));
      if (!p || p.op !== "indice") throw new HttpError("Permiso inválido", 403);
      const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      // Paginado (la mini arma el árbol): con el archivo de Google son cientos
      // de miles de fichas y todo junto no entra en la memoria de la edge.
      if (body.paginado === true) return responder(await paginaDelIndice(admin, typeof body.desde === "string" ? body.desde : null));
      return responder(await indiceCompleto(admin));
    }

    // ── Importar el archivo de Google (lo pide la MINI) ──────────────────────
    // Sin sesión: permiso firmado op "importar" con la agencia (t) adentro. Las
    // fichas entran sin dueño y con la ruta que fija la regla (validarLote).
    // Idempotente: una ficha o un compartido que ya está no se toca, así que la
    // mini puede relanzar un lote cortado sin duplicar nada.
    if (body.action === "importar") {
      const p = await verificar(secreto, String(body.permiso ?? ""));
      if (!p || p.op !== "importar" || typeof p.t !== "string") throw new HttpError("Permiso inválido", 403);
      const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: agencia } = await admin.from("tenants").select("id").eq("id", p.t).maybeSingle();
      if (!agencia) throw new HttpError("La agencia no existe", 404);
      const { filas, shares } = validarLote(p.t, body.items, body.compartidos);
      const unidades = validarUnidades(body.unidades);

      // Cada carpeta madre que el lote no trae tiene que existir, ser carpeta y
      // ser de la MISMA agencia (si no, la FK lo frenaría con un error peor).
      const madres = madresQueFaltanEnElLote(filas);
      for (let i = 0; i < madres.length; i += 200) {
        const tramo = madres.slice(i, i + 200);
        const { data, error } = await admin.from("drive_items").select("id, tipo, tenant_id").in("id", tramo);
        if (error) throw new HttpError(error.message, 500);
        const ok = new Set(((data ?? []) as { id: string; tipo: string; tenant_id: string }[])
          .filter((m) => m.tipo === "carpeta" && m.tenant_id === p.t).map((m) => m.id));
        const falta = tramo.find((m) => !ok.has(m));
        if (falta) throw new HttpError(`La carpeta madre ${falta} no existe en esta agencia`, 400);
      }
      if (filas.length) {
        const { error } = await admin.from("drive_items").upsert(filas, { onConflict: "id", ignoreDuplicates: true });
        if (error) throw new HttpError(error.message, 400);
      }
      if (unidades.length) {
        // Qué carpeta es una unidad. Que sea sin dueño y de la agencia, y que la
        // persona sea de la agencia, lo exige el trigger de drive_unidades.
        const { error } = await admin.from("drive_unidades")
          .upsert(unidades.map((u) => ({ ...u, tenant_id: p.t })), { onConflict: "item_id", ignoreDuplicates: true });
        if (error) throw new HttpError(error.message, 400);
      }
      if (shares.length) {
        // Lo compartido tiene que ser de esta agencia (el trigger además exige
        // que la persona sea de la agencia del archivo).
        const ids = [...new Set(shares.map((c) => c.item_id))];
        for (let i = 0; i < ids.length; i += 200) {
          const tramo = ids.slice(i, i + 200);
          const { data, error } = await admin.from("drive_items").select("id, tenant_id").in("id", tramo);
          if (error) throw new HttpError(error.message, 500);
          const ok = new Set(((data ?? []) as { id: string; tenant_id: string }[]).filter((m) => m.tenant_id === p.t).map((m) => m.id));
          const falta = tramo.find((m) => !ok.has(m));
          if (falta) throw new HttpError(`No se puede compartir ${falta}: no es de esta agencia`, 400);
        }
        const { error } = await admin.from("drive_shares").upsert(shares, { onConflict: "item_id,user_id", ignoreDuplicates: true });
        if (error) throw new HttpError(error.message, 400);
      }
      return responder({ ok: true, items: filas.length, compartidos: shares.length, unidades: unidades.length });
    }

    // ── El tipo real de los archivos sin extensión (lo pide la MINI) ─────────
    // Sin sesión: permiso firmado op «tipos». La mini pide los que faltan, lee
    // sus primeros bytes en el NAS y manda el tipo; la base solo lo cambia si
    // sigue genérico y sin tocar la fecha (20261006150000_drive_tipos_por_firma).
    if (body.action === "tipos_pendientes" || body.action === "tipos_corregir") {
      const p = await verificar(secreto, String(body.permiso ?? ""));
      if (!p || p.op !== "tipos") throw new HttpError("Permiso inválido", 403);
      const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      if (body.action === "tipos_pendientes") {
        const desde = typeof body.desde === "string" && body.desde.length === 36 ? body.desde : null;
        const { data, error } = await admin.rpc("drive_sin_tipo", { p_desde: desde, p_limite: 1000 });
        if (error) throw new HttpError(error.message, 500);
        const items = (data ?? []) as { id: string; storage_key: string }[];
        return responder({ items, siguiente: items.length === 1000 ? items[items.length - 1].id : null });
      }
      let corregidos = 0;
      for (const [mime, ids] of validarTipos(body.tipos)) {
        const { data, error } = await admin.rpc("drive_corregir_tipos", { p_ids: ids, p_mime: mime });
        if (error) throw new HttpError(error.message, 400);
        corregidos += Number(data ?? 0);
      }
      return responder({ ok: true, corregidos });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) throw new HttpError("Sin sesión", 401);
    // Como la persona: la RLS decide qué fichas ve. Admin: solo para escribir
    // lo que el navegador no puede (storage_key, tamaño, estado).
    const comoLaPersona = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: auth } = await comoLaPersona.auth.getUser();
    const yo = auth?.user?.id;
    if (!yo) throw new HttpError("Sesión inválida", 401);

    const accion = String(body.action ?? "");
    const permisoNas = async (datos: Record<string, unknown>, vence: number) =>
      `${nas}/o?t=${await firmar(secreto, { ...datos, e: ahoraMas(vence) } as never)}`;

    if (accion === "subir_iniciar") {
      const nombre = nombreValido(body.nombre);
      const size = Number(body.size);
      const plan = planDeSubida(size);
      const parentId = body.parent_id ? String(body.parent_id) : null;
      if (parentId) {
        const rol = await rolDe(comoLaPersona, parentId);
        if (rol !== "dueno" && rol !== "editor") throw new HttpError("No puedes guardar en esa carpeta", 403);
      }
      const { data: tenant, error: eT } = await comoLaPersona.rpc("current_tenant_id");
      if (eT || !tenant) throw new HttpError("No encontré tu agencia", 403);

      // Dentro de una unidad compartida gasta el espacio de la AGENCIA, como en
      // Google; en lo demás, el cupo de la persona (50 GB salvo que un admin le
      // haya puesto otro).
      let unidad: string | null = null;
      if (parentId) {
        const { data, error } = await admin.rpc("drive_unidad_de", { p_item: parentId });
        if (error) throw new HttpError(error.message, 500);
        unidad = (data as string | null) ?? null;
      }
      if (unidad) {
        const { data: uso, error: eU } = await comoLaPersona.rpc("drive_uso_agencia");
        if (eU) throw new HttpError(eU.message, 500);
        const fila = (Array.isArray(uso) ? uso[0] : uso) as { usado: number; cupo: number | null } | undefined;
        chequearEspacioDeLaAgencia(Number(fila?.usado ?? 0), fila?.cupo == null ? null : Number(fila.cupo), size);
      } else {
        const { data: uso, error: eU } = await comoLaPersona.rpc("drive_uso");
        if (eU) throw new HttpError(eU.message, 500);
        const fila = (Array.isArray(uso) ? uso[0] : uso) as { usado: number; cupo: number } | undefined;
        chequearCupo(Number(fila?.usado ?? 0), Number(fila?.cupo ?? 0), size);
      }

      // Y que haya lugar en el NAS, ANTES de crear la ficha: si no entra, que
      // se sepa ahora y no a mitad de la subida. Si el NAS no contesta, la
      // subida fallaría igual: mejor decirlo ya.
      const salud = await fetch(`${nas}/salud`, { signal: AbortSignal.timeout(8000) })
        .then((r) => r.json()).catch(() => null) as { raices?: { ok: boolean; libre?: number; total?: number }[] } | null;
      if (!salud?.raices) throw new HttpError("El NAS no responde. Prueba en unos minutos.", 503);
      if (!hayLugarEnElNas(salud.raices, size, plan.partes > 0)) {
        throw new HttpError("El NAS no tiene lugar para este archivo. Avísale a un admin.", 507);
      }

      const id = crypto.randomUUID();
      // ⚠️ La agencia va en la RUTA física del NAS, no solo en la ficha.
      const storageKey = `${tenant}/${id}`;
      const mime = typeof body.mime === "string" && body.mime.length < 200 ? body.mime : "application/octet-stream";
      const { error } = await admin.from("drive_items").insert({
        id, tenant_id: tenant, owner_id: yo, parent_id: parentId, tipo: "archivo", nombre, mime,
        size, storage_key: storageKey, estado: "subiendo",
      });
      if (error) throw new HttpError(error.message, 400);

      if (plan.partes === 0) {
        return responder({ id, url: await permisoNas({ op: "put", k: storageKey, max: size }, VENCE.subir) });
      }
      const up = crypto.randomUUID();
      const partes: string[] = [];
      for (let i = 0; i < plan.partes; i++) {
        // `total`: la primera parte elige disco para el archivo entero.
        partes.push(await permisoNas({ op: "parte", k: storageKey, up, i, max: TAMANO_PARTE, total: size }, VENCE.subir));
      }
      return responder({
        id, tamano_parte: TAMANO_PARTE, partes,
        completar: await permisoNas({ op: "completar", k: storageKey, up, n: plan.partes, max: size }, VENCE.subir),
      });
    }

    if (accion === "subir_confirmar") {
      const id = String(body.id ?? "");
      const { data: fila } = await admin.from("drive_items")
        .select("id, storage_key, size, estado, owner_id").eq("id", id).maybeSingle();
      if (!fila || fila.owner_id !== yo || fila.estado !== "subiendo") throw new HttpError("No hay una subida pendiente con ese id", 404);
      // El recibo lo firma el NAS al terminar de escribir: prueba que el
      // archivo LLEGÓ, con su tamaño y su huella, sin que la edge tenga que
      // preguntarle al NAS.
      const rec = await verificar(secreto, String(body.recibo ?? ""));
      if (!rec || rec.op !== "recibo" || rec.k !== fila.storage_key) throw new HttpError("El recibo del NAS no es válido", 400);
      const size = Number(rec.size);
      // Más grande de lo anunciado = el permiso no lo habría dejado pasar;
      // si igual llega, algo está mal y no se confirma.
      if (!Number.isFinite(size) || size > Number(fila.size)) throw new HttpError("El tamaño no coincide", 400);
      const { error } = await admin.from("drive_items")
        .update({ estado: "listo", size, sha256: String(rec.sha256) }).eq("id", id);
      if (error) throw new HttpError(error.message, 500);
      return responder({ ok: true, size });
    }

    if (accion === "abrir") {
      const id = String(body.id ?? "");
      // Como la persona: si la RLS no se la muestra, no hay permiso.
      const { data: fila } = await comoLaPersona.from("drive_items")
        .select("id, tipo, nombre, mime, storage_key, estado").eq("id", id).maybeSingle();
      if (!fila || fila.tipo !== "archivo") throw new HttpError("No existe o no tienes acceso", 404);
      if (fila.estado !== "listo") throw new HttpError("El archivo todavía se está subiendo", 409);
      const descargar = !!body.descargar;
      // Una HEIC para mirar: el JPG que el NAS convierte (el navegador no la
      // dibuja). Para descargar, siempre el original.
      const comoJpg = descargar ? null : extensionParaVerComoJpg(fila.nombre, fila.mime);
      const u = await permisoNas(
        comoJpg
          ? { op: "mini", k: fila.storage_key, x: comoJpg, l: LADO_VISTA }
          // Con su extensión aunque haya llegado de Google sin ella (Daniel, 08/10).
          : { op: "get", k: fila.storage_key, ct: fila.mime ?? "application/octet-stream", n: conExtension(fila.nombre, fila.mime), dl: descargar },
        VENCE.bajar,
      );
      // «Abierto por última vez»: lo que después decide qué se archiva. Una
      // miniatura o vista previa no pasa por acá. Y, aparte, MI apertura: es
      // lo que ve cada uno en «Recientes» (la fecha de la ficha es de todos).
      const ahora = new Date().toISOString();
      await admin.from("drive_items").update({ last_opened_at: ahora }).eq("id", id);
      await admin.from("drive_aperturas").upsert({ user_id: yo, item_id: id, abierto_at: ahora }, { onConflict: "user_id,item_id" });
      return responder({ url: u });
    }

    // Una ENTREGA de un personalizado que la creadora subió desde su portal (fase 3,
    // 08/10): el archivo vive en SU carpeta, que el equipo no ve por la RLS de
    // drive_items. El juez es el pedido: si la RLS de custom_request_attachments le
    // muestra el adjunto a la persona (ve ese pedido: el chatter que lo vendió, su
    // manager, los supervisores), lo puede abrir. Y solo ese archivo.
    if (accion === "abrir_entrega_pedido") {
      const { data: adj } = await comoLaPersona.from("custom_request_attachments")
        .select("drive_item_id").eq("id", String(body.adjunto ?? "")).maybeSingle();
      const itemId = (adj as { drive_item_id: string | null } | null)?.drive_item_id;
      if (!itemId) throw new HttpError("No existe o no tienes acceso", 404);
      const { data: fila } = await admin.from("drive_items")
        .select("id, tipo, nombre, mime, storage_key, estado, trashed_at").eq("id", itemId).maybeSingle();
      if (!fila || fila.tipo !== "archivo" || fila.trashed_at || !fila.storage_key) throw new HttpError("La creadora borró ese archivo", 404);
      if (fila.estado !== "listo") throw new HttpError("El archivo todavía se está subiendo", 409);
      const descargar = !!body.descargar;
      const comoJpg = descargar ? null : extensionParaVerComoJpg(fila.nombre, fila.mime);
      const u = await permisoNas(
        comoJpg
          ? { op: "mini", k: fila.storage_key, x: comoJpg, l: LADO_VISTA }
          : { op: "get", k: fila.storage_key, ct: fila.mime ?? "application/octet-stream", n: conExtension(fila.nombre, fila.mime), dl: descargar },
        VENCE.bajar,
      );
      return responder({ url: u });
    }

    // ── Las versiones de lo editado en la Oficina («Administrar versiones») ──
    // La lista la lee el navegador (la RLS de drive_versiones deja ver las de
    // lo que se ve). Aquí, lo que el navegador no puede: el permiso del NAS
    // para bajar una versión vieja y mover el puntero de la ficha al
    // restaurarla.
    if (accion === "abrir_version") {
      // Como la persona: si la RLS no le muestra la versión (ni la ficha), no hay permiso.
      const v = await versionComoLaPersona(comoLaPersona, body.version);
      const { data: fila } = await comoLaPersona.from("drive_items")
        .select("id, tipo, nombre, mime").eq("id", v.item_id).maybeSingle();
      if (!fila || fila.tipo !== "archivo") throw new HttpError("No existe o no tienes acceso", 404);
      // Con el nombre del archivo, como «Descargar» en «Administrar versiones» de Google.
      const u = await permisoNas(
        { op: "get", k: v.storage_key, ct: fila.mime ?? "application/octet-stream", n: conExtension(fila.nombre, fila.mime), dl: true },
        VENCE.bajar,
      );
      return responder({ url: u });
    }

    if (accion === "restaurar_version") {
      // Volver a una versión vieja: la ficha apunta otra vez a su archivo del
      // NAS. La de hoy NO se pierde (ya está en drive_versiones: cada guardado
      // la anota) y la restaurada entra como versión NUEVA, con quién y cuándo,
      // como en Google. ⚠️ La llave de ONLYOFFICE sale de la huella: con la
      // misma huella que una versión vieja, la edge oficina-doc le suma la
      // fecha de esta restauración (claveDeDrive), si no ONLYOFFICE abriría lo
      // que tenía guardado con esa llave.
      const v = await versionComoLaPersona(comoLaPersona, body.version);
      const rol = await rolDe(comoLaPersona, v.item_id);
      if (rol !== "dueno" && rol !== "editor") throw new HttpError("Solo quien puede editar el archivo puede restaurar una versión", 403);
      const { data: crudo } = await admin.from("drive_items")
        .select("id, tipo, estado, trashed_at, storage_key, size, owner_id").eq("id", v.item_id).maybeSingle();
      const fila = crudo as { id: string; tipo: string; estado: string; trashed_at: string | null; storage_key: string | null; size: number | null; owner_id: string | null } | null;
      if (!fila || fila.tipo !== "archivo" || !fila.storage_key) throw new HttpError("No existe o no tienes acceso", 404);
      if (fila.estado !== "listo") throw new HttpError("El archivo todavía se está subiendo", 409);
      if (fila.trashed_at) throw new HttpError("Está en la papelera: restáuralo primero", 409);
      if (fila.storage_key === v.storage_key) return responder({ ok: true, igual: true });

      // Si la versión pesa más que la de hoy, que entre en el espacio de donde
      // se descuenta (como una subida: la agencia dentro de una unidad, si no el
      // propietario).
      const crece = Number(v.size ?? 0) - Number(fila.size ?? 0);
      if (crece > 0) await chequearEspacioParaCrecer(admin, comoLaPersona, fila, yo, crece);

      const ahora = new Date().toISOString();
      const { data: nueva, error: eV } = await admin.from("drive_versiones").insert({
        item_id: fila.id, storage_key: v.storage_key, size: v.size, sha256: v.sha256, saved_by: yo, created_at: ahora,
      }).select("id").single();
      if (eV) throw new HttpError(eV.message, 500);
      // El puntero, solo si nadie guardó otra versión mientras tanto.
      const { data: movida, error: eU } = await admin.from("drive_items")
        .update({ storage_key: v.storage_key, size: v.size, sha256: v.sha256, updated_at: ahora })
        .eq("id", fila.id).eq("storage_key", fila.storage_key)
        .select("id");
      if (eU || !movida?.length) {
        await admin.from("drive_versiones").delete().eq("id", (nueva as { id: string }).id);
        if (eU) throw new HttpError(eU.message, 500);
        throw new HttpError("Alguien guardó otra versión justo ahora. Vuelve a intentarlo.", 409);
      }
      return responder({ ok: true });
    }

    if (accion === "bajar_varios") {
      // ⚠️ TODO como la persona: qué entra en el .zip lo decide la RLS, igual
      // que al abrir un archivo. Con el cliente admin, un id ajeno metido a
      // mano en el pedido bajaría lo que esa persona no puede ver.
      const ids = idsParaZip(body.ids);
      const cuenta = new CuentaDelZip();
      const porId = new Map<string, FichaZip>();
      for (let i = 0; i < ids.length; i += 150) {
        const { data, error } = await comoLaPersona.from("drive_items").select(COLUMNAS_ZIP).in("id", ids.slice(i, i + 150));
        if (error) throw new HttpError(error.message, 500);
        for (const f of (data ?? []) as FichaZip[]) porId.set(f.id, f);
      }
      // En el orden en que se eligieron (el de la pantalla).
      const elegidos = ids.map((id) => porId.get(id)).filter((f): f is FichaZip => !!f && entraEnElZip(f));
      for (const f of elegidos) cuenta.sumar(f);
      const hijos = await loDeAdentroComoLaPersona(comoLaPersona, elegidos.filter((f) => f.tipo === "carpeta").map((f) => f.id), cuenta);
      const { l, archivos, bytes } = armarListaDelZip(elegidos, hijos);
      const t = await firmar(secreto, { op: "zip", e: ahoraMas(VENCE_ZIP), n: nombreDelZip(elegidos), l } as never);
      if (t.length > TOPE_ZIP_PERMISO) {
        throw new HttpError("Son demasiados archivos (o nombres muy largos) para un solo .zip. Elige menos.", 413, { codigo: "zip_demasiados", tope: TOPE_ZIP_ENTRADAS });
      }
      // El permiso va en el CUERPO de un formulario (POST /zip), no en la URL.
      return responder({ url: `${nas}/zip`, t, archivos, bytes });
    }

    if (accion === "miniaturas") {
      // Las miniaturas de una página de la cuadrícula, en UNA llamada. Como la
      // persona: si la RLS no le muestra la ficha, no hay miniatura.
      const ids = idsParaMiniaturas(body.ids);
      const e = venceMiniatura();
      const urls: Record<string, string> = {};
      for (let i = 0; i < ids.length; i += 150) {
        const { data, error } = await comoLaPersona.from("drive_items")
          .select("id, tipo, nombre, mime, storage_key, estado").in("id", ids.slice(i, i + 150));
        if (error) throw new HttpError(error.message, 500);
        for (const f of (data ?? []) as { id: string; tipo: string; nombre: string; mime: string | null; storage_key: string | null; estado: string }[]) {
          if (f.tipo !== "archivo" || f.estado !== "listo" || !f.storage_key) continue;
          const x = extensionParaMiniatura(f.nombre, f.mime);
          if (x) urls[f.id] = `${nas}/o?t=${await firmar(secreto, { op: "mini", k: f.storage_key, x, e } as never)}`;
        }
      }
      return responder({ urls });
    }

    if (accion === "borrar_para_siempre") {
      const id = String(body.id ?? "");
      const rol = await rolDe(comoLaPersona, id);
      if (rol !== "dueno" && rol !== "editor") throw new HttpError("No puedes borrar esto", 403);
      const { data: raiz, error: eR } = await admin.from("drive_items").select("id, storage_key, trashed_at").eq("id", id).maybeSingle();
      if (eR) throw new HttpError(eR.message, 500);
      if (!raiz) throw new HttpError("No existe", 404);
      if (!raiz.trashed_at) throw new HttpError("Primero hay que mandarlo a la papelera", 409);

      // Todo lo de adentro (una carpeta arrastra a sus hijos), leído ENTERO
      // antes de tocar nada: de a 150 carpetas y de a 1000 filas, y cualquier
      // error frena el borrado (loQueCuelgaDe). Al final se borra solo la ficha
      // raíz y el ON DELETE CASCADE se lleva todas las demás: lo que no se
      // leyera acá quedaría en el NAS sin ficha.
      const hijosDe: HijosParaPurgar = async (madres, despuesDe) => {
        let q = admin.from("drive_items").select("id, tipo, storage_key").in("parent_id", madres).order("id").limit(PAGINA_PURGA);
        if (despuesDe) q = q.gt("id", despuesDe);
        return await q;
      };
      const adentro = await loQueCuelgaDe(hijosDe, id);
      const fichas = [id, ...adentro.archivos];
      const archivos = [...adentro.claves];
      if (raiz.storage_key) archivos.push(raiz.storage_key);
      // Y las versiones viejas de lo que se editó en la Oficina
      // (drive_versiones): el NAS las guarda aparte y, sin esto, quedarían
      // ocupando lugar para siempre sin ficha que las nombre.
      archivos.push(...await versionesGuardadas(admin, fichas));

      // ⚠️ PRIMERO el NAS, después la ficha. Al revés, si el NAS no contesta,
      // quedaría un archivo huérfano que nadie ve pero ocupa lugar para
      // siempre. Así, si falla, la ficha sigue en la papelera y se reintenta.
      // El NAS no lo borra en el acto: lo pasa a su papelera de 30 días
      // (<raíz>/.borrados, infra/nas-drive/papelera.mjs).
      const borrados = new Set(archivos);
      for (const k of borrados) {
        const r = await fetch(await permisoNas({ op: "borrar", k }, VENCE.borrar), { method: "DELETE" });
        if (!r.ok && r.status !== 404) throw new HttpError(`El NAS no pudo borrar (${r.status}); prueba de nuevo`, 502);
      }
      // Si mientras tanto entró algo nuevo adentro (una subida a esa carpeta
      // desde otra pestaña), el CASCADE se llevaría su ficha y su archivo
      // quedaría huérfano: se vuelve a mirar y, si cambió, no se borra la ficha.
      const otraVez = await loQueCuelgaDe(hijosDe, id);
      const yaVistas = new Set(adentro.fichas);
      const versionesAhora = await versionesGuardadas(admin, [id, ...otraVez.archivos]);
      if (otraVez.fichas.some((f) => !yaVistas.has(f)) || versionesAhora.some((k) => !borrados.has(k))) {
        throw new HttpError("Alguien agregó algo adentro mientras se borraba. Vuelve a intentarlo.", 409);
      }
      const { error } = await admin.from("drive_items").delete().eq("id", id);
      if (error) throw new HttpError(error.message, 500);
      return responder({ ok: true, archivos: borrados.size });
    }

    if (accion === "crear_unidad") {
      // Como en Google Workspace: las unidades compartidas las crea un admin.
      // La unidad no tiene dueño (es de la agencia) y quien la crea queda como
      // editor para poder compartirla.
      const nombre = nombreValido(body.nombre);
      const { data: soyAdmin, error: eA } = await comoLaPersona.rpc("drive_soy_admin");
      if (eA) throw new HttpError(eA.message, 500);
      if (soyAdmin !== true) throw new HttpError("Solo un admin puede crear unidades compartidas", 403);
      const { data: tenant, error: eT } = await comoLaPersona.rpc("current_tenant_id");
      if (eT || !tenant) throw new HttpError("No encontré tu agencia", 403);
      const id = crypto.randomUUID();
      const { error: e1 } = await admin.from("drive_items").insert({
        id, tenant_id: tenant, owner_id: null, parent_id: null, tipo: "carpeta", nombre, estado: "listo",
      });
      if (e1) throw new HttpError(e1.message, 400);
      const { error: e2 } = await admin.from("drive_unidades").insert({ item_id: id, tenant_id: tenant, tipo: "empresa", creada_por: yo });
      const { error: e3 } = e2 ? { error: null } : await admin.from("drive_shares").insert({ item_id: id, user_id: yo, rol: "editor" });
      if (e2 || e3) {
        // Sin la marca o sin el compartido sería una carpeta que nadie ve.
        await admin.from("drive_items").delete().eq("id", id);
        throw new HttpError((e2 ?? e3)!.message, 400);
      }
      return responder({ id });
    }

    throw new HttpError("Acción desconocida");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error("[drive]", e);
    return responder({ ...(e instanceof HttpError ? e.datos : undefined), error: (e as Error).message ?? "error" }, status);
  }
});

/** Los archivos del NAS de las versiones guardadas de esas fichas. Si la tabla
 *  todavía no existe (la migración de drive_versiones no se aplicó), no hay
 *  versiones: no se frena un borrado por eso. */
async function versionesGuardadas(admin: SupabaseClient, ids: string[]): Promise<string[]> {
  const claves: string[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await admin.from("drive_versiones").select("storage_key").in("item_id", ids.slice(i, i + 150));
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return claves;
      throw new HttpError(error.message, 500);
    }
    for (const v of (data ?? []) as { storage_key: string | null }[]) if (v.storage_key) claves.push(v.storage_key);
  }
  return claves;
}

const COLUMNAS_ZIP = "id, parent_id, tipo, nombre, mime, size, storage_key, estado, trashed_at";
/** El permiso del .zip se usa enseguida (el navegador lo manda al NAS apenas
 *  llega); la descarga en sí puede durar horas: el NAS lo mira solo al empezar. */
const VENCE_ZIP = 15 * 60;

/** Lo de adentro de las carpetas elegidas, nivel por nivel y con la RLS de la
 *  persona. De a 150 carpetas (una URL con más ids se corta) y de a 1000 filas
 *  (PostgREST corta en 1000 sin avisar). La cuenta frena apenas se pasa del
 *  tope, sin leer el resto. */
async function loDeAdentroComoLaPersona(cliente: SupabaseClient, carpetas: string[], cuenta: CuentaDelZip) {
  const hijos = new Map<string, FichaZip[]>();
  const vistas = new Set(carpetas);
  let nivel = carpetas;
  for (let n = 0; nivel.length && n < PROFUNDIDAD_ZIP; n++) {
    const siguiente: string[] = [];
    for (let i = 0; i < nivel.length; i += 150) {
      const tramo = nivel.slice(i, i + 150);
      for (let desde = 0; ; desde += 1000) {
        const { data, error } = await cliente.from("drive_items").select(COLUMNAS_ZIP)
          .in("parent_id", tramo).is("trashed_at", null).eq("estado", "listo")
          .order("id").range(desde, desde + 999);
        if (error) throw new HttpError(error.message, 500);
        const filas = (data ?? []) as FichaZip[];
        for (const f of filas) {
          if (!entraEnElZip(f) || !f.parent_id) continue;
          cuenta.sumar(f);
          const lista = hijos.get(f.parent_id) ?? [];
          lista.push(f);
          hijos.set(f.parent_id, lista);
          if (f.tipo === "carpeta" && !vistas.has(f.id)) { vistas.add(f.id); siguiente.push(f.id); }
        }
        if (filas.length < 1000) break;
      }
    }
    nivel = siguiente;
  }
  return hijos;
}

interface VersionGuardada { id: string; item_id: string; storage_key: string; size: number | null; sha256: string | null }

/** Una versión, leída CON EL TOKEN DE LA PERSONA: la RLS de drive_versiones
 *  la muestra solo si la persona puede ver el archivo. */
async function versionComoLaPersona(cliente: SupabaseClient, id: unknown): Promise<VersionGuardada> {
  const vid = String(id ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vid)) throw new HttpError("Versión inválida", 400);
  const { data, error } = await cliente.from("drive_versiones")
    .select("id, item_id, storage_key, size, sha256").eq("id", vid).maybeSingle();
  if (error) throw new HttpError(error.message, 500);
  if (!data) throw new HttpError("No existe o no tienes acceso", 404);
  return data as VersionGuardada;
}

/** ¿Entran `bytes` más en el espacio de donde se descuenta este archivo? Como
 *  una subida: dentro de una unidad compartida, el de la agencia; si no, el
 *  de su PROPIETARIO (no el de quien restaura, como al editar en la Oficina).
 *  Lo importado sin dueño fuera de una unidad no cuenta en el de nadie. */
async function chequearEspacioParaCrecer(
  admin: SupabaseClient, comoLaPersona: SupabaseClient, fila: { id: string; owner_id: string | null }, yo: string, bytes: number,
) {
  const primera = (data: unknown) => (Array.isArray(data) ? data[0] : data) as { usado?: number; cupo?: number | null } | undefined;
  const { data: unidad, error: eU } = await admin.rpc("drive_unidad_de", { p_item: fila.id });
  if (eU) throw new HttpError(eU.message, 500);
  if (unidad) {
    const { data, error } = await comoLaPersona.rpc("drive_uso_agencia");
    if (error) throw new HttpError(error.message, 500);
    const f = primera(data);
    chequearEspacioDeLaAgencia(Number(f?.usado ?? 0), f?.cupo == null ? null : Number(f.cupo), bytes);
    return;
  }
  if (!fila.owner_id) return;
  const { data, error } = fila.owner_id === yo
    ? await comoLaPersona.rpc("drive_uso")
    : await admin.rpc("drive_uso", { p_user: fila.owner_id });
  if (error) throw new HttpError(error.message, 500);
  const f = primera(data);
  chequearCupo(Number(f?.usado ?? 0), Number(f?.cupo ?? 0), bytes);
}

async function rolDe(cliente: SupabaseClient, id: string): Promise<string | null> {
  const { data, error } = await cliente.rpc("drive_mi_rol", { p_item: id });
  if (error) throw new HttpError(error.message, 500);
  return (data as string | null) ?? null;
}

const COLUMNAS_INDICE = "id, tenant_id, owner_id, parent_id, tipo, nombre, size, sha256, storage_key, estado, trashed_at, created_at, updated_at, last_opened_at";
const POR_PAGINA = 5000;

/** Una página del índice, en orden de id (cursor, no offset: un offset sobre
 *  una tabla que cambia salta o repite filas). Con los nombres y correos de
 *  los dueños de ESA página y los nombres de las agencias. */
async function paginaDelIndice(admin: SupabaseClient, desde: string | null) {
  const items: ItemParaIndice[] = [];
  let cursor = desde;
  while (items.length < POR_PAGINA) {
    let q = admin.from("drive_items").select(COLUMNAS_INDICE).order("id").limit(1000);
    if (cursor) q = q.gt("id", cursor);
    const { data, error } = await q;
    if (error) throw new HttpError(error.message, 500);
    const filas = (data ?? []) as ItemParaIndice[];
    items.push(...filas);
    if (filas.length < 1000) { cursor = null; break; }
    cursor = filas[filas.length - 1].id;
  }
  const siguiente = cursor && items.length ? items[items.length - 1].id : null;
  const { data: tenants } = await admin.from("tenants").select("id, name");
  const agencias = Object.fromEntries(((tenants ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]));
  const duenosIds = [...new Set(items.map((i) => i.owner_id).filter(Boolean))] as string[];
  const duenos: Record<string, { nombre: string; correo: string }> = {};
  for (const id of duenosIds) {
    const [{ data: perfil }, { data: usuario }] = await Promise.all([
      admin.from("profiles").select("full_name").eq("id", id).maybeSingle(),
      admin.auth.admin.getUserById(id),
    ]);
    duenos[id] = { nombre: (perfil as { full_name?: string } | null)?.full_name ?? "", correo: usuario?.user?.email ?? "" };
  }
  return { generado: new Date().toISOString(), items, siguiente, agencias, duenos };
}

/** Todo el árbol, de a 1000 filas: PostgREST corta en 1000 sin avisar, y un
 *  índice al que le faltan filas es peor que no tenerlo. */
async function indiceCompleto(admin: SupabaseClient) {
  const items: ItemParaIndice[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await admin.from("drive_items")
      .select("id, tenant_id, owner_id, parent_id, tipo, nombre, size, sha256, storage_key, estado, trashed_at, created_at, updated_at, last_opened_at")
      .order("id").range(desde, desde + 999);
    if (error) throw new HttpError(error.message, 500);
    items.push(...((data ?? []) as ItemParaIndice[]));
    if (!data || data.length < 1000) break;
  }
  const { data: tenants } = await admin.from("tenants").select("id, name");
  const agencias = new Map(((tenants ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]));
  const duenos = [...new Set(items.map((i) => i.owner_id).filter(Boolean))] as string[];
  const nombres = new Map<string, string>();
  const correos = new Map<string, string>();
  if (duenos.length) {
    const { data: perfiles } = await admin.from("profiles").select("id, full_name").in("id", duenos);
    for (const p of (perfiles ?? []) as { id: string; full_name: string | null }[]) nombres.set(p.id, p.full_name ?? "");
    for (let pagina = 1; pagina < 50; pagina++) {
      const { data } = await admin.auth.admin.listUsers({ page: pagina, perPage: 1000 });
      const usuarios = data?.users ?? [];
      for (const u of usuarios) if (u.email) correos.set(u.id, u.email);
      if (usuarios.length < 1000) break;
    }
  }
  return { generado: new Date().toISOString(), filas: armarIndice(items, agencias, nombres, correos) };
}
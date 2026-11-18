// /contenido/subidas — Backstage sube los personalizados terminados y quedan en
// Maven como si la modelo los hubiera subido por su link (Alvaro, 17/11/2026:
// «es como si lo hubieran subido acá… espejo»). Scope contenido:write.
//
//   POST /public-api/contenido/subidas             crea la subida y da el permiso de TUS
//   POST /public-api/contenido/subidas/:id/listo   «ya terminé de subir»
//   GET  /public-api/contenido/subidas/:id         esperando_archivo | procesando | listo | error
//
// Por dentro es el MISMO camino que /aportar (edge drive-aporte): el archivo
// llega al balde privado drive-aportes, «listo» crea la ficha en el Drive de la
// modelo (Personalizados/<día>) y drive-aporte-nas lo pasa al NAS y avisa al
// equipo, igual que con lo que sube ella. «listo» para Backstage = ya está en el NAS.
//
// Aislamiento: corre con service_role, así que TODA consulta va atada a la
// agencia de la llave (tenant_id), y una subida solo la ve la llave que la creó.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  CARPETA_PERSONALIZADOS, estadoPublico, nombreDelDia, type FilaDeSubida, leerPedidoDeSubida, respuestaDeSubida,
  rutaDeContenido, rutaEnElBalde,
} from "./contenido-logica.ts";

const BALDE = "drive-aportes";
const COLUMNAS = "id, creator_id, nombre_archivo, size, estado, error, created_at, confirmado_at, carpeta, storage_path, aporte_id";

const MIMES: Record<string, string> = {
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm", mkv: "video/x-matroska",
  avi: "video/x-msvideo", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", heic: "image/heic", heif: "image/heif", mp3: "audio/mpeg", wav: "audio/wav",
  m4a: "audio/mp4", aac: "audio/aac", pdf: "application/pdf", zip: "application/zip",
};
const mimeDe = (nombre: string) => MIMES[(nombre.split(".").pop() ?? "").toLowerCase()] ?? "application/octet-stream";

export interface ContextoDeContenido {
  admin: SupabaseClient;
  agencia: string;
  llaveId: string;
  llaveNombre: string;
  metodo: string;
  ruta: string[];
  cuerpo: Record<string, unknown> | null;
  idempotencia: string | null;
  supabaseUrl: string;
  anonKey: string;
  servicio: { key: string; cronToken: string };
}

export type RespuestaDeContenido = { estado: number; cuerpo: Record<string, unknown>; permitidos?: string[] };

const error = (estado: number, codigo: string, mensaje: string, extra: Record<string, unknown> = {}): RespuestaDeContenido =>
  ({ estado, cuerpo: { error: codigo, message: mensaje, ...extra } });

async function nombreDeCreadora(admin: SupabaseClient, agencia: string, id: string) {
  const { data } = await admin.from("creators").select("id, name, artistic_name").eq("id", id).eq("tenant_id", agencia).maybeSingle();
  return { id, nombre: ((data?.artistic_name as string | null) || (data?.name as string | null)) ?? null };
}

/** La subida de ESTA llave (y de esta agencia). */
async function laSubida(ctx: ContextoDeContenido, id: string) {
  return await ctx.admin.from("api_contenido_subidas").select(COLUMNAS)
    .eq("id", id).eq("tenant_id", ctx.agencia).eq("api_key_id", ctx.llaveId).maybeSingle();
}

async function permisoDeSubida(ctx: ContextoDeContenido, path: string) {
  const { data, error: e } = await ctx.admin.storage.from(BALDE).createSignedUploadUrl(path);
  if (e || !data) return null;
  return {
    // TUS (resumible, recomendado para videos): https://tus.io
    tus: {
      endpoint: `${ctx.supabaseUrl}/storage/v1/upload/resumable`,
      headers: { authorization: `Bearer ${ctx.anonKey}`, apikey: ctx.anonKey, "x-signature": data.token },
      metadata: { bucketName: BALDE, objectName: path },
      tamano_de_parte: 6 * 1024 * 1024,
    },
    // O un PUT de una sola vez (archivos chicos).
    put_url: data.signedUrl,
    vence_en_segundos: 7200,
  };
}

export async function servirContenido(ctx: ContextoDeContenido): Promise<RespuestaDeContenido> {
  const r = rutaDeContenido(ctx.metodo, ctx.ruta);
  if (!r.ok && r.estado === 405) return { ...error(405, "method_not_allowed", `Método no permitido. Usa: ${r.permitidos!.join(", ")}`), permitidos: r.permitidos };
  if (!r.ok) return error(404, "not_found", "Ruta no encontrada. Rutas: POST /contenido/subidas, POST /contenido/subidas/{id}/listo, GET /contenido/subidas/{id}");

  // ── Crear ────────────────────────────────────────────────────────────────
  if (r.accion === "crear") {
    const p = leerPedidoDeSubida(ctx.cuerpo ?? {});
    if (!p.ok) return error(400, "invalid_field", `${p.campo}: ${p.problema}`, { field: p.campo });

    if (ctx.idempotencia) {
      const { data: ya } = await ctx.admin.from("api_contenido_subidas").select(COLUMNAS)
        .eq("api_key_id", ctx.llaveId).eq("idempotencia", ctx.idempotencia).maybeSingle();
      if (ya) {
        const f = ya as unknown as FilaDeSubida & { storage_path: string };
        const permiso = f.estado === "esperando_archivo" ? await permisoDeSubida(ctx, f.storage_path) : null;
        return { estado: 200, cuerpo: { ...respuestaDeSubida(f, await nombreDeCreadora(ctx.admin, ctx.agencia, f.creator_id), estadoPublico(f, null), null), subida: permiso, repetida: true } };
      }
    }

    let q = ctx.admin.from("creators").select("id, name, artistic_name").eq("tenant_id", ctx.agencia);
    q = "id" in p.creadora ? q.eq("id", p.creadora.id) : q.ilike("email", p.creadora.email);
    const { data: creadoras, error: eC } = await q.limit(2);
    if (eC) throw eC;
    if (!creadoras?.length) return error(404, "creator_not_found", "No hay una modelo con ese id o correo en esta agencia.");
    if (creadoras.length > 1) return error(409, "creator_ambiguous", "Ese correo es de más de una modelo: manda su id de /creators.");
    const c = creadoras[0] as { id: string; name: string | null; artistic_name: string | null };

    const { data: carpeta } = await ctx.admin.from("drive_carpeta_creadora").select("item_id")
      .eq("creator_id", c.id).eq("tenant_id", ctx.agencia).limit(1).maybeSingle();
    if (!carpeta) return error(409, "creator_without_folder", "La modelo todavía no tiene su carpeta en el Drive de Maven.");

    const id = crypto.randomUUID();
    const path = rutaEnElBalde(id, p.nombre);
    const { error: eIns } = await ctx.admin.from("api_contenido_subidas").insert({
      id, tenant_id: ctx.agencia, api_key_id: ctx.llaveId, creator_id: c.id, carpeta_item_id: carpeta.item_id,
      nombre_archivo: p.nombre, size: p.tamano, mime: p.mime ?? mimeDe(p.nombre), storage_path: path,
      idempotencia: ctx.idempotencia,
    });
    if (eIns) throw eIns;
    const permiso = await permisoDeSubida(ctx, path);
    if (!permiso) throw new Error("no se pudo firmar la subida");
    const { data: fila } = await laSubida(ctx, id);
    return {
      estado: 201,
      cuerpo: {
        ...respuestaDeSubida(fila as unknown as FilaDeSubida, { id: c.id, nombre: c.artistic_name || c.name }, "esperando_archivo", null),
        subida: permiso,
      },
    };
  }

  // ── Ver ──────────────────────────────────────────────────────────────────
  const { data: crudo, error: eS } = await laSubida(ctx, r.id!);
  if (eS) throw eS;
  if (!crudo) return error(404, "not_found", "No hay una subida con ese id para esta llave.");
  const f = crudo as unknown as FilaDeSubida & { storage_path: string; aporte_id: string | null };

  const verla = async () => {
    const { data: actual } = await laSubida(ctx, f.id);
    const g = (actual ?? f) as unknown as FilaDeSubida & { aporte_id: string | null };
    type Aporte = { en_nas: boolean; estado: string; drive_item_id: string | null; nas_item_id: string | null };
    let aporte: Aporte | null = null;
    if (g.aporte_id) {
      const { data } = await ctx.admin.from("drive_aportes").select("en_nas, estado, drive_item_id, nas_item_id")
        .eq("id", g.aporte_id).eq("tenant_id", ctx.agencia).maybeSingle();
      aporte = (data as Aporte | null) ?? null;
    }
    return respuestaDeSubida(g, await nombreDeCreadora(ctx.admin, ctx.agencia, g.creator_id), estadoPublico(g, aporte),
      aporte?.drive_item_id ?? aporte?.nas_item_id ?? null);
  };

  if (r.accion === "ver") return { estado: 200, cuerpo: await verla() };

  // ── Listo ────────────────────────────────────────────────────────────────
  if (f.estado !== "esperando_archivo") return { estado: 200, cuerpo: await verla() };

  // Que el archivo esté de verdad en el balde (y cuánto pesa).
  const carpetaBalde = f.storage_path.slice(0, f.storage_path.lastIndexOf("/"));
  const archivo = f.storage_path.slice(f.storage_path.lastIndexOf("/") + 1);
  const { data: lista } = await ctx.admin.storage.from(BALDE).list(carpetaBalde, { limit: 10, search: archivo });
  const objeto = (lista ?? []).find((o) => o.name === archivo);
  if (!objeto) return error(409, "file_not_uploaded", "El archivo todavía no terminó de llegar. Termina la subida por TUS y vuelve a avisar.");
  const tamano = Number((objeto.metadata as Record<string, unknown> | null)?.size ?? f.size ?? 0) || f.size;

  // Solo un «listo» gana (dos avisos a la vez no crean dos fichas).
  const { data: tomada } = await ctx.admin.from("api_contenido_subidas")
    .update({ estado: "confirmando" }).eq("id", f.id).eq("estado", "esperando_archivo").select("id, carpeta_item_id").maybeSingle();
  if (!tomada) return { estado: 200, cuerpo: await verla() };
  const carpetaModelo = (tomada as { carpeta_item_id: string }).carpeta_item_id;

  const soltar = async (motivo: string) => {
    await ctx.admin.from("api_contenido_subidas").update({ estado: "esperando_archivo", error: motivo }).eq("id", f.id);
  };
  try {
    // El link personal de la modelo: drive-aporte-nas avisa y cuenta por él, como
    // con lo que sube ella. El token nunca sale de Maven.
    const linkDe = async (soloPersonal: boolean) => {
      let q = ctx.admin.from("drive_upload_links").select("token, created_by")
        .eq("tenant_id", ctx.agencia).eq("item_id", carpetaModelo).eq("activo", true);
      if (soloPersonal) q = q.eq("tipo", "personal");
      const { data } = await q.order("created_at", { ascending: true }).limit(1).maybeSingle();
      return data as { token: string; created_by: string | null } | null;
    };
    const link = (await linkDe(true)) ?? (await linkDe(false));
    if (!link) {
      await soltar("la modelo no tiene un link activo de su carpeta");
      return error(409, "creator_without_link", "La modelo no tiene su link de carpeta activo en Maven.");
    }
    const dueno = (link.created_by as string | null) ?? null;
    const dia = nombreDelDia();
    const { data: pers, error: eP } = await ctx.admin.rpc("drive_carpeta_hija", { _padre: carpetaModelo, _nombre: CARPETA_PERSONALIZADOS, _owner: dueno });
    if (eP || !pers) throw eP ?? new Error("sin carpeta Personalizados");
    const { data: carpetaDia, error: eD } = await ctx.admin.rpc("drive_carpeta_hija", { _padre: pers, _nombre: dia, _owner: dueno });
    if (eD || !carpetaDia) throw eD ?? new Error("sin carpeta del día");

    const itemId = crypto.randomUUID();
    const { error: eFicha } = await ctx.admin.from("drive_items").insert({
      id: itemId, tenant_id: ctx.agencia, owner_id: dueno, parent_id: carpetaDia as string,
      tipo: "archivo", nombre: f.nombre_archivo, mime: mimeDe(f.nombre_archivo), size: tamano,
      storage_key: `${ctx.agencia}/${itemId}`, estado: "procesando",
    });
    if (eFicha) throw eFicha;
    const { data: aporte, error: eA } = await ctx.admin.from("drive_aportes").insert({
      token: link.token, item_id: carpetaModelo, tenant_id: ctx.agencia, nombre_archivo: f.nombre_archivo,
      storage_path: f.storage_path, size: tamano, quien: ctx.llaveNombre.slice(0, 120),
      nas_item_id: itemId, nas_up: crypto.randomUUID(), nas_parte: 0,
    }).select("id").single();
    if (eA) throw eA;

    await ctx.admin.from("api_contenido_subidas").update({
      estado: "procesando", aporte_id: aporte.id, size: tamano, error: null,
      carpeta: `${CARPETA_PERSONALIZADOS}/${dia}`, confirmado_at: new Date().toISOString(),
    }).eq("id", f.id);
  } catch (e) {
    await soltar((e as { message?: string })?.message ?? "error");
    throw e;
  }

  // Que drive-aporte-nas lo pase al NAS ya (no esperar al cron).
  if (ctx.servicio.cronToken) {
    const tarea = fetch(`${ctx.supabaseUrl}/functions/v1/drive-aporte-nas`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${ctx.servicio.key}`, "X-Cron-Token": ctx.servicio.cronToken, "Content-Type": "application/json" },
      body: "{}",
    }).then(() => {}, () => {});
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(tarea); else await tarea.catch(() => {});
  }
  return { estado: 202, cuerpo: await verla() };
}

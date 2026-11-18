// /contenido/pedidos — Backstage pide un personalizado; la modelo lo sube en
// Maven y Backstage mira el estado como un espejo (Alvaro, 18/11/2026: «todas
// las operaciones y la logística se mantienen en Backstage; Maven solo recibe el
// contenido y le deja saber que ya lo tiene»). Scope contenido:write.
//
//   POST /public-api/contenido/pedidos                      crea el pedido y da el link para la modelo
//   GET  /public-api/contenido/pedidos/:id                  estado + archivos (miniatura y link para verlos)
//   GET  /public-api/contenido/pedidos?cambiados_desde=ISO  los que cambiaron (para consultar cada tanto)
//
// Por dentro: la ficha es un custom_requests normal (status «aprobado»: ya lo
// aprobó Backstage; el equipo lo ve en Personalizados), la carpeta es
// Personalizados/Pedido <número> dentro de la carpeta de la modelo, y el link
// es un /aportar/<token> de tipo 'pedido' que SOLO sube y mira esa carpeta.
// Lo que ella sube lo cuenta la edge drive-aporte (confirmar) en api_pedidos.
//
// Aislamiento: service_role, así que TODA consulta va atada a la agencia de la
// llave, y un pedido solo lo ve la llave que lo creó.

import { ahoraMas, firmar, VENCE } from "../_shared/drive-firma.ts";
import type { ContextoDeContenido, RespuestaDeContenido } from "./contenido.ts";
import { CARPETA_PERSONALIZADOS } from "./contenido-logica.ts";
import {
  type ArchivoDelPedido, carpetaDelPedido, extensionDeMiniatura, type FilaDePedido, leerConsultaDeLista, leerPedido,
  respuestaDePedido,
} from "./pedidos-logica.ts";

const COLUMNAS = "request_id, referencia, creator_id, link_token, subido_at, actualizado, created_at, carpeta_item_id";
/** La miniatura dura lo mismo que un link de ver: un GET nuevo da links nuevos. */
const VENCE_VER = VENCE.bajar;

const error = (estado: number, codigo: string, mensaje: string, extra: Record<string, unknown> = {}): RespuestaDeContenido =>
  ({ estado, cuerpo: { error: codigo, message: mensaje, ...extra } });

const baseDeLaApp = () => (Deno.env.get("APP_URL") ?? "https://app.maven-ai.me").replace(/\/+$/, "");

type Fila = FilaDePedido & { carpeta_item_id: string };

async function losArchivos(ctx: ContextoDeContenido, carpeta: string): Promise<ArchivoDelPedido[]> {
  const { data, error: e } = await ctx.admin.from("drive_items")
    .select("id, nombre, mime, size, estado, storage_key, created_at")
    .eq("parent_id", carpeta).eq("tenant_id", ctx.agencia).eq("tipo", "archivo").is("trashed_at", null)
    .order("created_at", { ascending: true }).limit(200);
  if (e) throw e;
  const nas = ctx.nas.url.replace(/\/+$/, "");
  const conNas = !!nas && ctx.nas.secreto.length >= 32;
  const vence = ahoraMas(VENCE_VER);
  const out: ArchivoDelPedido[] = [];
  for (const f of (data ?? []) as { id: string; nombre: string; mime: string | null; size: number | null; estado: string; storage_key: string | null; created_at: string }[]) {
    const listo = f.estado === "listo" && !!f.storage_key;
    let miniatura: string | null = null;
    let ver: string | null = null;
    if (listo && conNas) {
      const x = extensionDeMiniatura(f.nombre, f.mime);
      if (x) miniatura = `${nas}/o?t=${await firmar(ctx.nas.secreto, { op: "mini", k: f.storage_key!, x, e: vence } as never)}`;
      // «ver» lo abre en el navegador (sin forzar la descarga).
      ver = `${nas}/o?t=${await firmar(ctx.nas.secreto, {
        op: "get", k: f.storage_key!, ct: f.mime ?? "application/octet-stream", n: f.nombre, dl: false, e: vence,
      } as never)}`;
    }
    out.push({
      id: f.id, nombre: f.nombre, tipo: f.mime, tamano: f.size, subido: f.created_at, listo,
      miniatura, ver, vence: ver ? new Date(vence * 1000).toISOString() : null,
    });
  }
  return out;
}

async function armar(ctx: ContextoDeContenido, p: Fila) {
  const [{ data: r }, { data: c }, archivos] = await Promise.all([
    ctx.admin.from("custom_requests").select("status, description, due_on, creadora_motivo").eq("id", p.request_id).maybeSingle(),
    ctx.admin.from("creators").select("id, name, artistic_name").eq("id", p.creator_id).eq("tenant_id", ctx.agencia).maybeSingle(),
    losArchivos(ctx, p.carpeta_item_id),
  ]);
  return respuestaDePedido(p, {
    base: baseDeLaApp(),
    creadora: { id: p.creator_id, nombre: ((c?.artistic_name as string | null) || (c?.name as string | null)) ?? null },
    status: (r?.status as string | undefined) ?? "aprobado",
    queGrabar: (r?.description as string | undefined) ?? "",
    fechaLimite: (r?.due_on as string | null) ?? null,
    motivo: (r?.creadora_motivo as string | null) ?? null,
    archivos,
  });
}

const elPedido = (ctx: ContextoDeContenido) =>
  ctx.admin.from("api_pedidos").select(COLUMNAS).eq("tenant_id", ctx.agencia).eq("api_key_id", ctx.llaveId);

export async function servirPedidos(ctx: ContextoDeContenido, accion: "pedido_crear" | "pedido_lista" | "pedido_ver", id: string | null): Promise<RespuestaDeContenido> {
  // ── Ver uno ──────────────────────────────────────────────────────────────
  if (accion === "pedido_ver") {
    const { data, error: e } = await elPedido(ctx).eq("request_id", id!).maybeSingle();
    if (e) throw e;
    if (!data) return error(404, "not_found", "No hay un pedido con ese id para esta llave.");
    return { estado: 200, cuerpo: await armar(ctx, data as unknown as Fila) };
  }

  // ── Lista (por número, o los que cambiaron desde…) ───────────────────────
  if (accion === "pedido_lista") {
    const referencia = ctx.consulta.get("referencia")?.trim();
    if (referencia) {
      const { data, error: e } = await elPedido(ctx).eq("referencia", referencia).maybeSingle();
      if (e) throw e;
      if (!data) return error(404, "not_found", "No hay un pedido con ese número para esta llave.");
      return { estado: 200, cuerpo: await armar(ctx, data as unknown as Fila) };
    }
    const q = leerConsultaDeLista(ctx.consulta);
    if (!q.ok) return error(400, "invalid_field", `${q.campo}: ${q.problema}`, { field: q.campo });
    let consulta = elPedido(ctx);
    if (q.desde) consulta = consulta.gt("actualizado", q.desde);
    const { data, error: e } = await consulta.order("actualizado", { ascending: true }).limit(q.limite);
    if (e) throw e;
    const filas = (data ?? []) as unknown as Fila[];
    const pedidos = [];
    for (const f of filas) pedidos.push(await armar(ctx, f));
    return {
      estado: 200,
      cuerpo: {
        object: "list",
        data: pedidos,
        // Para la próxima consulta: cambiados_desde = este valor.
        siguiente_desde: filas.length ? filas[filas.length - 1].actualizado : q.desde,
        hay_mas: filas.length === q.limite,
      },
    };
  }

  // ── Crear ────────────────────────────────────────────────────────────────
  const p = leerPedido(ctx.cuerpo ?? {});
  if (!p.ok) return error(400, "invalid_field", `${p.campo}: ${p.problema}`, { field: p.campo });

  // El mismo número dos veces = el mismo pedido (reintentos sin duplicar).
  const { data: ya } = await elPedido(ctx).eq("referencia", p.referencia).maybeSingle();
  if (ya) return { estado: 200, cuerpo: { ...(await armar(ctx, ya as unknown as Fila)), repetido: true } };

  let q = ctx.admin.from("creators").select("id, name, artistic_name").eq("tenant_id", ctx.agencia);
  q = "id" in p.creadora ? q.eq("id", p.creadora.id) : q.ilike("email", p.creadora.email);
  const { data: creadoras, error: eC } = await q.limit(2);
  if (eC) throw eC;
  if (!creadoras?.length) return error(404, "creator_not_found", "No hay una modelo con ese id o correo en esta agencia.");
  if (creadoras.length > 1) return error(409, "creator_ambiguous", "Ese correo es de más de una modelo: manda su id de /creators.");
  const c = creadoras[0] as { id: string; name: string | null; artistic_name: string | null };
  const nombre = c.artistic_name || c.name || "Modelo";

  const { data: carpeta } = await ctx.admin.from("drive_carpeta_creadora").select("item_id")
    .eq("creator_id", c.id).eq("tenant_id", ctx.agencia).limit(1).maybeSingle();
  if (!carpeta) return error(409, "creator_without_folder", "La modelo todavía no tiene su carpeta en el Drive de Maven.");
  const raiz = carpeta.item_id as string;

  // Dueño de las carpetas nuevas: quien creó el link personal de la modelo.
  const { data: personal } = await ctx.admin.from("drive_upload_links").select("created_by")
    .eq("item_id", raiz).eq("tenant_id", ctx.agencia).eq("activo", true)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  const dueno = (personal?.created_by as string | null) ?? null;

  const { data: pers, error: eP } = await ctx.admin.rpc("drive_carpeta_hija", { _padre: raiz, _nombre: CARPETA_PERSONALIZADOS, _owner: dueno });
  if (eP || !pers) throw eP ?? new Error("sin carpeta Personalizados");
  const { data: carpetaPedido, error: eD } = await ctx.admin.rpc("drive_carpeta_hija", { _padre: pers, _nombre: carpetaDelPedido(p.referencia), _owner: dueno });
  if (eD || !carpetaPedido) throw eD ?? new Error("sin carpeta del pedido");

  const { data: pedido, error: eR } = await ctx.admin.from("custom_requests").insert({
    creator_id: c.id, creator_name: nombre,
    fan_handle: (p.fan ?? `Backstage #${p.referencia}`).slice(0, 120),
    due_on: p.fechaLimite, status: "aprobado", approved_at: new Date().toISOString(),
    content_type: p.tipo, description: p.queGrabar, duration_or_qty: p.duracion,
    source: "backstage", source_ref: p.referencia,
  }).select("id").single();
  if (eR) throw eR;

  let token: string | null = null;
  const deshacer = async () => {
    if (token) await ctx.admin.from("drive_upload_links").delete().eq("token", token);
    await ctx.admin.from("custom_requests").delete().eq("id", pedido.id);
  };
  try {
    const { data: link, error: eL } = await ctx.admin.from("drive_upload_links").insert({
      item_id: carpetaPedido as string, tenant_id: ctx.agencia, created_by: dueno, tipo: "pedido",
      creator_id: c.id, nombre: `Pedido ${p.referencia}`.slice(0, 200),
    }).select("token").single();
    if (eL) throw eL;
    token = link.token as string;
    const { data: fila, error: eA } = await ctx.admin.from("api_pedidos").insert({
      request_id: pedido.id, tenant_id: ctx.agencia, api_key_id: ctx.llaveId, referencia: p.referencia,
      creator_id: c.id, carpeta_item_id: carpetaPedido as string, link_token: link.token,
    }).select(COLUMNAS).single();
    if (eA) {
      // Dos POST con el mismo número a la vez: gana uno y el otro devuelve ese.
      if ((eA as { code?: string }).code === "23505") {
        await deshacer();
        const { data: otro } = await elPedido(ctx).eq("referencia", p.referencia).maybeSingle();
        if (otro) return { estado: 200, cuerpo: { ...(await armar(ctx, otro as unknown as Fila)), repetido: true } };
      }
      throw eA;
    }
    return { estado: 201, cuerpo: await armar(ctx, fila as unknown as Fila) };
  } catch (e) {
    await deshacer().catch(() => {});
    throw e;
  }
}

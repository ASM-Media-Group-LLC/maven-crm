// /creators (escritura) — Backstage crea creadoras y les carga el ID de OnlyFans
// (Backstage, 18/11/2026). Scope creators:write.
//
//   POST  /public-api/creators        crea la creadora (o devuelve la que ya existe)
//   PATCH /public-api/creators/:id    le pone o corrige sus cuentas de OnlyFans
//
// Sin duplicados: si ya hay una creadora con ese ID de OnlyFans, o con ese correo
// en la agencia, POST devuelve esa (200) en vez de crear otra (201).
// Aislamiento: service_role, así que TODA consulta va atada a la agencia de la llave.

// deno-lint-ignore-file no-explicit-any
import { type CuentaOF, leerCreadoraNueva, leerCuentasOF, rutaDeCreadoras } from "./creadoras-logica.ts";

export type ContextoDeCreadoras = {
  admin: any;
  agencia: string;
  metodo: string;
  ruta: readonly string[];
  cuerpo: Record<string, unknown> | null;
  /** La creadora ya armada como la devuelve GET /creators/:id. */
  leer: (id: string) => Promise<Record<string, unknown> | null>;
};
export type RespuestaDeCreadoras = { estado: number; cuerpo: Record<string, unknown>; permitidos?: string[] };

const error = (estado: number, codigo: string, mensaje: string, extra: Record<string, unknown> = {}): RespuestaDeCreadoras =>
  ({ estado, cuerpo: { error: codigo, message: mensaje, ...extra } });

/** La cuenta con ese ID de OnlyFans, y de qué creadora es (solo de esta agencia). */
async function cuentaPorId(ctx: ContextoDeCreadoras, onlyfansId: string): Promise<{ id: string; creator_id: string; ajena: boolean } | null> {
  const { data, error: e } = await ctx.admin.from("creator_of_accounts").select("id, creator_id").eq("onlyfans_id", onlyfansId).maybeSingle();
  if (e) throw e;
  if (!data) return null;
  const { data: c, error: e2 } = await ctx.admin.from("creators").select("id").eq("id", data.creator_id).eq("tenant_id", ctx.agencia).maybeSingle();
  if (e2) throw e2;
  return { id: data.id, creator_id: data.creator_id, ajena: !c };
}

/** Pone una cuenta a una creadora (ya verificada de la agencia). Devuelve un error o null. */
async function ponerCuenta(ctx: ContextoDeCreadoras, creatorId: string, cuenta: CuentaOF): Promise<RespuestaDeCreadoras | null> {
  const ya = await cuentaPorId(ctx, cuenta.onlyfans_id);
  if (ya && ya.creator_id !== creatorId) {
    return error(409, "conflict", `El ID de OnlyFans ${cuenta.onlyfans_id} ya es de otra creadora.`, ya.ajena ? {} : { creator_id: ya.creator_id });
  }
  const cambios: Record<string, unknown> = { onlyfans_id: cuenta.onlyfans_id };
  if (cuenta.handle) cambios.account_handle = cuenta.handle;
  if (cuenta.url) cambios.onlyfans_url = cuenta.url;
  if (ya) {
    const { error: e } = await ctx.admin.from("creator_of_accounts").update(cambios).eq("id", ya.id);
    if (e) return e.code === "23505" ? error(409, "conflict", `El usuario ${cuenta.handle} ya está en otra cuenta.`) : Promise.reject(e);
    return null;
  }
  // La misma cuenta por usuario, todavía sin ID: se le completa.
  if (cuenta.handle) {
    const { data: porUsuario, error: e } = await ctx.admin.from("creator_of_accounts").select("id, creator_id, onlyfans_id")
      .eq("account_handle", cuenta.handle).maybeSingle();
    if (e) throw e;
    if (porUsuario) {
      if (porUsuario.creator_id !== creatorId) return error(409, "conflict", `El usuario ${cuenta.handle} ya es de otra creadora.`);
      const { error: e2 } = await ctx.admin.from("creator_of_accounts").update(cambios).eq("id", porUsuario.id);
      if (e2) throw e2;
      return null;
    }
  }
  const { error: e } = await ctx.admin.from("creator_of_accounts").insert({ creator_id: creatorId, ...cambios });
  if (e) return e.code === "23505" ? error(409, "conflict", `El ID de OnlyFans ${cuenta.onlyfans_id} ya está registrado.`) : Promise.reject(e);
  return null;
}

export async function servirCreadoras(ctx: ContextoDeCreadoras): Promise<RespuestaDeCreadoras> {
  const ruta = rutaDeCreadoras(ctx.metodo, ctx.ruta);
  if (!ruta.ok) {
    return ruta.estado === 404 ? error(404, "not_found", "Ruta no encontrada.") : { ...error(405, "method_not_allowed", "Método no permitido."), permitidos: ruta.permitidos };
  }
  const cuerpo = ctx.cuerpo ?? {};

  if (ruta.accion === "crear") {
    const n = leerCreadoraNueva(cuerpo);
    if (!n.ok) return error(422, "invalid_field", `${n.campo}: ${n.problema}`, { field: n.campo });

    // ¿Ya existe? Primero por el ID de OnlyFans, después por el correo.
    const ya = await cuentaPorId(ctx, n.cuenta.onlyfans_id);
    if (ya?.ajena) return error(409, "conflict", `El ID de OnlyFans ${n.cuenta.onlyfans_id} ya está registrado.`);
    let existente: string | null = ya?.creator_id ?? null;
    if (!existente && n.email) {
      const { data, error: e } = await ctx.admin.from("creators").select("id").eq("tenant_id", ctx.agencia).ilike("email", n.email).limit(1);
      if (e) throw e;
      existente = (data ?? [])[0]?.id ?? null;
    }
    if (existente) {
      const problema = await ponerCuenta(ctx, existente, n.cuenta);
      if (problema) return problema;
      return { estado: 200, cuerpo: { object: "creator", created: false, data: await ctx.leer(existente) } };
    }

    const { data: nueva, error: e } = await ctx.admin.from("creators").insert({
      name: n.name, artistic_name: n.artistic_name, email: n.email, status: n.status, tenant_id: ctx.agencia,
    }).select("id").single();
    if (e) throw e;
    // Sin su cuenta no se deja la creadora a medias — TAMBIÉN si ponerCuenta
    // lanza (19/11/2026: el insert fallaba, la limpieza no corría, y cada
    // reintento de Backstage dejaba otra creadora sin ID: Loveratho ×4).
    let problema: RespuestaDeCreadoras | null;
    try {
      problema = await ponerCuenta(ctx, nueva.id, n.cuenta);
    } catch (falla) {
      await ctx.admin.from("creators").delete().eq("id", nueva.id).eq("tenant_id", ctx.agencia);
      throw falla;
    }
    if (problema) {
      await ctx.admin.from("creators").delete().eq("id", nueva.id).eq("tenant_id", ctx.agencia);
      // Dos POST iguales a la vez: el segundo pierde en el índice único del ID de
      // OnlyFans. No es un error: se devuelve la que ganó (idempotente).
      const ganadora = await cuentaPorId(ctx, n.cuenta.onlyfans_id);
      if (ganadora && !ganadora.ajena) {
        return { estado: 200, cuerpo: { object: "creator", created: false, data: await ctx.leer(ganadora.creator_id) } };
      }
      return problema;
    }
    return { estado: 201, cuerpo: { object: "creator", created: true, data: await ctx.leer(nueva.id) } };
  }

  // PATCH /creators/:id — sus cuentas de OnlyFans.
  const { data: c, error: e } = await ctx.admin.from("creators").select("id").eq("id", ruta.id).eq("tenant_id", ctx.agencia).maybeSingle();
  if (e) throw e;
  if (!c) return error(404, "not_found", "Creadora no encontrada.");
  const cuentas = leerCuentasOF(cuerpo.onlyfans_accounts);
  if (!cuentas.ok) return error(422, "invalid_field", `${cuentas.campo}: ${cuentas.problema}`, { field: cuentas.campo });
  for (const cuenta of cuentas.cuentas) {
    const problema = await ponerCuenta(ctx, ruta.id, cuenta);
    if (problema) return problema;
  }
  return { estado: 200, cuerpo: { object: "creator", data: await ctx.leer(ruta.id) } };
}

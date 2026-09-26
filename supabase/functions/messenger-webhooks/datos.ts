// DatosDespacho sobre supabase-js, con service_role.
//
// ⚠️ Con service_role se toca SOLO lo del webhook: api_keys, api_webhook_*, tenants
// (el conteo) y tres funciones (api_webhooks_reclamar, api_webhooks_timbrar,
// api_key_vigente). Nunca chat_* ni profiles: los mensajes se leen como la persona
// (./feed.ts). Un test lo verifica leyendo este archivo.
//
// ⚠️ De un error de la base no se usa nada salvo el código 23505: una violación de
// CHECK trae la fila entera en el DETAIL (con la URL del integrador). Y acá no se
// loguea nada: lo que se anota lo decide el despachador, con ids y clases.
//
// Dos clientes: `antes` corta cada pedido con el presupuesto de la corrida; `despues`
// (las escrituras de después del envío y la espera) con un plazo fijo de 5 s. Así
// una base lenta no puede estirar una corrida más allá de su reclamo de 60 s.

import type { DatosDespacho, Endpoint, Escrito, Fase, Guarda, LlaveDespacho, Timbre } from "./despachador.ts";

// deno-lint-ignore no-explicit-any
type Cliente = any;

const COLS_LLAVE = "id, tenant_id, key_prefix, scopes, expires_at, revoked_at, acts_as_user_id, ip_whitelist";

/** UPDATE condicionado: true si tocó la fila, false si no, null si falló. */
function tocadas(r: { data: unknown; error: unknown }): Escrito {
  return r.error ? null : ((r.data as unknown[] | null) ?? []).length > 0;
}

export function crearDatosDespacho(clientes: { antes: Cliente; despues: Cliente }): DatosDespacho {
  const de = (fase: Fase) => (fase === "antes" ? clientes.antes : clientes.despues);
  const admin = clientes.antes;
  return {
    async agencias() {
      const { count, error } = await admin.from("tenants").select("id", { count: "exact", head: true });
      return error || typeof count !== "number" ? null : count;
    },
    async detenerPorAgencias() {
      // La única escritura sin guarda de reclamo: con dos agencias se detiene todo.
      const { error } = await clientes.despues.from("api_webhook_endpoints")
        .update({ status: "disabled", disabled_reason: "multi_agency", disabled_at: "now", paused_at: null, paused_by: null })
        .neq("status", "disabled");
      return !error;
    },
    async reclamar(max, segundos) {
      const { data, error } = await admin.rpc("api_webhooks_reclamar", { _max: max, _lease_s: segundos });
      return error ? null : ((data ?? []) as Endpoint[]);
    },
    async llave(id, tenantId) {
      const { data, error } = await admin.from("api_keys").select(COLS_LLAVE)
        .eq("id", id).eq("tenant_id", tenantId).maybeSingle();
      return error ? { ok: false } : { ok: true, valor: (data ?? null) as LlaveDespacho | null };
    },
    async llaveVigente(id) {
      const { data, error } = await admin.rpc("api_key_vigente", { _id: id });
      return error ? { ok: false } : { ok: true, valor: data === true };
    },
    async timbrePendiente(endpointId, tenantId) {
      const { data, error } = await admin.from("api_webhook_deliveries").select("id, body, attempts, uncertain")
        .eq("endpoint_id", endpointId).eq("tenant_id", tenantId)
        .eq("state", "pending").eq("event_type", "messages.created").maybeSingle();
      return error ? { ok: false } : { ok: true, valor: (data ?? null) as Timbre | null };
    },
    async timbrar(g: Guarda, nuevo, timbre, limpiarError) {
      const { data, error } = await admin.rpc("api_webhooks_timbrar", {
        _endpoint: g.id,
        _tenant: g.tenantId,
        _reclamo: g.reclamo,
        _cursor_at: g.cursorAt,
        _cursor_id: g.cursorId,
        _nuevo_at: nuevo.t,
        _nuevo_id: nuevo.i,
        _timbre: timbre.id,
        _cuerpo: timbre.body,
        _cantidad: timbre.cantidad,
        _limpiar_error: limpiarError,
      });
      if (error) return error.code === "23505" ? "ya_hay_uno" : "error";
      return data === "ok" ? "ok" : data === "perdio" ? "perdio" : "error";
    },
    async actualizarEndpoint(g: Guarda, cambios, fase) {
      return tocadas(
        await de(fase).from("api_webhook_endpoints").update(cambios)
          .eq("id", g.id).eq("tenant_id", g.tenantId).eq("lease_until", g.reclamo)
          .eq("status", "active").eq("cursor_at", g.cursorAt).eq("cursor_id", g.cursorId).select("id"),
      );
    },
    async anotarTimbre(id, tenantId, cambios, fase) {
      return tocadas(
        await de(fase).from("api_webhook_deliveries").update(cambios)
          .eq("id", id).eq("tenant_id", tenantId).eq("state", "pending").select("id"),
      );
    },
    async soltar(id, tenantId, reclamo) {
      await clientes.despues.from("api_webhook_endpoints").update({ lease_until: null })
        .eq("id", id).eq("tenant_id", tenantId).eq("lease_until", reclamo);
    },
  };
}

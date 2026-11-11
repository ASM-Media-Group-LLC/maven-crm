// DatosEquipo sobre supabase-js, con service_role.
//
// ⚠️ Con service_role se tocan SOLO las dos funciones del despachador del equipo
// (equipo_webhooks_reclamar y equipo_webhooks_anotar, migración 20261111190000), que
// son las únicas que la base le deja ejecutar. Nunca una tabla directo (ni las del
// equipo, ni chat_*, ni profiles). Un test lo verifica leyendo este archivo.
//
// ⚠️ De un error de la base no se usa nada: se devuelve null y el despachador anota
// solo la clase. Y aquí no se loguea nada.

import type { Anotacion, DatosEquipo, EntregaReclamada } from "./equipo.ts";

// deno-lint-ignore no-explicit-any
type Cliente = any;

export function crearDatosEquipo(clientes: { antes: Cliente; despues: Cliente }): DatosEquipo {
  return {
    async reclamar(max, segundos) {
      const { data, error } = await clientes.antes.rpc("equipo_webhooks_reclamar", { _max: max, _lease_s: segundos });
      return error || !Array.isArray(data) ? null : (data as EntregaReclamada[]);
    },
    async anotar(a: Anotacion) {
      const { data, error } = await clientes.despues.rpc("equipo_webhooks_anotar", {
        _id: a.id,
        _reclamo: a.reclamo,
        _accion: a.accion,
        _codigo: a.codigo,
        _error: a.error,
        _incierto: a.incierto,
        _reintentar_en_s: a.reintentarEnS,
        _latencia_ms: a.latenciaMs,
        _motivo: a.motivo,
      });
      return error || (data !== "ok" && data !== "perdio") ? null : data;
    },
  };
}

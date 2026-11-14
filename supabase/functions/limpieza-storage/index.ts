// limpieza-storage — las limpiezas diarias de fotos y videos, por la API de Storage.
//
// Antes las hacía pg_cron con `delete from storage.objects`, y Supabase ya no lo
// permite (storage.protect_delete: «Direct deletion from storage tables is not
// allowed»). Los tres crons fallaban todos los días y no se borraba nada:
//   · monitor_limpiar_capturas  (04:17 UTC) → regla monitor_faltas_7d
//   · monitor-capturas-limpieza (04:00 UTC) → regla monitor_capturas_30d
//   · argos-clips-purga         (09:00 UTC) → regla argos_clips_30d
// Ahora cada cron despierta esta función con { regla } y X-Cron-Token.
//
// Qué vence lo decide la base con la retención escrita en SQL
// (limpieza_storage_vencidos, solo service_role); aquí no se recibe ninguna
// fecha ni ruta desde afuera. Se borra de a lotes de hasta 1000 con
// storage.from(bucket).remove(...) y después limpieza_storage_filas ordena las
// filas igual que la limpieza vieja. Si algo falla, responde 500 y no toca las
// filas; lo pendiente sale en la corrida siguiente.
//
// Solo cron: verify_jwt=false en config.toml y X-Cron-Token en tiempo constante
// (el mismo patrón que buzones-por-borrar). No tiene camino de usuario.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { tokenDeCronValido } from "../_shared/cron-token.ts";
import { esRegla, limpiar, REGLAS } from "./logica.ts";

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const esperado = Deno.env.get("CRON_INTERNAL_TOKEN");
  if (!esperado) return json({ error: "sin_configurar" }, 503);
  if (!(await tokenDeCronValido(req.headers.get("X-Cron-Token"), esperado))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const cuerpo = (await req.json().catch(() => ({}))) as { regla?: unknown };
  const regla = cuerpo?.regla;
  if (!esRegla(regla)) return json({ error: "regla_desconocida", reglas: Object.keys(REGLAS) }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const resultado = await limpiar(regla, {
    vencidos: async (r, limite) => {
      const { data, error } = await admin.rpc("limpieza_storage_vencidos", { _regla: r, _limite: limite });
      if (error) return { rutas: null, error: error.message };
      return { rutas: ((data ?? []) as Array<{ nombre: string }>).map((f) => f.nombre).filter(Boolean), error: null };
    },
    borrar: async (bucket, rutas) => {
      const { data, error } = await admin.storage.from(bucket).remove(rutas);
      return { borrados: data?.length ?? 0, error: error ? error.message : null };
    },
    filas: async (r) => {
      const { data, error } = await admin.rpc("limpieza_storage_filas", { _regla: r });
      return { resumen: data ?? null, error: error ? error.message : null };
    },
    ahora: () => Date.now(),
  });

  // Solo números y la regla: la respuesta queda en net._http_response.
  console.log(`[limpieza-storage] ${JSON.stringify(resultado)}`);
  return json({ ok: resultado.errores.length === 0, ...resultado }, resultado.errores.length ? 500 : 200);
});

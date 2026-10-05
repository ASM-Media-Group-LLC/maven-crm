// buzones-por-borrar — borra en Zoho los buzones de las cuentas purgadas.
//
// La purga automática (app_purgar_cuentas_vencidas, cron diario 07:00 UTC) es
// SQL y no puede hablar con Zoho: lo que hace es dejar el buzón en la cola
// public.buzones_por_borrar antes de destruir la cuenta. Esta función vacía
// esa cola. La despierta SOLO el cron borrar-buzones-vencidos (07:20 UTC, y
// únicamente si hay algo vencido) con X-Cron-Token. No tiene camino de usuario
// ni de navegador.
//
// La decisión de borrar o no vive en _shared/buzon-por-borrar.ts (la misma que
// usa la purga manual de admin-user-actions): vuelve a confirmar que la cuenta
// no se recuperó, que pasaron los 30 días, que nadie más usa la dirección y
// que no es el Superadministrador de Zoho. Lo que no puede hacer hoy (Zoho
// caído, sin configurar) queda pendiente y se reintenta al día siguiente.
//
// Apagar: select cron.alter_job((select jobid from cron.job where jobname =
// 'borrar-buzones-vencidos'), active := false); o Dashboard → Integrations → Cron.
// La cola sigue llenándose; al prender, se procesa lo acumulado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { datosDeSupabase, procesarCola, zohoDeVerdad } from "../_shared/buzon-por-borrar.ts";
import { tokenDeCronValido } from "../_shared/cron-token.ts";

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });

// Tope por corrida. No es por rendimiento: es para que un error en la cola no
// pueda borrar media organización de una vez. Lo que sobre va en la siguiente.
const TOPE_POR_CORRIDA = 25;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const esperado = Deno.env.get("CRON_INTERNAL_TOKEN");
  if (!esperado) return json({ error: "sin_configurar" }, 503);
  if (!(await tokenDeCronValido(req.headers.get("X-Cron-Token"), esperado))) {
    return json({ error: "Unauthorized" }, 401);
  }
  // El cuerpo no se usa (el cron manda {}).
  await req.body?.cancel().catch(() => {});

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const resumen = await procesarCola(datosDeSupabase(admin), zohoDeVerdad, new Date(), TOPE_POR_CORRIDA);
  const cuenta = (e: string) => resumen.resultados.filter((r) => r.estado === e).length;
  // Solo números: la respuesta queda guardada en net._http_response, y las
  // direcciones y los motivos ya están en la cola y en cuenta_eventos.
  const numeros = {
    ok: resumen.ok,
    error: resumen.error ?? null,
    procesadas: resumen.procesadas,
    borradas: cuenta("borrado"),
    no_se_borran: cuenta("no_se_borra"),
    pendientes: cuenta("pendiente"),
    fallidas: cuenta("fallido"),
  };
  console.log(`[buzones-por-borrar] ${JSON.stringify(numeros)}`);
  return json(numeros, resumen.ok ? 200 : 500);
});

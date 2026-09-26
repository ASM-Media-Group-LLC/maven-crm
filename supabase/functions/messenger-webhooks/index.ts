// messenger-webhooks — el despachador de los timbres del Messenger.
//
// Lo despierta SOLO el cron messenger-webhooks-tick (cada 15 s, y únicamente cuando
// api_webhooks_hay_trabajo() da true) con X-Cron-Token. No tiene camino de usuario
// ni de navegador. La lógica está en ./despachador.ts.
//
// Contesta 202 EN EL ACTO y trabaja en segundo plano (EdgeRuntime.waitUntil). pg_net
// tiene UN solo worker, que también lleva los push del Messenger y unos 35 crons: si
// esta función contestara al terminar, el tiempo que tarda el integrador en
// responder frenaría todo eso. Si el runtime corta el trabajo en segundo plano a
// mitad, el despachador ya anotó el intento antes de mandar: el turno siguiente
// espera y nunca queda un reenvío cada 15 s.
//
// Apagado de emergencia: desactivar el job messenger-webhooks-tick (Dashboard →
// Integrations → Cron, o cron.alter_job(..., active := false)). En 15 s no queda
// actividad. Borrar la función NO la apaga: el CI la vuelve a subir.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { kekConfigurada } from "../_shared/webhook-salida.ts";
import { comoUsuarioConfigurado } from "../public-api/como-usuario.ts";
import { crearDatosDespacho } from "./datos.ts";
import { despachar, lineaDeLog, PLAZO_DESPUES_MS, PRESUPUESTO_MS } from "./despachador.ts";
import { fetchConPlazo, leerFeedComoPersona } from "./feed.ts";
import { tokenValido } from "./token.ts";

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });

type ConSegundoPlano = { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const esperado = Deno.env.get("CRON_INTERNAL_TOKEN");
  if (!esperado) return json({ error: "sin_configurar" }, 503);
  if (!(await tokenValido(req.headers.get("X-Cron-Token"), esperado))) return json({ error: "Unauthorized" }, 401);
  // El cuerpo no se usa (el cron manda {}): no se lee.
  await req.body?.cancel().catch(() => {});
  // Sin los secretos no se hace nada (y sin tocar la base).
  if (!comoUsuarioConfigurado() || !kekConfigurada()) return json({ error: "sin_configurar" }, 503);

  const fin = Date.now() + PRESUPUESTO_MS;
  const cliente = (restanteMs: () => number) =>
    createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      global: { fetch: fetchConPlazo(restanteMs) },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  const corrida = despachar({
    datos: crearDatosDespacho({
      antes: cliente(() => fin - Date.now() - 1_000),
      despues: cliente(() => PLAZO_DESPUES_MS),
    }),
    leerFeed: leerFeedComoPersona,
    sesionConfigurada: comoUsuarioConfigurado,
    fin,
  }).catch((e) => {
    console.log(lineaDeLog(null, "error", { clase: "interno" }));
    void e;
    return null;
  });

  const edge = (globalThis as ConSegundoPlano).EdgeRuntime;
  if (edge?.waitUntil) {
    edge.waitUntil(corrida);
    return json({ ok: true }, 202);
  }
  // Fuera del runtime de Supabase (local): se espera y se devuelve el informe.
  const informe = await corrida;
  return informe ? json(informe.cuerpo, informe.estado) : json({ ok: false }, 500);
});

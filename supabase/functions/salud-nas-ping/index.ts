// Ping en vivo al NAS para el bloque "Salud de la plataforma" (Alvaro, 08/11).
//
// La tabla `drive_nas_salud` solo se actualiza cuando el cron de aportes corre;
// si no hay aportes pendientes, se queda en el último estado y puede quedar
// desactualizada. Esta edge consulta el endpoint `/salud` del NAS en el
// momento — si no responde, el bloque dice "Caído" aunque la tabla diga OK.
//
// Autorización: usuario autenticado (el front lo llama con el bearer); el NAS
// no se expone al navegador (sigue detrás del secreto, aquí solo se verifica
// que responda).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ALLOWED_ORIGINS } from "../_shared/cors.ts";

const NAS = (Deno.env.get("DRIVE_NAS_URL") ?? "").replace(/\/+$/, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const permitido = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": permitido,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(cuerpo: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405, cors);

  // Autenticación — cualquier usuario logueado puede pedir el ping.
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json({ ok: false, error: "sin-sesion" }, 401, cors);
  const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return json({ ok: false, error: "sin-sesion" }, 401, cors);

  if (!NAS) return json({ ok: false, error: "nas-no-configurado", arriba: false }, 200, cors);

  // Ping corto (6 s). No hay auth del NAS porque `/salud` es público del NAS;
  // si en el futuro lo cierran, el detector seguiría usando el cron.
  try {
    const t0 = Date.now();
    const r = await fetch(`${NAS}/salud`, { signal: AbortSignal.timeout(6000) });
    const ms = Date.now() - t0;
    if (!r.ok) return json({ ok: true, arriba: false, motivo: `http ${r.status}`, ms }, 200, cors);
    const body = await r.json().catch(() => null) as { raices?: Array<{ ok: boolean }> } | null;
    const alguna = !!body?.raices?.some((x) => x.ok);
    return json({ ok: true, arriba: alguna, ms, raices: body?.raices?.length ?? 0 }, 200, cors);
  } catch (e) {
    const msg = (e as Error)?.message || "timeout";
    return json({ ok: true, arriba: false, motivo: msg }, 200, cors);
  }
});

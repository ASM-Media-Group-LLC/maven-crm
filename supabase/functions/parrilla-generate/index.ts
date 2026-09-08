// parrilla-generate — botón "Generar con IA" del editor de la Parrilla.
//
// Recibe { grid_id } de un borrador y REDACTA el contenido de sus días con
// Claude: idea de material, copy sugerido, descripción de la acción extra y
// los copies de sus burbujas. La ESTRUCTURA no se toca (formato del día,
// franja, tipo de acción extra y referencias de reels quedan como están:
// la IA jamás inventa URLs).
//
// Aprende de la historia: recibe las parrillas anteriores, el feedback que
// dejaron las managers y el diff entre lo que generó la IA la vez pasada
// (generated_snapshot) y lo que quedó tras la edición humana. Guarda el
// snapshot de esta generación para el mismo loop la próxima semana.
// El núcleo vive en ./ia.ts y lo comparte con el cron de los jueves
// (parrilla-weekly); acá se dispara a demanda desde la UI.
//
// Auth: verify_jwt=false pero TODA la base se toca con el JWT del caller
// (RLS + can_use_module_function deciden). Sin sesión válida no lee ni
// escribe nada.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsFor } from "../_shared/cors.ts";
import { IaError, aplicarRedaccion, redactarParrilla } from "./ia.ts";

const corsHeaders = (req: Request) =>
  corsFor(req, {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  });

// Tope de generaciones por DÍA (día-pared Bogotá), pedido de Jhon: cuenta TODA
// llamada que llegó a Anthropic (api_usage_log op parrilla_generate), exitosa o
// no — lo que protege es el gasto. Override sin redeploy: PARRILLA_IA_MAX_DIA.
const MAX_GENERACIONES_DIA = Number(Deno.env.get("PARRILLA_IA_MAX_DIA") ?? "5");

serve(async (req) => {
  const headers = { ...corsHeaders(req), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  try {
    const { grid_id } = await req.json().catch(() => ({}));
    if (!grid_id) {
      return new Response(JSON.stringify({ error: "grid_id requerido" }), { status: 400, headers });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Sesión inválida" }), { status: 401, headers });
    }

    // Candado diario: el conteo se lee con service role (api_usage_log no es
    // visible para usuarios), pero SOLO se usa para contar — nada se escribe.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    // Bogotá es UTC-5 fijo (sin horario de verano).
    const hoyBogota = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    const { count: usosHoy, error: cErr } = await admin
      .from("api_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("operation", "parrilla_generate")
      .gte("occurred_at", `${hoyBogota}T00:00:00-05:00`);
    if (cErr) throw cErr;
    if ((usosHoy ?? 0) >= MAX_GENERACIONES_DIA) {
      return new Response(
        JSON.stringify({ error: `Límite diario alcanzado: ${MAX_GENERACIONES_DIA} generaciones con IA por día. Vuelve a intentar mañana.` }),
        { status: 429, headers },
      );
    }

    // La parrilla objetivo + sus días (el esqueleto que se respeta).
    const { data: grid, error: gErr } = await supabase
      .from("content_grids")
      .select("id, week_start, week_end, status")
      .eq("id", grid_id)
      .single();
    if (gErr || !grid) {
      return new Response(JSON.stringify({ error: "Parrilla no encontrada" }), { status: 404, headers });
    }

    const { data: days, error: dErr } = await supabase
      .from("content_grid_days")
      .select("*")
      .eq("grid_id", grid_id)
      .order("day_index");
    if (dErr || !days?.length) {
      return new Response(JSON.stringify({ error: "La parrilla no tiene días" }), { status: 400, headers });
    }

    const { generados, model } = await redactarParrilla(supabase, grid, days, { origen: "boton", user_id: userData.user.id });
    const actualizados = await aplicarRedaccion(supabase, grid_id, days, generados, model);

    const usosRestantes = Math.max(0, MAX_GENERACIONES_DIA - ((usosHoy ?? 0) + 1));
    return new Response(JSON.stringify({ ok: true, dias: actualizados, model, usos_restantes: usosRestantes }), { headers });
  } catch (e) {
    console.error("parrilla-generate error", e);
    if (e instanceof IaError) {
      return new Response(JSON.stringify({ error: e.message }), { status: e.status, headers });
    }
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), { status: 500, headers });
  }
});

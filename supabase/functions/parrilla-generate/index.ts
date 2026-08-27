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
// Es la misma pieza que usará el cron de los lunes (F2): acá se dispara a
// demanda desde la UI.
//
// Auth: verify_jwt=false pero TODA la base se toca con el JWT del caller
// (RLS + can_use_module_function deciden). Sin sesión válida no lee ni
// escribe nada.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsFor } from "../_shared/cors.ts";
import { logAnthropicUsage } from "../_shared/usage.ts";

const corsHeaders = (req: Request) =>
  corsFor(req, {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  });

const CLAUDE_TIMEOUT_MS = 110_000;

interface DiaGenerado {
  day_index: number;
  idea: string;
  copy_sugerido: string;
  extra_title?: string;
  extra_desc: string;
  extra_items: Array<{ momento?: string; label: string; copy: string }>;
}

const SYSTEM_PROMPT = `Sos quien redacta la PARRILLA DE PROMOCIÓN semanal de una agencia de creadoras de OnlyFans: el plan diario que cada creadora ejecuta en sus redes. Escribís en ESPAÑOL LATINO NEUTRO, con el tono cercano y pícaro del material de referencia.

REGLAS DURAS (no negociables):
- Instagram: lenguaje limpio y NO sexual explícito, sin precios ni llamadas agresivas; el emoji 💙 es el ÚNICO código permitido para aludir al OnlyFans.
- X y Telegram: canal directo de venta; toda urgencia debe poder ser REAL (cupos, horas límite) y toda oferta debe existir antes de anunciarse.
- JAMÁS inventes URLs, handles ni nombres de creadoras.
- No repitas los copys de las semanas anteriores: variá ideas, ganchos y ángulos. Sí mantené el espíritu de cada tipo de día.
- Copys cortos y naturales, como los del material de referencia (1-2 frases). Nada de muros de texto.

Vas a recibir el ESQUELETO de la semana (día por día: fecha, día de semana, formato, franja, tipo de acción extra y cuántas burbujas de copy espera), las parrillas ANTERIORES, el FEEDBACK de las managers y, si existe, el DIFF entre lo que generó la IA y lo que las managers corrigieron a mano (eso te dice qué NO les gustó — no repitas esos patrones).

Respondé SOLO con un JSON válido (sin markdown, sin comentarios): un array donde cada elemento es
{"day_index": n, "idea": "...", "copy_sugerido": "\\"...\\"", "extra_title": "...", "extra_desc": "...", "extra_items": [{"momento": "mañana|tarde|noche u omitido", "label": "...", "copy": "..."}]}
- "idea" = idea de material del día (concreta y filmable/fotografiable).
- "copy_sugerido" va ENTRE COMILLAS dentro del string, como en el material.
- "extra_items" debe tener EXACTAMENTE la cantidad de burbujas que indica el esqueleto para ese día (respetá los momentos mañana/tarde/noche si el esqueleto los trae).
- Mantené "extra_title" muy parecido al actual (es el nombre de la sección).
- Un elemento por CADA día del esqueleto, en orden.`;

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

    // La parrilla objetivo + sus días (el esqueleto que se respeta).
    const { data: grid, error: gErr } = await supabase
      .from("content_grids")
      .select("id, week_start, week_end, status, feedback, generated_snapshot")
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

    // Historia: hasta 4 parrillas anteriores con su contenido y feedback.
    const { data: prevGrids } = await supabase
      .from("content_grids")
      .select("id, week_start, feedback, generated_snapshot")
      .lt("week_start", grid.week_start)
      .order("week_start", { ascending: false })
      .limit(4);
    const prevIds = (prevGrids ?? []).map((g) => g.id);
    const { data: prevDays } = prevIds.length
      ? await supabase
        .from("content_grid_days")
        .select("grid_id, day_index, date, format_badge, idea, copy_sugerido, extra_type, extra_title, extra_desc, extra_items")
        .in("grid_id", prevIds)
        .order("day_index")
      : { data: [] as any[] };

    const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    const diaSemana = (iso: string) => DIAS_SEMANA[new Date(iso + "T12:00:00Z").getUTCDay()];

    const esqueleto = days.map((d) => ({
      day_index: d.day_index,
      fecha: d.date,
      dia_semana: diaSemana(d.date),
      formato: d.format_badge,
      franja: d.franja,
      extra_type: d.extra_type,
      extra_title_actual: d.extra_title,
      burbujas_esperadas: Array.isArray(d.extra_items)
        ? d.extra_items.map((it: any) => ({ momento: it.momento || undefined, label_actual: it.label }))
        : [],
      referencias_reels: Array.isArray(d.refs) ? d.refs.length : 0,
    }));

    const historia = (prevGrids ?? []).map((g) => ({
      semana: g.week_start,
      feedback_manager: g.feedback || null,
      // Diff de aprendizaje: qué generó la IA vs qué quedó tras la mano humana.
      lo_que_genero_la_ia: g.generated_snapshot?.days ?? null,
      contenido_final: (prevDays ?? [])
        .filter((d) => d.grid_id === g.id)
        .map(({ grid_id: _g, ...rest }) => rest),
    }));

    const userMessage = JSON.stringify({
      semana_a_generar: { week_start: grid.week_start, week_end: grid.week_end, esqueleto },
      parrillas_anteriores: historia,
    });

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Falta ANTHROPIC_API_KEY" }), { status: 500, headers });
    }
    const model = Deno.env.get("CLAUDE_MODEL_STANDARD") || "claude-sonnet-5";

    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), CLAUDE_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        signal: ac.signal,
        body: JSON.stringify({
          model,
          max_tokens: 8000,
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: userMessage }],
        }),
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!res.ok) {
      const body = await res.text();
      console.error("anthropic error", res.status, body.slice(0, 500));
      return new Response(JSON.stringify({ error: `Claude respondió ${res.status}` }), { status: 502, headers });
    }
    const payload = await res.json();
    const raw: string = payload?.content?.[0]?.text ?? "";
    void logAnthropicUsage({
      operation: "parrilla_generate",
      model,
      usage: payload?.usage ?? {},
      context: { grid_id, week_start: grid.week_start },
    });

    // Parseo tolerante: Claude a veces envuelve en ```json.
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    let generados: DiaGenerado[];
    try {
      generados = JSON.parse(jsonText);
    } catch {
      console.error("JSON inválido de Claude:", raw.slice(0, 400));
      return new Response(JSON.stringify({ error: "La IA devolvió un formato inválido, reintentá" }), { status: 502, headers });
    }
    if (!Array.isArray(generados) || !generados.length) {
      return new Response(JSON.stringify({ error: "La IA no devolvió días" }), { status: 502, headers });
    }

    // Aplicar SOLO textos, día por día, con el JWT del caller (RLS decide).
    let actualizados = 0;
    for (const gDay of generados) {
      const original = days.find((d) => d.day_index === gDay.day_index);
      if (!original || typeof gDay.idea !== "string" || typeof gDay.copy_sugerido !== "string") continue;
      const itemsOriginales: any[] = Array.isArray(original.extra_items) ? original.extra_items : [];
      const itemsGenerados = Array.isArray(gDay.extra_items) ? gDay.extra_items : [];
      // Misma cantidad de burbujas que el esqueleto: se casan por posición y se
      // conserva el momento original (mañana/tarde/noche) si la IA lo omitió.
      const extra_items = itemsOriginales.map((orig, i) => ({
        ...(orig.momento ? { momento: orig.momento } : {}),
        label: itemsGenerados[i]?.label?.trim() || orig.label,
        copy: itemsGenerados[i]?.copy?.trim() || orig.copy,
      }));
      const { data: upd, error: uErr } = await supabase
        .from("content_grid_days")
        .update({
          idea: gDay.idea.trim(),
          copy_sugerido: gDay.copy_sugerido.trim(),
          extra_title: gDay.extra_title?.trim() || original.extra_title,
          extra_desc: (gDay.extra_desc ?? original.extra_desc).trim(),
          extra_items,
        })
        .eq("id", original.id)
        .select("id");
      if (uErr) throw uErr;
      // RLS silenciosa = 0 filas sin error: acá sí es un fallo de permisos.
      if (!upd?.length) {
        return new Response(JSON.stringify({ error: "Sin permiso para editar la parrilla" }), { status: 403, headers });
      }
      actualizados++;
    }
    if (!actualizados) {
      return new Response(JSON.stringify({ error: "La IA no devolvió ningún día aplicable" }), { status: 502, headers });
    }

    // Snapshot de lo generado (contra esto se diffean las ediciones humanas).
    const { data: gUpd, error: sErr } = await supabase
      .from("content_grids")
      .update({
        generated_snapshot: { generated_at: new Date().toISOString(), model, days: generados },
        updated_at: new Date().toISOString(),
      })
      .eq("id", grid_id)
      .select("id");
    if (sErr) throw sErr;
    if (!gUpd?.length) {
      return new Response(JSON.stringify({ error: "Sin permiso para editar la parrilla" }), { status: 403, headers });
    }

    // Re-derivar tareas esperadas (los detalles llevan la idea nueva).
    const { error: tErr } = await supabase.rpc("parrilla_derive_tasks", { p_grid_id: grid_id });
    if (tErr) throw tErr;

    return new Response(JSON.stringify({ ok: true, dias: actualizados, model }), { headers });
  } catch (e) {
    console.error("parrilla-generate error", e);
    const aborted = (e as Error)?.name === "AbortError";
    return new Response(
      JSON.stringify({ error: aborted ? "Claude tardó demasiado, reintentá" : String((e as Error)?.message ?? e) }),
      { status: 500, headers },
    );
  }
});

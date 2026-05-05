import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SYSTEM_PROMPT } from "./prompt.ts";

// qa-analyze — corre el análisis Claude/Groq de un qa_calls.id existente.
// Patrón: el frontend YA insertó la fila vía RLS (con claude_analysis: {}
// y claude_score: 0). Esta función lee el row, manda transcript a Groq,
// parsea el JSON, y hace UPDATE con el análisis + score.
//
// Diferencias respecto al kash app/api/analyze/route.ts:
//  - No upsertea models/closers (ya existen, vienen del form).
//  - No corre humanContext (re-analyze con feedback humano es slice futura).
//  - No manda email — Maven no tiene Resend wired para QA todavía.
//  - Provider Groq vía OpenAI-compatible API, no Anthropic SDK directo.
//  - Validación manual del shape del JSON (sin zod en deno por simplicidad).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_TRANSCRIPT_CHARS = 200_000;

interface AnalyzeRequest {
  call_id?: string;
}

interface CallRow {
  id: string;
  transcript: string;
  closer_id: string | null;
  model_id: string | null;
  closer: { name: string } | null;
  model: { name: string; category: string | null; country: string | null } | null;
}

const isValidAnalysis = (a: unknown): boolean => {
  if (!a || typeof a !== "object") return false;
  const o = a as Record<string, unknown>;
  if (typeof o.overall_score !== "number") return false;
  if (typeof o.summary !== "string") return false;
  if (!Array.isArray(o.dimensions)) return false;
  if (!Array.isArray(o.red_flags)) return false;
  if (!Array.isArray(o.key_moments)) return false;
  if (!Array.isArray(o.improvements)) return false;
  if (!o.call_outcome || !["cerro", "no_cerro", "en_espera"].includes(String(o.call_outcome))) {
    return false;
  }
  if (!o.call_facts || typeof o.call_facts !== "object") return false;
  if (!o.model_signals || typeof o.model_signals !== "object") return false;
  return true;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GROQ_API_KEY no configurada en los secrets de Supabase." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const GROQ_URL =
      Deno.env.get("GROQ_BASE_URL") || "https://api.groq.com/openai/v1/chat/completions";
    const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile";

    let body: AnalyzeRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "JSON inválido." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callId = body.call_id?.trim();
    if (!callId) {
      return new Response(JSON.stringify({ error: "call_id requerido." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Service role para poder updatear cualquier qa_calls saltando RLS.
    // El frontend ya validó el insert original con la session del user;
    // acá solo enrichecemos. Si quisiéramos auth-scoped, pasaríamos el
    // JWT del user en el header — pero con service_role es más simple
    // y queda igual de seguro porque solo expone update por id.
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: call, error: callErr } = await supabase
      .from("qa_calls")
      .select(
        "id, transcript, closer_id, model_id, closer:qa_closers(name), model:qa_models(name, category, country)",
      )
      .eq("id", callId)
      .maybeSingle();

    if (callErr) throw callErr;
    if (!call) {
      return new Response(JSON.stringify({ error: "Call no encontrada." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const c = call as unknown as CallRow;
    const transcript = (c.transcript ?? "").trim();
    if (!transcript) {
      return new Response(JSON.stringify({ error: "Transcript vacío." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (transcript.length > MAX_TRANSCRIPT_CHARS) {
      return new Response(
        JSON.stringify({
          error: `Transcript demasiado largo (máx. ${MAX_TRANSCRIPT_CHARS.toLocaleString("es-ES")} caracteres).`,
        }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Header con datos del closer / modelo arriba del transcript.
    // Esto le da contexto al modelo IA sin tener que adivinar.
    const headerLines: string[] = [];
    if (c.closer?.name) headerLines.push(`Closer: ${c.closer.name}`);
    if (c.model?.name) {
      const modelDetails = [
        c.model.name,
        c.model.category ? `cat ${c.model.category}` : null,
        c.model.country ? c.model.country : null,
      ]
        .filter(Boolean)
        .join(" · ");
      headerLines.push(`Modelo: ${modelDetails}`);
    }
    const userMessage =
      (headerLines.length > 0 ? `[CONTEXTO]\n${headerLines.join("\n")}\n\n` : "") +
      `[TRANSCRIPT]\n${transcript}`;

    const groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        // JSON mode forza al modelo a responder JSON puro (Groq lo
        // soporta vía OpenAI-compat).
        response_format: { type: "json_object" },
        // Temp baja para análisis consistente — no queremos creatividad.
        temperature: 0.2,
        max_tokens: 4000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!groqRes.ok) {
      const status = groqRes.status;
      const errText = await groqRes.text().catch(() => "");
      console.error("Groq error", status, errText.slice(0, 500));
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Groq: rate limit. Probá en unos segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (status === 401 || status === 402) {
        return new Response(
          JSON.stringify({ error: "Groq: cuota agotada o key inválida." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: `Groq error ${status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const groqData = await groqRes.json();
    const raw = groqData.choices?.[0]?.message?.content ?? "";
    let analysis: unknown;
    try {
      analysis = JSON.parse(raw);
    } catch (parseErr) {
      console.error("Groq devolvió JSON inválido:", String(parseErr), raw.slice(0, 500));
      return new Response(
        JSON.stringify({
          error: "El modelo IA devolvió JSON malformado. Reintentá.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!isValidAnalysis(analysis)) {
      console.error("Análisis no pasa validación de shape:", JSON.stringify(analysis).slice(0, 500));
      return new Response(
        JSON.stringify({
          error: "El análisis no tiene la estructura esperada. Reintentá.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const score = (analysis as { overall_score: number }).overall_score;

    const { data: updated, error: updateErr } = await supabase
      .from("qa_calls")
      .update({
        claude_analysis: analysis,
        claude_score: score,
      })
      .eq("id", callId)
      .select("*")
      .single();

    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({
        ok: true,
        call_id: callId,
        score,
        analysis,
        usage: groqData.usage ?? null,
        updated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("qa-analyze error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? "Error interno." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

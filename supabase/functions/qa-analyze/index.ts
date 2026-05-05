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
  // Cuando es true, leemos la última row de qa_human_feedback para este
  // call y la inyectamos en el prompt como [FEEDBACK DEL SUPERVISOR].
  // Equivalente al humanContext de kash — el LLM ajusta su análisis
  // considerando las correcciones del supervisor.
  with_feedback?: boolean;
}

interface HumanFeedbackRow {
  evaluator_name: string;
  feedback_text: string;
  human_score: number | null;
  created_at: string;
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
    // Provider selection: Gemini > Groq.
    //  - Si GEMINI_API_KEY existe → usamos Gemini 2.0 Flash (free tier
    //    de Google AI Studio: 1M TPM, 15 RPM, 1500 req/día). Mejor
    //    calidad para juicios subjetivos en español que llama-3.1-8b.
    //  - Si no, fallback a Groq llama-3.1-8b-instant.
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GEMINI_API_KEY && !GROQ_API_KEY) {
      return new Response(
        JSON.stringify({
          error:
            "Ningún provider configurado. Setea GEMINI_API_KEY (recomendado, free tier de Google AI Studio) o GROQ_API_KEY en los secrets de Supabase.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const GROQ_URL =
      Deno.env.get("GROQ_BASE_URL") || "https://api.groq.com/openai/v1/chat/completions";
    const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "llama-3.1-8b-instant";
    const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";

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

    // Si vino with_feedback=true, cargamos la última row de
    // qa_human_feedback para este call. RLS en la tabla restringe por
    // tenant igual que qa_calls — service role bypass-ea pero seguimos
    // filtrando por call_id que ya validamos arriba.
    let humanFeedback: HumanFeedbackRow | null = null;
    if (body.with_feedback === true) {
      const { data: hf, error: hfErr } = await supabase
        .from("qa_human_feedback")
        .select("evaluator_name, feedback_text, human_score, created_at")
        .eq("call_id", callId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (hfErr) {
        // No queremos romper el análisis entero si falla la query del
        // feedback — logueamos y seguimos sin él.
        console.error("Error leyendo qa_human_feedback:", hfErr);
      } else if (hf) {
        humanFeedback = hf as HumanFeedbackRow;
      }
    }

    const feedbackBlock = humanFeedback
      ? `[FEEDBACK DEL SUPERVISOR — ${humanFeedback.evaluator_name}]\n` +
        (humanFeedback.human_score !== null
          ? `Score humano sugerido: ${humanFeedback.human_score}/100\n`
          : "") +
        `${humanFeedback.feedback_text.trim()}\n\n`
      : "";

    const userMessage =
      (headerLines.length > 0 ? `[CONTEXTO]\n${headerLines.join("\n")}\n\n` : "") +
      feedbackBlock +
      `[TRANSCRIPT]\n${transcript}`;

    // Dispatch al provider configurado.
    let raw: string;
    let usage: unknown;
    let providerLabel: "gemini" | "groq";
    try {
      if (GEMINI_API_KEY) {
        const r = await callGemini(GEMINI_API_KEY, GEMINI_MODEL, SYSTEM_PROMPT, userMessage);
        raw = r.raw;
        usage = r.usage;
        providerLabel = "gemini";
      } else {
        const r = await callGroq(GROQ_API_KEY!, GROQ_URL, GROQ_MODEL, SYSTEM_PROMPT, userMessage);
        raw = r.raw;
        usage = r.usage;
        providerLabel = "groq";
      }
    } catch (providerErr) {
      const msg = (providerErr as Error).message ?? "Error de provider IA";
      const status =
        /rate limit|429/i.test(msg) ? 429
        : /key|401|402|cuota|quota/i.test(msg) ? 402
        : 502;
      return new Response(
        JSON.stringify({ error: msg }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let analysis: unknown;
    try {
      analysis = JSON.parse(raw);
    } catch (parseErr) {
      console.error(
        `${providerLabel} devolvió JSON inválido:`,
        String(parseErr),
        raw.slice(0, 500),
      );
      return new Response(
        JSON.stringify({ error: "El modelo IA devolvió JSON malformado. Reintentá." }),
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
        provider: providerLabel,
        usage: usage ?? null,
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

// ─── Provider helpers ────────────────────────────────────────────────
// Ambos retornan { raw, usage } donde raw es el JSON-string del análisis.
// Errores se tiran como Error para que el caller los mapee a HTTP status.

interface LlmCallResult {
  raw: string;
  usage: unknown;
}

async function callGroq(
  apiKey: string,
  url: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
): Promise<LlmCallResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 8000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("Groq error", res.status, errText.slice(0, 500));
    if (res.status === 429) throw new Error("Groq: rate limit. Probá en unos segundos.");
    if (res.status === 401 || res.status === 402) {
      throw new Error("Groq: cuota agotada o key inválida.");
    }
    if (res.status === 413) {
      throw new Error("Groq: request too large. Probá un modelo con más TPM.");
    }
    throw new Error(`Groq error ${res.status}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: unknown;
  };
  return {
    raw: data.choices?.[0]?.message?.content ?? "",
    usage: data.usage ?? null,
  };
}

// Gemini 2.0 Flash vía Google Generative Language API.
// Free tier: 15 RPM, 1M TPM, 1500 req/día (suficiente para QA en beta).
// API key se pasa como query param (?key=...), system prompt va en
// systemInstruction, user content en contents[].parts. responseMimeType
// "application/json" fuerza el output a JSON parseable.
async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
): Promise<LlmCallResult> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8000,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("Gemini error", res.status, errText.slice(0, 500));
    if (res.status === 429) throw new Error("Gemini: rate limit. Probá en unos segundos.");
    if (res.status === 400 && /api key/i.test(errText)) {
      throw new Error("Gemini: API key inválida.");
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("Gemini: API key inválida o sin permisos.");
    }
    throw new Error(`Gemini error ${res.status}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    usageMetadata?: unknown;
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini bloqueó el prompt: ${data.promptFeedback.blockReason}`);
  }
  const candidate = data.candidates?.[0];
  const finishReason = candidate?.finishReason;
  if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
    throw new Error(`Gemini finalizó con razón ${finishReason}.`);
  }
  const raw = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return {
    raw,
    usage: data.usageMetadata ?? null,
  };
}

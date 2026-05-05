import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { MIKE_SYSTEM_PROMPT } from "./prompt.ts";

// qa-chat-mike — generador de la respuesta del asistente IA "Mike"
// para una sesión de QA Chat. Pattern:
//  1. El frontend ya insertó el user message en qa_chat_messages.
//     Esa decisión es deliberada: si esta función falla (rate limit,
//     LLM error, lo que sea), el mensaje del user queda guardado y se
//     puede reintentar sin perder lo escrito.
//  2. Esta función:
//      - Carga la sesión + verifica ownership vía RLS (user JWT).
//      - Carga el historial de mensajes (rolling window).
//      - Carga contexto: últimas N QAs según scope (closer / all).
//      - Llama al LLM (Gemini > Groq dispatcher, mismo patrón que
//        qa-analyze).
//      - Inserta la respuesta como assistant message.
//      - Bumpea session.updated_at para que la sidebar reordene.
//  3. Devuelve el assistant message para que el frontend lo agregue
//     optimistically sin esperar el realtime.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Rolling window de historial — los modelos free tier de Gemini/Groq
// tienen TPM limit, así que mantenemos las últimas 20 turns. Suficiente
// para coherencia de conversación; si querés contexto más largo, subir
// el límite es seguro mientras el TPM aguante.
const MAX_HISTORY_MESSAGES = 20;

// Cantidad de QAs que cargamos como contexto. 30 es un balance entre:
// - Que Mike tenga data suficiente para responder ("quién cierra más",
//   "tendencias del último mes").
// - No saturar el TPM con un payload gigante en cada request.
// Si el scope es "closer" cargamos 30 de ese closer; si "all", 30 del
// equipo entero ordenadas por fecha desc.
const MAX_QAS_FOR_CONTEXT = 30;

// Cuántos chars del summary mantenemos por QA en el contexto. Cortar
// libera tokens sin perder lo importante (el summary del análisis IA
// suele caber en 200 chars).
const MAX_SUMMARY_CHARS = 250;

interface ChatRequest {
  session_id?: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  scope_type: "closer" | "all" | string;
  scope_closer_id: string | null;
}

interface QaCallContextRow {
  call_date: string;
  claude_score: number | null;
  claude_analysis: {
    overall_score?: number;
    summary?: string;
    call_outcome?: string;
    red_flags?: Array<{ type?: string }>;
  } | null;
  closer: { name: string } | null;
  model: { name: string; category: string | null } | null;
}

interface QaChatMessageRow {
  role: "user" | "assistant" | string;
  content: string;
  created_at: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GEMINI_API_KEY && !GROQ_API_KEY) {
      return jsonError(
        "Ningún provider configurado. Setea GEMINI_API_KEY (recomendado) o GROQ_API_KEY.",
        500,
      );
    }
    const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
    const GROQ_URL =
      Deno.env.get("GROQ_BASE_URL") || "https://api.groq.com/openai/v1/chat/completions";
    const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "llama-3.1-8b-instant";

    // Auth: tomamos el JWT del user y todas las queries van scopadas por
    // RLS. Mike no necesita service role — todo lo que lee/escribe está
    // en tablas multi-tenant aisladas por current_tenant_id() + user_id.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonError("No auth header.", 401);
    }

    let body: ChatRequest;
    try {
      body = await req.json();
    } catch {
      return jsonError("JSON inválido. Esperado { session_id }.", 400);
    }
    const sessionId = body.session_id?.trim();
    if (!sessionId) return jsonError("session_id requerido.", 400);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return jsonError("Supabase env (URL/anon key) no configurado.", 500);
    }
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    // Cargar la sesión. Si no aparece, o es de otro user/tenant, RLS
    // devuelve null — respondemos 404 sin filtrar info adicional.
    const { data: sessionRaw, error: sessionErr } = await sb
      .from("qa_chat_sessions")
      .select("id, user_id, scope_type, scope_closer_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionErr) throw sessionErr;
    if (!sessionRaw) return jsonError("Sesión no encontrada.", 404);
    const session = sessionRaw as SessionRow;

    // Cargar historial. Última ventana de mensajes; el último DEBE ser
    // user (lo insertó el frontend antes de invocarnos). Si no es user,
    // significa que se está reintentando sobre una sesión donde Mike
    // ya respondió — devolvemos el último assistant para no duplicar.
    const { data: historyRaw, error: historyErr } = await sb
      .from("qa_chat_messages")
      .select("role, content, created_at")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true })
      .limit(MAX_HISTORY_MESSAGES);
    if (historyErr) throw historyErr;
    const history = (historyRaw ?? []) as QaChatMessageRow[];

    if (history.length === 0) {
      return jsonError("Sesión sin mensajes — primero insertá el user message.", 400);
    }
    const last = history[history.length - 1];
    if (last.role === "assistant") {
      // Idempotencia: si el último ya es assistant, devolvemos eso sin
      // generar uno nuevo. Evita gastar tokens por reintentos del cliente.
      return jsonResponse({ ok: true, alreadyAnswered: true, content: last.content });
    }

    // Cargar contexto: últimas N QAs filtradas por scope.
    let qasQuery = sb
      .from("qa_calls")
      .select(
        "call_date, claude_score, claude_analysis, closer:qa_closers(name), model:qa_models(name, category)",
      )
      .order("call_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(MAX_QAS_FOR_CONTEXT);
    if (session.scope_type === "closer" && session.scope_closer_id) {
      qasQuery = qasQuery.eq("closer_id", session.scope_closer_id);
    }
    const { data: qaCallsRaw, error: qaErr } = await qasQuery;
    if (qaErr) throw qaErr;
    const qaCalls = (qaCallsRaw ?? []) as unknown as QaCallContextRow[];

    const contextBlock = buildContextBlock(qaCalls, session);

    // Armar messages para el LLM. El primer "user" es el bloque de
    // contexto inyectado (no proviene del usuario); luego va el historial.
    // Insertamos contexto como user porque tanto Gemini como Groq lo
    // tratan más naturalmente que un segundo system prompt.
    const llmMessages: Array<{ role: "user" | "assistant"; content: string }> = [
      { role: "user", content: contextBlock },
      { role: "assistant", content: "Ok, ya vi las QAs. ¿En qué te ayudo?" },
      ...history.map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      })),
    ];

    let responseText: string;
    let usage: unknown = null;
    let providerLabel: "gemini" | "groq";
    try {
      if (GEMINI_API_KEY) {
        const r = await callGemini(GEMINI_API_KEY, GEMINI_MODEL, MIKE_SYSTEM_PROMPT, llmMessages);
        responseText = r.text;
        usage = r.usage;
        providerLabel = "gemini";
      } else {
        const r = await callGroq(
          GROQ_API_KEY!,
          GROQ_URL,
          GROQ_MODEL,
          MIKE_SYSTEM_PROMPT,
          llmMessages,
        );
        responseText = r.text;
        usage = r.usage;
        providerLabel = "groq";
      }
    } catch (e) {
      const msg = (e as Error).message ?? "Error de provider IA";
      const status = /429|rate limit/i.test(msg) ? 429 : /401|402|key|cuota|quota/i.test(msg) ? 402 : 502;
      return jsonError(msg, status);
    }

    if (!responseText.trim()) {
      return jsonError("Mike no devolvió texto. Probá reformular la pregunta.", 502);
    }

    // Token tracking: ambos providers exponen counts en shapes distintos.
    // Esto es best-effort — si no parsea, queda null y no rompemos.
    const { tokens_in, tokens_out, cached_tokens } = extractTokenCounts(usage, providerLabel);

    const { data: assistantMsg, error: insertErr } = await sb
      .from("qa_chat_messages")
      .insert({
        session_id: session.id,
        role: "assistant",
        content: responseText.trim(),
        tokens_in,
        tokens_out,
        cached_tokens,
      })
      .select("*")
      .single();
    if (insertErr) throw insertErr;

    // Bump session.updated_at para que la sidebar reordene.
    await sb
      .from("qa_chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", session.id);

    return jsonResponse({
      ok: true,
      message: assistantMsg,
      provider: providerLabel,
      qaContextCount: qaCalls.length,
    });
  } catch (e) {
    console.error("qa-chat-mike error:", e);
    return jsonError((e as Error).message ?? "Error interno.", 500);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────

function jsonResponse(obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildContextBlock(calls: QaCallContextRow[], session: SessionRow): string {
  const scopeLabel =
    session.scope_type === "closer"
      ? "Solo QAs del closer asignado a esta sesión"
      : "QAs de todo el equipo (scope all)";
  const lines: string[] = [
    `[CONTEXTO DEL EQUIPO — últimas ${calls.length} QAs · ${scopeLabel}]`,
  ];
  if (calls.length === 0) {
    lines.push("(Sin QAs todavía en este scope.)");
    return lines.join("\n");
  }
  for (const c of calls) {
    const score = c.claude_score ?? c.claude_analysis?.overall_score ?? "?";
    const outcome = c.claude_analysis?.call_outcome ?? "?";
    const summary = (c.claude_analysis?.summary ?? "").slice(0, MAX_SUMMARY_CHARS).trim();
    const redFlagTypes =
      c.claude_analysis?.red_flags
        ?.map((f) => f?.type)
        .filter((t): t is string => typeof t === "string" && !!t)
        .slice(0, 3)
        .join(", ") ?? "";
    const closer = c.closer?.name ?? "?";
    const modelName = c.model?.name ?? "?";
    const cat = c.model?.category ? ` (${c.model.category})` : "";
    const flagsPart = redFlagTypes ? ` · flags: ${redFlagTypes}` : "";
    lines.push(
      `${c.call_date} · ${closer} · ${modelName}${cat} · score ${score}/100 · ${outcome}${flagsPart} · ${summary}`,
    );
  }
  return lines.join("\n");
}

function extractTokenCounts(
  usage: unknown,
  provider: "gemini" | "groq",
): { tokens_in: number | null; tokens_out: number | null; cached_tokens: number | null } {
  if (!usage || typeof usage !== "object") {
    return { tokens_in: null, tokens_out: null, cached_tokens: null };
  }
  const u = usage as Record<string, unknown>;
  if (provider === "gemini") {
    return {
      tokens_in: typeof u.promptTokenCount === "number" ? u.promptTokenCount : null,
      tokens_out: typeof u.candidatesTokenCount === "number" ? u.candidatesTokenCount : null,
      cached_tokens: typeof u.cachedContentTokenCount === "number" ? u.cachedContentTokenCount : null,
    };
  }
  // Groq usa shape OpenAI-compat: { prompt_tokens, completion_tokens }.
  return {
    tokens_in: typeof u.prompt_tokens === "number" ? u.prompt_tokens : null,
    tokens_out: typeof u.completion_tokens === "number" ? u.completion_tokens : null,
    cached_tokens: null,
  };
}

// ─── Provider helpers ────────────────────────────────────────────────

interface ProviderResult {
  text: string;
  usage: unknown;
}

async function callGroq(
  apiKey: string,
  url: string,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<ProviderResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      max_tokens: 1500,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("Groq error", res.status, errText.slice(0, 500));
    if (res.status === 429) throw new Error("Groq: rate limit. Probá en unos segundos.");
    if (res.status === 401 || res.status === 402) {
      throw new Error("Groq: cuota agotada o key inválida.");
    }
    if (res.status === 413) throw new Error("Groq: request too large.");
    throw new Error(`Groq error ${res.status}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: unknown;
  };
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    usage: data.usage ?? null,
  };
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<ProviderResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  // Gemini usa "model" en vez de "assistant" en su API.
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 1500,
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
  const cand = data.candidates?.[0];
  const finishReason = cand?.finishReason;
  if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
    throw new Error(`Gemini finalizó con razón ${finishReason}.`);
  }
  const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return { text, usage: data.usageMetadata ?? null };
}

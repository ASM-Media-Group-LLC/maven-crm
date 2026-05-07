import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CLARI_SYSTEM_PROMPT } from "./prompt.ts";

// qa-chat-clari — generador de la respuesta del asistente IA "Mike"
// (UI label) para una sesión de QA Chat. Histórico:
// Gemini → Anthropic Claude → Groq llama-3.3-70b-versatile.
// El razonamiento conversacional sobre QAs no necesita la calidad de
// Claude y Groq es ~gratis para chat corto. Se mantiene en Anthropic
// la pieza de qa-analyze (la pesada con rubric).
//
// Pattern:
//  1. El frontend ya insertó el user message en qa_chat_messages.
//  2. Esta función:
//      - Carga la sesión + verifica ownership vía RLS (user JWT).
//      - Carga el historial de mensajes (rolling window).
//      - Carga contexto: últimas N QAs según scope (closer / all).
//      - Llama a Groq (OpenAI-compatible chat completions).
//      - Inserta la respuesta como assistant message.
//      - Bumpea session.updated_at para que la sidebar reordene.
//  3. Devuelve el assistant message al frontend.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_HISTORY_MESSAGES = 20;
const MAX_QAS_FOR_CONTEXT = 30;
const MAX_SUMMARY_CHARS = 250;
const GROQ_TIMEOUT_MS = 60_000; // 1 min para chat (respuestas cortas)
const GROQ_URL =
  Deno.env.get("GROQ_BASE_URL") || "https://api.groq.com/openai/v1/chat/completions";

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
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      return jsonError(
        "GROQ_API_KEY no configurada. Setea en los secrets de Supabase.",
        500,
      );
    }
    // llama-3.3-70b-versatile es el default. Override via GROQ_CHAT_MODEL.
    const GROQ_MODEL =
      Deno.env.get("GROQ_CHAT_MODEL") || "llama-3.3-70b-versatile";

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

    // Load session (RLS-scoped)
    const { data: sessionRaw, error: sessionErr } = await sb
      .from("qa_chat_sessions")
      .select("id, user_id, scope_type, scope_closer_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionErr) throw sessionErr;
    if (!sessionRaw) return jsonError("Sesión no encontrada.", 404);
    const session = sessionRaw as SessionRow;

    // Load message history
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
      // Idempotencia: ya respondido → devolver sin gastar tokens
      return jsonResponse({ ok: true, alreadyAnswered: true, content: last.content });
    }

    // Load QA context
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

    // Build chat messages. Context goes as first user message, then history.
    const chatMessages: Array<{ role: "user" | "assistant"; content: string }> = [
      { role: "user", content: contextBlock },
      { role: "assistant", content: "Ok, ya vi las QAs. ¿En qué te ayudo?" },
      ...history.map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      })),
    ];

    let responseText: string;
    let usage: unknown = null;
    try {
      const r = await callGroq(
        GROQ_API_KEY,
        GROQ_MODEL,
        CLARI_SYSTEM_PROMPT,
        chatMessages,
      );
      responseText = r.text;
      usage = r.usage;
    } catch (e) {
      const msg = (e as Error).message ?? "Error de Groq";
      const status = /429|rate limit/i.test(msg)
        ? 429
        : /401|402|key|cuota|quota|credit/i.test(msg)
          ? 402
          : 502;
      return jsonError(msg, status);
    }

    if (!responseText.trim()) {
      return jsonError("Mike no devolvió texto. Probá reformular la pregunta.", 502);
    }

    const { tokens_in, tokens_out, cached_tokens } = extractTokenCounts(usage);

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

    // Bump session.updated_at
    await sb
      .from("qa_chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", session.id);

    return jsonResponse({
      ok: true,
      message: assistantMsg,
      provider: "groq",
      model: GROQ_MODEL,
      qaContextCount: qaCalls.length,
    });
  } catch (e) {
    console.error("qa-chat-clari error:", e);
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

function extractTokenCounts(usage: unknown): {
  tokens_in: number | null;
  tokens_out: number | null;
  cached_tokens: number | null;
} {
  if (!usage || typeof usage !== "object") {
    return { tokens_in: null, tokens_out: null, cached_tokens: null };
  }
  const u = usage as Record<string, unknown>;
  // Groq exposes OpenAI-style `prompt_tokens` / `completion_tokens`.
  // Groq doesn't return a cache stat; we keep the column nullable.
  return {
    tokens_in: typeof u.prompt_tokens === "number" ? u.prompt_tokens : null,
    tokens_out: typeof u.completion_tokens === "number" ? u.completion_tokens : null,
    cached_tokens: null,
  };
}

// ─── Groq (OpenAI-compatible chat completions) ───────────────────────

interface ProviderResult {
  text: string;
  usage: unknown;
}

async function callGroq(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<ProviderResult> {
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), GROQ_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: ac.signal,
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        temperature: 0.7,
        // OpenAI shape — system goes as the first message.
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });
  } catch (fetchErr) {
    clearTimeout(timeoutId);
    const aborted = (fetchErr as Error).name === "AbortError";
    throw new Error(
      aborted
        ? `Groq tardó más de ${GROQ_TIMEOUT_MS / 1000}s.`
        : `Error al contactar Groq: ${(fetchErr as Error).message}`,
    );
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const status = res.status;
    const errText = await res.text().catch(() => "");
    console.error("Groq API error", status, errText.slice(0, 500));
    if (status === 429) throw new Error("Groq: rate limit. Probá en unos segundos.");
    if (status === 401) throw new Error("Groq: API key inválida.");
    if (status === 402 || status === 403) {
      throw new Error("Groq: crédito agotado o sin permisos.");
    }
    throw new Error(`Groq API error ${status}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: unknown;
  };

  const text = data.choices?.[0]?.message?.content ?? "";
  return { text, usage: data.usage ?? null };
}

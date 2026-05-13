import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CLARI_SYSTEM_PROMPT } from "./prompt.ts";
import { callGeminiOnce } from "../_shared/gemini.ts";

// qa-chat-mike — generador de la respuesta del asistente IA "Mike"
// (UI label) para una sesión de QA Chat. Histórico:
// Gemini → Anthropic Claude → Groq llama-3.3-70b-versatile → Gemini 1.5 Flash.
// El razonamiento conversacional sobre QAs no necesita la calidad de
// Claude y Gemini Flash da mejor instruction-following que llama-8b
// y free tier generoso. Groq queda como fallback si falta la key.
// Se mantiene Anthropic en qa-analyze (la pesada con rubric).
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

// Tamaño del contexto que le mandamos a Mike por call. Para que Mike
// pueda dar coaching útil ahora le pasamos la QA ENTERA (summary
// completo + red_flags + improvements + dimensiones), así puede
// rastrear puntos a mejorar concretos. Para no inflar demasiado:
//   - closer  → 5 QAs (foco fino, contexto chico)
//   - all     → 12 QAs (vista de equipo)
const MAX_HISTORY_MESSAGES = 12;
const MAX_QAS_FOR_CONTEXT_CLOSER = 5;
const MAX_QAS_FOR_CONTEXT_ALL = 12;
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
    call_outcome_reason?: string;
    red_flags?: Array<{ type?: string; description?: string; quote?: string }>;
    improvements?: string[];
    dimensions?: Array<{ name?: string; score?: number; feedback?: string }>;
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
    const provider =
      (Deno.env.get("MIKE_PROVIDER") || "").toLowerCase() ||
      (GEMINI_API_KEY ? "gemini" : "groq");

    if (provider === "gemini" && !GEMINI_API_KEY) {
      return jsonError("GEMINI_API_KEY no configurada.", 500);
    }
    if (provider === "groq" && !GROQ_API_KEY) {
      return jsonError("GROQ_API_KEY no configurada.", 500);
    }
    const GEMINI_MODEL =
      Deno.env.get("MIKE_MODEL_GEMINI") || "gemini-2.5-flash";
    // llama-3.3-70b-versatile es el default Groq. Override via GROQ_CHAT_MODEL.
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

    // Load QA context — limite distinto según scope para no inflar el
    // prompt cuando solo se pregunta por un closer puntual.
    const isCloserScope =
      session.scope_type === "closer" && session.scope_closer_id;
    const qaLimit = isCloserScope
      ? MAX_QAS_FOR_CONTEXT_CLOSER
      : MAX_QAS_FOR_CONTEXT_ALL;
    let qasQuery = sb
      .from("qa_calls")
      .select(
        "call_date, claude_score, claude_analysis, closer:profiles!closer_id(name:full_name), model:qa_models(name, category)",
      )
      .order("call_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(qaLimit);
    if (isCloserScope) {
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
    let usedModel = "";
    try {
      if (provider === "gemini") {
        const r = await callGeminiOnce({
          apiKey: GEMINI_API_KEY!,
          model: GEMINI_MODEL,
          systemPrompt: CLARI_SYSTEM_PROMPT,
          messages: chatMessages,
          temperature: 0.7,
          maxOutputTokens: 2000,
          timeoutMs: GROQ_TIMEOUT_MS,
        });
        responseText = r.text;
        usage = r.usage;
        usedModel = GEMINI_MODEL;
      } else {
        const r = await callGroq(
          GROQ_API_KEY!,
          GROQ_MODEL,
          CLARI_SYSTEM_PROMPT,
          chatMessages,
        );
        responseText = r.text;
        usage = r.usage;
        usedModel = GROQ_MODEL;
      }
    } catch (e) {
      const msg = (e as Error).message ?? "Error del proveedor IA";
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
      provider,
      model: usedModel,
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
    const a = c.claude_analysis ?? {};
    const score = c.claude_score ?? a.overall_score ?? "?";
    const outcome = a.call_outcome ?? "?";
    const closer = c.closer?.name ?? "?";
    const modelName = c.model?.name ?? "?";
    const cat = c.model?.category ? ` (${c.model.category})` : "";
    const summary = (a.summary ?? "").trim();

    // Header de la QA
    lines.push("");
    lines.push(
      `─── ${c.call_date} · ${closer} → ${modelName}${cat} · score ${score}/100 · outcome: ${outcome}`,
    );
    if (a.call_outcome_reason) lines.push(`Motivo outcome: ${a.call_outcome_reason}`);
    if (summary) lines.push(`Resumen: ${summary}`);

    // Red flags con descripción + cita literal
    const flags = (a.red_flags ?? []).filter(Boolean);
    if (flags.length > 0) {
      lines.push("Red flags:");
      for (const f of flags) {
        const t = f.type ?? "?";
        const d = f.description ? ` — ${f.description}` : "";
        const q = f.quote ? ` («${f.quote}»)` : "";
        lines.push(`  • ${t}${d}${q}`);
      }
    }

    // Dimensiones bajas (score < 60) — donde más importa coachear
    const lowDims = (a.dimensions ?? []).filter(
      (d) => typeof d.score === "number" && d.score < 60,
    );
    if (lowDims.length > 0) {
      lines.push("Dimensiones bajas (<60):");
      for (const d of lowDims) {
        lines.push(`  • ${d.name ?? "?"} ${d.score}/100 — ${d.feedback ?? ""}`);
      }
    }

    // Mejoras sugeridas (action items específicos del rubric)
    const imps = (a.improvements ?? []).filter(Boolean);
    if (imps.length > 0) {
      lines.push("Mejoras sugeridas:");
      for (const i of imps) lines.push(`  • ${i}`);
    }
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
  // Tanto Groq (OpenAI-style) como nuestro helper de Gemini exponen
  // prompt_tokens / completion_tokens; cached_tokens existe solo en
  // Gemini cuando hay context cache hit.
  return {
    tokens_in: typeof u.prompt_tokens === "number" ? u.prompt_tokens : null,
    tokens_out: typeof u.completion_tokens === "number" ? u.completion_tokens : null,
    cached_tokens: typeof u.cached_tokens === "number" ? u.cached_tokens : null,
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

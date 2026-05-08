import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SYSTEM_PROMPT } from "./prompt.ts";

// qa-analyze — corre el análisis con Claude (Anthropic API) de un
// qa_calls.id existente. Migrado de Gemini/Groq → Anthropic para igualar
// la calidad del análisis que teníamos en Kash (Claude Opus/Sonnet).
//
// Patrón: el frontend YA insertó la fila vía RLS (con claude_analysis: {}
// y claude_score: 0). Esta función lee el row, manda transcript + contexto
// a Claude, parsea el JSON, y hace UPDATE con el análisis + score.
//
// Soporta re-análisis con feedback humano (with_feedback: true).
// También carga historial del closer para calibración cruzada.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_TRANSCRIPT_CHARS = 200_000;
// Claude Opus context: 200k tokens → ~600k chars; Sonnet: 200k tokens.
// 200k chars de transcript cabe holgado con el system prompt + contexto.
const CLAUDE_TIMEOUT_MS = 120_000; // 2 min

interface AnalyzeRequest {
  call_id?: string;
  with_feedback?: boolean;
}

interface HumanFeedbackRow {
  evaluator_name: string;
  feedback_text: string;
  human_score: number | null;
  created_at: string;
}

interface SectionFeedbackRow {
  section_type: string;
  section_index: number | null;
  thumbs: "up" | "down";
  note: string | null;
  suggested_score: number | null;
}

interface CallRow {
  id: string;
  transcript: string;
  audio_metrics: unknown | null;
  closer_id: string | null;
  model_id: string | null;
  closer: { name: string } | null;
  model: { name: string; category: string | null; country: string | null } | null;
}

interface PastCallRow {
  call_date: string;
  claude_score: number | null;
  claude_analysis: {
    overall_score?: number;
    summary?: string;
    call_outcome?: string;
    red_flags?: Array<{ type?: string }>;
  } | null;
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
  if (
    !o.call_outcome ||
    !["cerro", "no_cerro", "en_espera"].includes(String(o.call_outcome))
  ) {
    return false;
  }
  if (!o.call_facts || typeof o.call_facts !== "object") return false;
  if (!o.model_signals || typeof o.model_signals !== "object") return false;
  return true;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return jsonError(
        "ANTHROPIC_API_KEY no configurada en los secrets de Supabase.",
        500,
      );
    }
    // Modelo configurable. Default: claude-sonnet-4-20250514 (buen balance
    // calidad/costo). Para máxima calidad: claude-opus-4-20250514.
    const CLAUDE_MODEL =
      Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-4-20250514";

    let body: AnalyzeRequest;
    try {
      body = await req.json();
    } catch {
      return jsonError("JSON inválido.", 400);
    }

    const callId = body.call_id?.trim();
    if (!callId) return jsonError("call_id requerido.", 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: call, error: callErr } = await supabase
      .from("qa_calls")
      .select(
        "id, transcript, audio_metrics, closer_id, model_id, closer:qa_closers(name), model:qa_models(name, category, country)",
      )
      .eq("id", callId)
      .maybeSingle();

    if (callErr) throw callErr;
    if (!call) return jsonError("Call no encontrada.", 404);

    const c = call as unknown as CallRow;
    const transcript = (c.transcript ?? "").trim();
    if (!transcript) return jsonError("Transcript vacío.", 400);
    if (transcript.length > MAX_TRANSCRIPT_CHARS) {
      return jsonError(
        `Transcript demasiado largo (máx. ${MAX_TRANSCRIPT_CHARS.toLocaleString("es-ES")} caracteres).`,
        413,
      );
    }

    // Header con datos del closer / modelo.
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

    // Audio metrics (from ElevenLabs Scribe) — si existen, las incluimos
    // en el contexto para que Claude tenga data de talk ratios, duración, etc.
    let metricsBlock = "";
    if (c.audio_metrics && typeof c.audio_metrics === "object") {
      const m = c.audio_metrics as Record<string, unknown>;
      const parts: string[] = [];
      if (typeof m.total_duration_s === "number") {
        const mins = Math.floor(m.total_duration_s / 60);
        const secs = Math.round(m.total_duration_s % 60);
        parts.push(`Duración total: ${mins}m ${secs}s`);
      }
      if (Array.isArray(m.speakers)) {
        for (const s of m.speakers as Array<Record<string, unknown>>) {
          const label = s.label ?? s.id ?? "?";
          const ratio =
            typeof s.talk_ratio === "number"
              ? `${Math.round(s.talk_ratio * 100)}%`
              : "?";
          const wc = s.word_count ?? "?";
          parts.push(`${label}: ${ratio} del habla, ${wc} palabras`);
        }
      }
      if (Array.isArray(m.filler_words) && (m.filler_words as Array<unknown>).length > 0) {
        const fillers = (m.filler_words as Array<Record<string, unknown>>)
          .map((f) => `"${f.word}" x${f.count} (${f.speaker_id})`)
          .join(", ");
        parts.push(`Muletillas: ${fillers}`);
      }
      if (parts.length > 0) {
        metricsBlock = `[AUDIO METRICS]\n${parts.join("\n")}\n\n`;
      }
    }

    // Load past calls from this closer for calibration context (como en Kash).
    // Claude usa este historial para ajustar su severidad relativa.
    let closerHistoryBlock = "";
    if (c.closer_id) {
      const { data: pastCalls } = await supabase
        .from("qa_calls")
        .select("call_date, claude_score, claude_analysis")
        .eq("closer_id", c.closer_id)
        .neq("id", callId) // exclude current call
        .not("claude_analysis", "is", null)
        .order("call_date", { ascending: false })
        .limit(8);

      if (pastCalls && pastCalls.length > 0) {
        const lines = (pastCalls as unknown as PastCallRow[]).map((pc) => {
          const score = pc.claude_score ?? pc.claude_analysis?.overall_score ?? "?";
          const outcome = pc.claude_analysis?.call_outcome ?? "?";
          const summary = (pc.claude_analysis?.summary ?? "").slice(0, 150);
          const flags =
            pc.claude_analysis?.red_flags
              ?.map((f) => f?.type)
              .filter(Boolean)
              .slice(0, 3)
              .join(", ") ?? "";
          return `  ${pc.call_date} · score ${score} · ${outcome}${flags ? ` · flags: ${flags}` : ""} · ${summary}`;
        });
        closerHistoryBlock =
          `[HISTORIAL DEL CLOSER — últimas ${lines.length} calls]\n` +
          lines.join("\n") +
          "\n\n";
      }
    }

    // Human feedback (para re-análisis)
    let feedbackBlock = "";
    if (body.with_feedback === true) {
      // Top-level feedback
      const { data: hf } = await supabase
        .from("qa_human_feedback")
        .select("evaluator_name, feedback_text, human_score, created_at")
        .eq("call_id", callId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (hf) {
        const fb = hf as HumanFeedbackRow;
        feedbackBlock += `[FEEDBACK DEL SUPERVISOR — ${fb.evaluator_name}]\n`;
        if (fb.human_score !== null) {
          feedbackBlock += `Score humano sugerido: ${fb.human_score}/100\n`;
        }
        feedbackBlock += `${fb.feedback_text.trim()}\n`;
      }

      // Section-level feedback (thumbs up/down per dimension/red_flag/etc.)
      const { data: sfRaw } = await supabase
        .from("qa_section_feedback")
        .select("section_type, section_index, thumbs, note, suggested_score")
        .eq("call_id", callId)
        .limit(24);

      if (sfRaw && sfRaw.length > 0) {
        const sectionFeedback = sfRaw as SectionFeedbackRow[];
        feedbackBlock += "\n[FEEDBACK GRANULAR POR SECCIÓN]\n";
        for (const sf of sectionFeedback) {
          const idx = sf.section_index !== null ? ` #${sf.section_index}` : "";
          const thumb = sf.thumbs === "up" ? "OK" : "MAL";
          const note = sf.note ? ` — ${sf.note}` : "";
          const score = sf.suggested_score !== null ? ` (sugerido: ${sf.suggested_score})` : "";
          feedbackBlock += `  ${sf.section_type}${idx}: ${thumb}${note}${score}\n`;
        }
      }

      if (feedbackBlock) feedbackBlock += "\n";
    }

    const userMessage =
      (headerLines.length > 0 ? `[CONTEXTO]\n${headerLines.join("\n")}\n\n` : "") +
      metricsBlock +
      closerHistoryBlock +
      feedbackBlock +
      `[TRANSCRIPT]\n${transcript}`;

    // Inyectar dinámicamente el portfolio de productos en el system
    // prompt. Si la query falla, usamos un placeholder que evita
    // alucinaciones en lugar de exponer el {{}} crudo.
    const { data: portfolioRows } = await supabase
      .from("scouter_companies")
      .select("name")
      .order("name");
    const portfolioList =
      portfolioRows && portfolioRows.length > 0
        ? portfolioRows.map((r: { name: string }) => `  • ${r.name}`).join("\n")
        : "  • (no hay productos registrados; el closer debe seguir sólo con la agencia de OF)";
    const systemPromptWithPortfolio = SYSTEM_PROMPT.replace(
      "{{PRODUCT_PORTFOLIO}}",
      portfolioList,
    );

    // Call Claude via Anthropic Messages API
    let raw: string;
    let usage: unknown;
    try {
      const result = await callClaude(
        ANTHROPIC_API_KEY,
        CLAUDE_MODEL,
        systemPromptWithPortfolio,
        userMessage,
      );
      raw = result.raw;
      usage = result.usage;
    } catch (providerErr) {
      const msg = (providerErr as Error).message ?? "Error de Claude";
      const status = /rate limit|429/i.test(msg)
        ? 429
        : /key|401|402|cuota|quota|credit/i.test(msg)
          ? 402
          : 502;
      return jsonError(msg, status);
    }

    let analysis: unknown;
    try {
      analysis = JSON.parse(raw);
    } catch (parseErr) {
      console.error(
        "Claude devolvió JSON inválido:",
        String(parseErr),
        raw.slice(0, 500),
      );
      return jsonError("Claude devolvió JSON malformado. Reintentá.", 502);
    }

    if (!isValidAnalysis(analysis)) {
      console.error(
        "Análisis no pasa validación de shape:",
        JSON.stringify(analysis).slice(0, 500),
      );
      return jsonError("El análisis no tiene la estructura esperada. Reintentá.", 502);
    }

    // Hard cap por outcome — Claude a veces ignora la instrucción del
    // prompt y le pone 85 a una llamada que terminó "en_espera". El
    // outcome es la realidad del negocio: si no cerró, el closer no
    // entregó resultado por buena que haya sido la conversación.
    const rawScore = (analysis as { overall_score: number }).overall_score;
    const outcome = (analysis as { call_outcome?: string }).call_outcome;
    const outcomeCap =
      outcome === "en_espera" ? 70 :
      outcome === "no_cerro"  ? 60 :
      100;
    const score = Math.min(rawScore, outcomeCap);
    if (score !== rawScore) {
      (analysis as Record<string, unknown>).overall_score = score;
      (analysis as Record<string, unknown>).score_capped_from = rawScore;
      (analysis as Record<string, unknown>).score_cap_reason = `outcome=${outcome} → cap=${outcomeCap}`;
    }

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
        provider: "anthropic",
        model: CLAUDE_MODEL,
        usage: usage ?? null,
        updated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("qa-analyze error:", e);
    return jsonError((e as Error).message ?? "Error interno.", 500);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Claude (Anthropic Messages API) ────────────────────────────────

interface LlmCallResult {
  raw: string;
  usage: unknown;
}

async function callClaude(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
): Promise<LlmCallResult> {
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
        max_tokens: 16000,
        // System prompt con cache control para reducir costos en
        // re-análisis consecutivos (misma rubric, distinto transcript).
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
      }),
    });
  } catch (fetchErr) {
    clearTimeout(timeoutId);
    const aborted = (fetchErr as Error).name === "AbortError";
    throw new Error(
      aborted
        ? `Claude tardó más de ${CLAUDE_TIMEOUT_MS / 1000}s. Probá de nuevo.`
        : `Error al contactar Anthropic: ${(fetchErr as Error).message}`,
    );
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const status = res.status;
    const errText = await res.text().catch(() => "");
    console.error("Claude API error", status, errText.slice(0, 500));
    if (status === 429) throw new Error("Claude: rate limit. Probá en unos segundos.");
    if (status === 401) throw new Error("Claude: API key inválida.");
    if (status === 402 || status === 403) {
      throw new Error("Claude: crédito agotado o sin permisos.");
    }
    if (status === 529) throw new Error("Claude: API sobrecargada. Probá en unos segundos.");
    throw new Error(`Claude API error ${status}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    stop_reason?: string;
  };

  // Extract text from content blocks
  const textBlocks = (data.content ?? [])
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("");

  if (!textBlocks) {
    throw new Error("Claude devolvió respuesta vacía.");
  }

  // Clean potential markdown wrapping (```json ... ```)
  let raw = textBlocks.trim();
  if (raw.startsWith("```json")) raw = raw.slice(7);
  if (raw.startsWith("```")) raw = raw.slice(3);
  if (raw.endsWith("```")) raw = raw.slice(0, -3);
  raw = raw.trim();

  return {
    raw,
    usage: data.usage ?? null,
  };
}

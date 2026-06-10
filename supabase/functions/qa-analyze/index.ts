import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SYSTEM_PROMPT } from "./prompt.ts";
import { logAnthropicUsage } from "../_shared/usage.ts";
import { buildQaEmailHtml, buildQaEmailSubject, labelForOutcome, type QaEmailPayload } from "./qaEmail.ts";

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
    "authorization, x-client-info, apikey, content-type, x-cron-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
  claude_score: number | null;
  closer: { name: string } | null;
  model: { name: string; category: string | null; country: string | null; ig_url: string | null } | null;
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

  // Auth: aceptamos DOS modos (mismo patrón que send-report):
  //   · X-Cron-Token (interno desde el cron de retry de QAs stuck)
  //   · JWT válido en Authorization (frontend "Re-analizar")
  // Cualquiera de los dos basta.
  const cronToken = req.headers.get("X-Cron-Token");
  const expectedToken = Deno.env.get("CRON_INTERNAL_TOKEN");
  const authHeader = req.headers.get("Authorization") ?? "";
  const hasCronToken = !!expectedToken && cronToken === expectedToken;
  const hasJwt = authHeader.toLowerCase().startsWith("bearer ") && authHeader.length > 20;
  if (!hasCronToken && !hasJwt) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return jsonError(
        "ANTHROPIC_API_KEY no configurada en los secrets de Supabase.",
        500,
      );
    }
    // Modelo configurable por TIER de la modelo:
    //   A++ y A+ → premium (Opus 4.7) — modelos top que justifican el
    //   costo extra del análisis más fino.
    //   A / B+ / B / C+ / C / null → standard (Sonnet 4.6) — buen
    //   balance calidad/costo, suficiente para el grueso del catálogo.
    //
    // Override por env si querés ajustar:
    //   CLAUDE_MODEL_PREMIUM   — modelo para A++/A+ (default: claude-opus-4-7)
    //   CLAUDE_MODEL_STANDARD  — modelo para el resto (default: claude-sonnet-4-6)
    //   CLAUDE_MODEL           — legacy/fuerza para TODAS las calls (override total)
    //
    // El pick efectivo se hace abajo cuando ya tenemos category de la modelo.
    const CLAUDE_MODEL_PREMIUM =
      Deno.env.get("CLAUDE_MODEL_PREMIUM") || "claude-opus-4-7";
    const CLAUDE_MODEL_STANDARD =
      Deno.env.get("CLAUDE_MODEL_STANDARD") || "claude-sonnet-4-6";
    const CLAUDE_MODEL_FORCE = Deno.env.get("CLAUDE_MODEL");

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
        "id, transcript, audio_metrics, closer_id, model_id, claude_score, closer:profiles!closer_id(name:full_name), model:qa_models(name, category, country, ig_url)",
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

    // Pick del modelo según category. Premium tier = A++ / A+ (modelos
    // top que justifican el costo extra). Resto va a standard. Si está
    // seteado el override CLAUDE_MODEL, ese gana sobre todo (escape
    // hatch para casos como debug o forzar todas a Opus en una corrida).
    const cat = (c.model?.category ?? "").trim();
    const isPremiumTier = cat === "A++" || cat === "A+";
    const CLAUDE_MODEL = CLAUDE_MODEL_FORCE
      ? CLAUDE_MODEL_FORCE
      : isPremiumTier
        ? CLAUDE_MODEL_PREMIUM
        : CLAUDE_MODEL_STANDARD;

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

    // El score TOTAL = CALIDAD DEL PROCESO: el promedio de los criterios
    // (qué tan bien manejó la llamada el closer). El resultado (cerró/no)
    // queda guardado en el análisis y se muestra APARTE, pero NO aplasta la
    // nota. Antes el total era el `overall_score` que Claude castigaba fuerte
    // por outcome (≠ promedio de criterios → confundía). Decisión del owner
    // 2026-06-04: la nota del closer mide su manejo, no el cierre.
    const dimScores = ((analysis as { dimensions?: Array<{ score?: number }> }).dimensions ?? [])
      .map((d) => Number(d?.score))
      .filter((n) => Number.isFinite(n));
    const score = dimScores.length
      ? Math.round(dimScores.reduce((a, b) => a + b, 0) / dimScores.length)
      : (analysis as { overall_score: number }).overall_score;

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

    // ── Email del reporte (SERVER-SIDE) ────────────────────────────────────
    // Antes el correo se disparaba fire-and-forget DESDE EL NAVEGADOR
    // (AgencyNewQa) al terminar el análisis; si el usuario cerraba la pestaña
    // antes, no salía (caso real: QA de Miguel 2026-06-10). Ahora lo manda el
    // server, así no depende del front. Solo en el PRIMER análisis (no en
    // re-análisis) y solo si qa_config lo pide. Falla silenciosa.
    const wasFirstAnalysis = !(typeof c.claude_score === "number" && c.claude_score > 0);
    if (wasFirstAnalysis) {
      try {
        await sendQaReportEmail(supabase, updated, analysis, score, c.model, c.closer);
      } catch (mailErr) {
        console.error("qa-analyze: email del reporte falló:", (mailErr as Error).message);
      }
    }

    // Redistribuir participation_pct entre los participants de la call
    // (qa_call_participants) ahora que claude_analysis está poblado.
    // La RPC mira audio_metrics.speakers + claude_analysis.closer_speaker_label
    // para asignar speaker_label a cada participant y normalizar pct entre
    // closers (sin contar el modelo). Si solo hay 1 participant, queda
    // con pct=1.0. Falla silenciosa — no rompe la respuesta principal.
    try {
      const { error: recalcErr } = await supabase.rpc("recalculate_qa_call_participants", {
        p_call_id: callId,
      });
      if (recalcErr) {
        console.warn("recalculate_qa_call_participants warning:", recalcErr.message);
      }
    } catch (e) {
      console.warn("recalculate_qa_call_participants threw:", (e as Error).message);
    }

    // Loggea uso para el dashboard "Control de Gasto". No await crítico
    // — si falla el insert, no rompe la response al cliente.
    if (usage) {
      void logAnthropicUsage({
        operation: "qa-analyze",
        model: CLAUDE_MODEL,
        usage: usage as any,
        context: { qa_call_id: callId, score },
      });
    }

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

// Manda el email del reporte de QA server-side (reemplaza el fire-and-forget
// del navegador que se perdía si cerraban la pestaña). Lee qa_config, respeta
// los toggles de notificación, arma el HTML con el mismo template que el front
// y delega el envío a send-notification-email (resuelve el email del uploader
// + Resend). model/closer vienen del read inicial (sin re-query).
async function sendQaReportEmail(
  supabase: ReturnType<typeof createClient>,
  call: Record<string, unknown>,
  analysis: unknown,
  score: number,
  model: { name?: string; category?: string | null; ig_url?: string | null } | null,
  closer: { name?: string } | null,
): Promise<void> {
  const { data: cfg } = await supabase.from("qa_config").select("*").eq("id", 1).maybeSingle();
  if (!cfg) return;
  const config = cfg as {
    notify_on_analyzed?: boolean;
    notify_on_low_score?: boolean;
    low_score_threshold?: number | null;
    notification_emails?: string[] | null;
  };
  const shouldNotify =
    config.notify_on_analyzed === true ||
    (config.notify_on_low_score === true && score < (config.low_score_threshold ?? 60));
  if (!shouldNotify) return;

  const recipients = config.notification_emails ?? [];
  const uploaderUserId = (call.uploaded_by as string | null) ?? null;
  if (recipients.length === 0 && !uploaderUserId) return;

  const a = (analysis ?? {}) as {
    summary?: string;
    call_outcome?: string | null;
    call_outcome_reason?: string | null;
    dimensions?: Array<{ name: string; score: number; feedback: string }>;
    red_flags?: Array<{ type: string; description: string; quote: string }>;
    key_moments?: Array<{ kind: "positivo" | "negativo"; quote: string; why: string }>;
    improvements?: string[];
  };
  const outcome = a.call_outcome ?? null;
  const payload: QaEmailPayload = {
    callId: call.id as string,
    createdAt: (call.created_at as string) ?? "",
    closerName: closer?.name ?? "(sin nombre)",
    modelName: model?.name ?? "(sin nombre)",
    modelCategory: model?.category ?? null,
    modelIgUrl: model?.ig_url ?? null,
    appUrl: Deno.env.get("APP_URL") || "https://maven.asmtech.ai",
    callDate: (call.call_date as string) ?? "",
    evaluatorName: (call.evaluator_name as string) ?? "",
    overallScore: score,
    summary: a.summary ?? "",
    callOutcome: outcome,
    callOutcomeLabel: labelForOutcome(outcome),
    callOutcomeReason: a.call_outcome_reason ?? null,
    dimensions: (a.dimensions ?? []).map((d) => ({ name: d.name, score: d.score, feedback: d.feedback })),
    redFlags: (a.red_flags ?? []).map((f) => ({ type: f.type, description: f.description, quote: f.quote })),
    keyMoments: (a.key_moments ?? []).map((k) => ({ kind: k.kind, quote: k.quote, why: k.why })),
    improvements: a.improvements ?? [],
  };

  const { error: mailErr } = await supabase.functions.invoke("send-notification-email", {
    body: {
      to: recipients,
      subject: buildQaEmailSubject(payload),
      html: buildQaEmailHtml(payload),
      tag: "qa",
      also_include_user_ids: uploaderUserId ? [uploaderUserId] : undefined,
    },
  });
  if (mailErr) throw new Error((mailErr as Error).message ?? "send-notification-email falló");
}

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

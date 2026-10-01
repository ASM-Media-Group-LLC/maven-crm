import { corsFor } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  CATALOG_REFERENCE_ONLY_NOTE,
  EXTERNAL_SALE_ADDENDUM,
  PRODUCT_CATALOG,
  SERVICE_SALE_ADDENDUM,
  SYSTEM_PROMPT,
  UNSPECIFIED_SERVICE_NOTE,
} from "./prompt.ts";
import { costoDeUso, MODELO_ECONOMICO, pedirAnalisis } from "./openrouter.ts";
import { buildQaEmailHtml, buildQaEmailSubject, labelForOutcome, type QaEmailPayload } from "./qaEmail.ts";

// qa-analyze — corre el análisis con IA (desde el 01/10/2026, un Gemini económico
// por OpenRouter: Maven ya no tiene llave de Anthropic; ver openrouter.ts) de un
// qa_calls.id existente. Migrado de Gemini/Groq → Anthropic para igualar
// la calidad del análisis que teníamos en Kash (Claude Opus/Sonnet).
//
// Patrón: el frontend YA insertó la fila vía RLS (con claude_analysis: {}
// y claude_score: 0). Esta función lee el row, manda transcript + contexto
// a Claude, parsea el JSON, y hace UPDATE con el análisis + score.
//
// Soporta re-análisis con feedback humano (with_feedback: true).
// También carga historial del closer para calibración cruzada.

const corsHeaders = (req: Request) => corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" });

const MAX_TRANSCRIPT_CHARS = 200_000;
// Claude Opus context: 200k tokens → ~600k chars; Sonnet: 200k tokens.
// 200k chars de transcript cabe holgado con el system prompt + contexto.
// Presupuesto de pared: Supabase mata la edge function a los ~150s. El resto de
// la invocación (leer la call, parsear, escribir el análisis) son 2-5s, así que
// 135s para Claude deja margen para devolver un 502 LEGIBLE en vez de que el
// runtime la mate y el closer vea un error genérico.
// Estaba en 120s y con el prompt recalibrado (SYSTEM_PROMPT pasó de 18k a 50k
// chars y pide más output: prefijos "No aplica", atribución por hablante, el
// aviso de tipo de llamada) las llamadas largas empezaron a pasarse — aca2a7af
// falló 2 de 3 veces con "Claude tardó más de 120s".
// Red de seguridad: si igual se pasa, la fila queda con claude_analysis='{}' y
// el cron retry_stuck_qa_analyses (job 18, cada 10 min) la reintenta — eso recién
// funciona desde que se creó el secret project_url en Vault el 2026-07-30.
const IA_TIMEOUT_MS = 135_000;

interface AnalyzeRequest {
  call_id?: string;
  with_feedback?: boolean;
  /** Sólo reenviar el correo del reporte usando el claude_analysis YA guardado
   *  (no vuelve a llamar a Claude → no gasta tokens). Lo usa el cron
   *  retry_pending_qa_report_emails para los correos que se perdieron cuando el
   *  navegador cerró la pestaña y el worker se canceló antes del envío. */
  email_only?: boolean;
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
  section_label: string | null;
  // qa_section_feedback.thumbs es INTEGER (1 = pulgar arriba, -1 = abajo). Estaba
  // tipada como "up" | "down" y comparada con === "up", así que TODO el feedback
  // del supervisor llegaba al prompt como "MAL", incluido lo que había aprobado.
  thumbs: number;
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
  // 'reclutamiento' (default) | 'venta_servicio' — venta de un servicio del
  // portfolio a una creadora que YA es de la agencia (reporte de Miguel).
  call_type: string | null;
  service_sold: string | null;
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

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
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  try {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      return jsonError(req,
        "OPENROUTER_API_KEY no configurada en los secrets de Supabase.",
        500,
      );
    }
    // El modelo, por TIER de la modelo. Desde el 01/10/2026 va por OpenRouter con
    // un Gemini económico (Maven ya no tiene llave de Anthropic):
    //   IA_MODELO_OPENROUTER — para todas (default: google/gemini-2.5-flash-lite)
    //   QA_MODELO_PREMIUM    — solo para A++ / A+ (default: el mismo)
    // ⚠️ Ya NO lee CLAUDE_MODEL*: si siguen cargados con nombres de Claude, OpenRouter
    // no los reconocería.
    const MODELO_ESTANDAR = Deno.env.get("IA_MODELO_OPENROUTER") || MODELO_ECONOMICO;
    const MODELO_PREMIUM = Deno.env.get("QA_MODELO_PREMIUM") || MODELO_ESTANDAR;

    let body: AnalyzeRequest;
    try {
      body = await req.json();
    } catch {
      return jsonError(req, "JSON inválido.", 400);
    }

    const callId = body.call_id?.trim();
    if (!callId) return jsonError(req, "call_id requerido.", 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: call, error: callErr } = await supabase
      .from("qa_calls")
      .select(
        "id, transcript, audio_metrics, closer_id, model_id, claude_score, call_type, service_sold, claude_analysis, created_at, call_date, evaluator_name, uploaded_by, report_email_sent_at, closer:profiles!closer_id(name:full_name), model:qa_models(name, category, country, ig_url)",
      )
      .eq("id", callId)
      .maybeSingle();

    if (callErr) throw callErr;
    if (!call) return jsonError(req, "Call no encontrada.", 404);

    // ── Modo email_only: reenviar el correo del reporte SIN volver a analizar ──
    // Lo dispara el cron retry_pending_qa_report_emails para los casos en que el
    // análisis se guardó pero el correo no salió (el closer cerró la pestaña y
    // Supabase canceló el worker antes del envío). Idempotente por
    // report_email_sent_at.
    if (body.email_only === true) {
      const row = call as Record<string, unknown>;
      const existing = row.claude_analysis as Record<string, unknown> | null;
      if (!existing || Object.keys(existing).length === 0) {
        return jsonError(req, "La call todavía no tiene análisis; no hay reporte que enviar.", 409);
      }
      if (row.report_email_sent_at) {
        return new Response(
          JSON.stringify({ ok: true, skipped: "email_already_sent" }),
          { headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
        );
      }
      const savedScore = Number(row.claude_score ?? 0);
      try {
        await sendQaReportEmail(
          supabase,
          row,
          existing,
          savedScore,
          (call as unknown as CallRow).model,
          (call as unknown as CallRow).closer,
        );
        await supabase
          .from("qa_calls")
          .update({ report_email_sent_at: new Date().toISOString(), status: "ready" })
          .eq("id", callId);
        return new Response(JSON.stringify({ ok: true, emailed: true }), {
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      } catch (mailErr) {
        console.error("qa-analyze email_only: falló el envío:", (mailErr as Error).message);
        return jsonError(req, `No se pudo enviar el correo: ${(mailErr as Error).message}`, 502);
      }
    }

    const c = call as unknown as CallRow;
    const transcript = (c.transcript ?? "").trim();
    if (!transcript) return jsonError(req, "Transcript vacío.", 400);
    if (transcript.length > MAX_TRANSCRIPT_CHARS) {
      return jsonError(req, 
        `Transcript demasiado largo (máx. ${MAX_TRANSCRIPT_CHARS.toLocaleString("es-ES")} caracteres).`,
        413,
      );
    }

    // Header con datos del closer / modelo.
    const isServiceSale = c.call_type === "venta_servicio";
    const isExternalSale = c.call_type === "venta_externa";
    // "Otro" es la opción catch-all del selector (QA_SERVICES) y las filas
    // creadas fuera del form (API, cron de QAs stuck) pueden no traer servicio:
    // en ambos casos el valor no informa nada, así que se lo pedimos al modelo
    // desde el transcript (UNSPECIFIED_SERVICE_NOTE) en lugar de interpolarlo
    // como si fuera el nombre real del producto — antes terminaba escrito
    // "venta de servicio (no especificado)" en el summary que lee el closer.
    const rawService = (c.service_sold ?? "").trim();
    const serviceUnspecified = rawService === "" || rawService.toLowerCase() === "otro";
    const serviceName = serviceUnspecified ? "sin especificar en el formulario" : rawService;
    const headerLines: string[] = [];
    if (isServiceSale) {
      headerLines.push(
        `Tipo de llamada: VENTA DE SERVICIO a una creadora que YA es de la agencia — servicio ofrecido: ${serviceName}`,
      );
    } else if (isExternalSale) {
      headerLines.push(
        `Tipo de llamada: VENTA EXTERNA a una modelo que NO es de la agencia — plataforma ofrecida: ${serviceName}`,
      );
    } else {
      headerLines.push(
        "Tipo de llamada: RECLUTAMIENTO (cerrar a la modelo para la agencia). Este dato viene del formulario y describe el OBJETIVO INICIAL de la llamada, no necesariamente cómo terminó.",
      );
    }
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
        .select("section_type, section_index, section_label, thumbs, note, suggested_score")
        .eq("call_id", callId)
        .limit(24);

      if (sfRaw && sfRaw.length > 0) {
        const sectionFeedback = sfRaw as SectionFeedbackRow[];
        feedbackBlock += "\n[FEEDBACK GRANULAR POR SECCIÓN]\n";
        for (const sf of sectionFeedback) {
          const idx = sf.section_index !== null ? ` #${sf.section_index}` : "";
          const label = sf.section_label ? ` "${sf.section_label}"` : "";
          const thumb = Number(sf.thumbs) > 0 ? "OK" : "MAL";
          const note = sf.note ? ` — ${sf.note}` : "";
          const score = sf.suggested_score !== null ? ` (sugerido: ${sf.suggested_score})` : "";
          feedbackBlock += `  ${sf.section_type}${idx}${label}: ${thumb}${note}${score}\n`;
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

    // El portfolio ya NO se interpola desde scouter_companies: esa tabla es de
    // SCOUTING (a quién reclutar) y arrastraba entidades que un closer no puede
    // ofrecerle a una modelo (Price Shoes, Pagomundo, Exchange...). La lista
    // taxativa vive ahora en el bloque PORTFOLIO del SYSTEM_PROMPT.
    let systemPromptWithPortfolio = SYSTEM_PROMPT;
    // Venta de servicio a creadora existente → el addendum ANULA el framing de
    // reclutamiento (outcome = cierre del servicio, sin red flag cross-portfolio).
    if (isServiceSale) {
      systemPromptWithPortfolio += SERVICE_SALE_ADDENDUM.replaceAll(
        "{{SERVICE_SOLD}}",
        serviceName,
      );
    } else if (isExternalSale) {
      // Modelo externa: sin relación previa donde apalancarse + el
      // reclutamiento a la agencia es upside si aparece fit.
      systemPromptWithPortfolio += EXTERNAL_SALE_ADDENDUM.replaceAll(
        "{{SERVICE_SOLD}}",
        serviceName,
      );
    }
    // El catálogo va SIEMPRE: reclutamiento también pitchea plataformas (pivote
    // tras el "no" a la agencia) y sin él la IA alucina features, pricing y
    // nombres — en prod escribió "Ledshot/Onimred" y "el servicio Unlimited de
    // filtración" en calls de reclutamiento.
    systemPromptWithPortfolio += PRODUCT_CATALOG;
    if (!isServiceSale && !isExternalSale) {
      // En reclutamiento es SOLO referencia: sin la regla de penalización de la
      // dim 7 (claude_score = promedio de 13 dims y las 53 QA son reclutamiento).
      systemPromptWithPortfolio += CATALOG_REFERENCE_ONLY_NOTE;
    }
    // Doblemente guardado: sólo en ventas y sólo si el servicio no vino
    // identificado → reclutamiento nunca ve esta nota.
    if ((isServiceSale || isExternalSale) && serviceUnspecified) {
      systemPromptWithPortfolio += UNSPECIFIED_SERVICE_NOTE;
    }

    // Pick del modelo según category: A++ / A+ pueden ir a un modelo mejor.
    const cat = (c.model?.category ?? "").trim();
    const isPremiumTier = cat === "A++" || cat === "A+";
    const MODELO = isPremiumTier ? MODELO_PREMIUM : MODELO_ESTANDAR;

    let raw: string;
    let usage: Awaited<ReturnType<typeof pedirAnalisis>>["usage"];
    try {
      const result = await pedirAnalisis(
        fetch,
        OPENROUTER_API_KEY,
        MODELO,
        systemPromptWithPortfolio,
        userMessage,
        IA_TIMEOUT_MS,
      );
      raw = result.raw;
      usage = result.usage;
    } catch (providerErr) {
      const msg = (providerErr as Error).message ?? "Error de la IA";
      const status = /rate limit|429/i.test(msg)
        ? 429
        : /key|401|402|cuota|quota|credit|crédito/i.test(msg)
          ? 402
          : 502;
      return jsonError(req, msg, status);
    }

    let analysis: unknown;
    try {
      analysis = JSON.parse(raw);
    } catch (parseErr) {
      console.error(
        "La IA devolvió JSON inválido:",
        String(parseErr),
        raw.slice(0, 500),
      );
      return jsonError(req, "La IA devolvió JSON malformado. Reintenta.", 502);
    }

    if (!isValidAnalysis(analysis)) {
      console.error(
        "Análisis no pasa validación de shape:",
        JSON.stringify(analysis).slice(0, 500),
      );
      return jsonError(req, "El análisis no tiene la estructura esperada. Reintenta.", 502);
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
    // El score es el promedio de las dims → si el modelo devuelve menos de 13,
    // la escala cambia EN SILENCIO. No lo rechazamos (rompería llamadas que hoy
    // funcionan), pero queda registrado para poder diagnosticarlo.
    if (dimScores.length !== 13) {
      console.warn(
        `qa-analyze: dimensiones inesperadas (${dimScores.length} en vez de 13) en call ${callId} — el promedio del score cambia de escala.`,
      );
    }
    // Escala: el rubric pide 0-100. Si TODAS las dims vienen <= 10 es una
    // respuesta en escala 1-10 → guardarla daría una nota ~7/100 sin error visible.
    if (dimScores.length >= 2 && dimScores.every((n) => n <= 10)) {
      console.error(`qa-analyze: dims en escala 1-10 en call ${callId}`, dimScores);
      return jsonError(req, "El análisis vino en escala 1-10 en vez de 0-100. Reintenta.", 502);
    }
    const clamped = dimScores.map((n) => Math.min(100, Math.max(0, n)));
    const score = clamped.length
      ? Math.round(clamped.reduce((a, b) => a + b, 0) / clamped.length)
      : (analysis as { overall_score: number }).overall_score;

    const { data: updated, error: updateErr } = await supabase
      .from("qa_calls")
      .update({
        claude_analysis: analysis,
        claude_score: score,
        // status server-side: antes lo escribía SÓLO el frontend al final de su
        // secuencia, así que si el closer cerraba la pestaña la QA quedaba
        // "processing" para siempre (caso real 29-jul). El análisis terminó acá,
        // así que el estado real es 'ready'.
        status: "ready",
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
        // Marca idempotente: sin esto el cron retry_pending_qa_report_emails lo
        // volvería a mandar. Si el worker muere ANTES de esta línea, el correo
        // queda pendiente y el cron lo reintenta — que es justo lo que se busca.
        await supabase
          .from("qa_calls")
          .update({ report_email_sent_at: new Date().toISOString() })
          .eq("id", callId);
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
      void supabase.from("api_usage_log").insert({
        provider: "openrouter",
        operation: "qa-analyze",
        model: MODELO,
        units: { input_tokens: usage.prompt_tokens ?? 0, output_tokens: usage.completion_tokens ?? 0 },
        cost_usd: costoDeUso(MODELO, usage),
        context: { qa_call_id: callId, score },
      }).then(({ error }) => { if (error) console.warn("api_usage_log:", error.message); });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        call_id: callId,
        score,
        analysis,
        provider: "openrouter",
        model: MODELO,
        usage: usage ?? null,
        updated,
      }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("qa-analyze error:", e);
    return jsonError(req, (e as Error).message ?? "Error interno.", 500);
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
    serviceLabel:
      (call.call_type as string | null) === "venta_servicio" ||
      (call.call_type as string | null) === "venta_externa"
        ? ((call.service_sold as string | null) || "servicio")
        : null,
    dimensions: (a.dimensions ?? []).map((d) => ({ name: d.name, score: d.score, feedback: d.feedback })),
    redFlags: (a.red_flags ?? []).map((f) => ({ type: f.type, description: f.description, quote: f.quote })),
    keyMoments: (a.key_moments ?? []).map((k) => ({ kind: k.kind, quote: k.quote, why: k.why })),
    improvements: a.improvements ?? [],
  };

  // ⚠️ Authorization EXPLÍCITO. `supabase.functions.invoke` NO hereda la
  // credencial del createClient(url, serviceKey) para las llamadas edge→edge:
  // llega sin header y send-notification-email (verify_jwt=true) responde
  // 401 missing_auth_header. Eso es lo que hacía que NINGÚN correo de QA saliera
  // desde que el envío se movió al server — el 401 caía en un catch silencioso.
  // Diagnóstico del 29-jul: el detalle real del error sólo apareció al leer el
  // body de la Response (ver el manejo de mailErr abajo).
  const serviceKeyForInvoke = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const { error: mailErr } = await supabase.functions.invoke("send-notification-email", {
    headers: { Authorization: `Bearer ${serviceKeyForInvoke}` },
    body: {
      to: recipients,
      subject: buildQaEmailSubject(payload),
      html: buildQaEmailHtml(payload),
      tag: "qa",
      also_include_user_ids: uploaderUserId ? [uploaderUserId] : undefined,
    },
  });
  if (mailErr) {
    // supabase-js devuelve "Edge Function returned a non-2xx status code" sin el
    // motivo, que es inútil para diagnosticar (¿401 de credencial? ¿400 de
    // payload?). FunctionsHttpError trae la Response en .context → leemos el
    // body real y lo propagamos. Esto es lo que faltaba para encontrar el bug
    // del correo del 29-jul.
    let detail = "";
    try {
      const ctx = (mailErr as { context?: Response }).context;
      if (ctx && typeof ctx.text === "function") {
        detail = ` — status ${ctx.status}: ${(await ctx.text()).slice(0, 300)}`;
      }
    } catch { /* si no se puede leer el body, queda el mensaje genérico */ }
    throw new Error(
      `${(mailErr as Error).message ?? "send-notification-email falló"}${detail}`,
    );
  }
}

function jsonError(req: Request, error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

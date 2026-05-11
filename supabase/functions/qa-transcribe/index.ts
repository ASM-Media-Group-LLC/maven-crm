import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// qa-transcribe — relay de audio a ElevenLabs Scribe v1.
// Pattern path-based: el frontend YA subió el audio a qa-audio Storage
// (con su JWT, vía RLS), y nos pasa solamente { audio_path } en JSON.
// Esta función baja el archivo con service role, lo manda a ElevenLabs
// Scribe, y devuelve el transcript diarizado + audio metrics.
//
// Migrado de Groq Whisper → ElevenLabs Scribe para obtener:
//  - Diarización nativa de speakers (no post-hoc con LLM)
//  - Audio metrics (duración, palabras por speaker, etc.)
//  - Mayor precisión en español rioplatense
//
// Por qué path en vez de multipart upload directo:
//  - Body chico en el fetch browser→edge (KB en vez de MB) → no choca
//    con límites del gateway que se manifestaban como "Failed to fetch"
//    cuando el mp3 comprimido pesaba ~8MB.
//  - Storage está dimensionado para archivos grandes, Edge Functions no.
//  - El audio ya queda persistido para auditoría desde el primer momento.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ElevenLabs Scribe soporta archivos grandes (hasta 1GB), pero
// mantenemos un límite práctico para evitar timeouts en el edge function.
// El plan Pro de Supabase permite 400s de wall-clock por request — dejamos
// 350s para Scribe + ~30s de margen para download desde Storage + parse
// del response. Llamadas reales de QA suelen ser 30-60 min de audio y
// Scribe procesa a ~20s por minuto de audio (~10-20 min de proceso para
// las más largas), así que para audios MUY largos sigue sin alcanzar —
// pero 350s cubre el grueso de los uploads que estaban fallando con el
// AbortError en 120s.
const MAX_AUDIO_BYTES = 500 * 1024 * 1024; // 500MB
const SCRIBE_TIMEOUT_MS = 350_000; // 5m50s

interface TranscribeRequest {
  audio_path?: string;
  language?: string;
}

// ElevenLabs Scribe response shape
interface ScribeWord {
  text: string;
  start: number;
  end: number;
  type: "word" | "spacing" | "audio_event";
  speaker_id?: string;
}

interface ScribeResponse {
  language_code: string;
  language_probability: number;
  text: string;
  words: ScribeWord[];
}

// Parsed audio metrics from Scribe response
interface AudioMetrics {
  total_duration_s: number;
  speaker_count: number;
  speakers: Array<{
    id: string;
    label: string;
    word_count: number;
    estimated_duration_s: number;
    talk_ratio: number;
  }>;
  filler_words: Array<{ word: string; count: number; speaker_id: string }>;
  // Word-level timing data for live captions on playback. Solo el
  // texto + start/end + speaker_label de cada palabra reconocida; los
  // entries de tipo "spacing"/"audio_event" se filtran. Pesa más que
  // los agregados pero permite sincronizar texto con el audio en el
  // CallDetailPage. Calls viejas no tendrán este campo y el frontend
  // lo trata como "no hay captions disponibles".
  words?: Array<{
    text: string;
    start: number;
    end: number;
    speaker_label: string | null;
  }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      return jsonError("ELEVENLABS_API_KEY no configurada en los secrets de Supabase.", 500);
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonError("Supabase env (URL/service role) no configurado.", 500);
    }

    let body: TranscribeRequest;
    try {
      body = await req.json();
    } catch {
      return jsonError("JSON inválido. Esperado { audio_path, language? }.", 400);
    }

    const audioPath = body.audio_path?.trim();
    if (!audioPath) {
      return jsonError("Falta audio_path.", 400);
    }
    const lang = body.language?.trim() || "es";

    // Service role bypass-ea RLS — confiamos en el caller autenticado.
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { data: blob, error: dlErr } = await sb.storage
      .from("qa-audio")
      .download(audioPath);
    if (dlErr || !blob) {
      console.error("Storage download error", dlErr);
      return jsonError(
        `No se pudo bajar el audio de Storage: ${dlErr?.message ?? "desconocido"}`,
        502,
      );
    }
    if (blob.size === 0) {
      return jsonError("El archivo de audio en Storage está vacío.", 400);
    }
    if (blob.size > MAX_AUDIO_BYTES) {
      return jsonError(
        `Audio demasiado grande. Máx ${(MAX_AUDIO_BYTES / 1024 / 1024).toFixed(0)}MB.`,
        413,
      );
    }

    // Inferir nombre razonable del path para que Scribe vea la extensión.
    const inferredName = audioPath.split("/").pop() || "audio.mp3";

    // Normalizar content-type. ElevenLabs es estricto con MIME types.
    const ext = inferredName.split(".").pop()?.toLowerCase() ?? "mp3";
    const mimeMap: Record<string, string> = {
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      mp4: "audio/mp4",
      wav: "audio/wav",
      ogg: "audio/ogg",
      webm: "audio/webm",
      flac: "audio/flac",
      mpga: "audio/mpeg",
    };
    const contentType = mimeMap[ext] || "audio/mpeg";
    const audioFile = new File([blob], inferredName, { type: contentType });

    const form = new FormData();
    form.append("file", audioFile);
    form.append("model_id", "scribe_v1");
    // language_code mejora precisión. Para Maven el 99% es español.
    form.append("language_code", lang === "es" ? "spa" : lang);
    // Diarización: le pedimos que identifique speakers.
    form.append("diarize", "true");
    // Timestamps para métricas por speaker.
    form.append("timestamps_granularity", "word");

    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), SCRIBE_TIMEOUT_MS);
    let scribeRes: Response;
    try {
      scribeRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
        body: form,
        signal: ac.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      const aborted = (fetchErr as Error).name === "AbortError";
      console.error("ElevenLabs fetch failed", fetchErr);
      return jsonError(
        aborted
          ? `ElevenLabs Scribe tardó más de ${SCRIBE_TIMEOUT_MS / 1000}s. Probá de nuevo.`
          : `Error al contactar ElevenLabs: ${(fetchErr as Error).message}`,
        504,
      );
    }
    clearTimeout(timeoutId);

    if (!scribeRes.ok) {
      const status = scribeRes.status;
      const errText = await scribeRes.text().catch(() => "");
      console.error("ElevenLabs Scribe error", status, errText.slice(0, 500));
      if (status === 429) {
        return jsonError("ElevenLabs: rate limit. Probá en unos segundos.", 429);
      }
      if (status === 401) {
        return jsonError("ElevenLabs: API key inválida.", 402);
      }
      if (status === 422) {
        return jsonError("ElevenLabs: formato de audio no soportado.", 415);
      }
      return jsonError(`ElevenLabs Scribe error ${status}`, 502);
    }

    const scribeData = (await scribeRes.json()) as ScribeResponse;
    const rawText = (scribeData?.text ?? "").trim();
    if (!rawText) {
      return jsonError("Scribe devolvió transcripción vacía. ¿El audio tiene voz?", 502);
    }

    // Build diarized transcript from word-level data
    const { diarizedText, audioMetrics } = buildDiarizedOutput(scribeData);

    // Loggea uso para "Control de Gasto". Scribe se cobra por hora de
    // audio — total_duration_s ya está calculado y es la fuente correcta.
    if (audioMetrics.total_duration_s > 0) {
      void (async () => {
        try {
          const { logElevenLabsUsage } = await import("../_shared/usage.ts");
          await logElevenLabsUsage({
            operation: "qa-transcribe",
            model: "scribe_v1",
            audioSeconds: audioMetrics.total_duration_s,
            characters: rawText.length,
          });
        } catch (e) {
          console.warn("logElevenLabsUsage failed:", (e as Error).message);
        }
      })();
    }

    return new Response(
      JSON.stringify({
        ok: true,
        text: diarizedText || rawText,
        diarized: !!diarizedText,
        language: scribeData.language_code ?? lang,
        duration: audioMetrics.total_duration_s,
        audio_metrics: audioMetrics,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("qa-transcribe error:", e);
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

// Build diarized transcript from Scribe word-level output.
// Groups consecutive words from the same speaker into turns, producing:
//   "Hablante 1: texto...\n\nHablante 2: texto..."
// Also computes per-speaker metrics.
function buildDiarizedOutput(
  data: ScribeResponse,
): { diarizedText: string; audioMetrics: AudioMetrics } {
  const words = data.words ?? [];

  // Map speaker IDs → stable labels (Hablante 1, Hablante 2, etc.)
  const speakerIdMap = new Map<string, string>();
  let speakerCounter = 0;
  for (const w of words) {
    if (w.speaker_id && !speakerIdMap.has(w.speaker_id)) {
      speakerCounter++;
      speakerIdMap.set(w.speaker_id, `Hablante ${speakerCounter}`);
    }
  }

  // If no speaker info, return empty (caller will fall back to rawText)
  if (speakerIdMap.size === 0) {
    const lastWord = words[words.length - 1];
    const totalDuration = lastWord ? lastWord.end : 0;
    const wordsNoSpeaker = words
      .filter((w) => w.type === "word")
      .map((w) => ({
        text: w.text,
        start: w.start,
        end: w.end,
        speaker_label: null as string | null,
      }));
    return {
      diarizedText: "",
      audioMetrics: {
        total_duration_s: Math.round(totalDuration * 100) / 100,
        speaker_count: 0,
        speakers: [],
        filler_words: [],
        words: wordsNoSpeaker,
      },
    };
  }

  // Group words into speaker turns
  const turns: Array<{ speakerId: string; label: string; words: ScribeWord[] }> = [];
  let currentSpeaker = "";
  let currentTurn: ScribeWord[] = [];

  for (const w of words) {
    if (w.type === "audio_event") continue; // skip audio events
    const sid = w.speaker_id ?? currentSpeaker;
    if (sid !== currentSpeaker && w.type === "word") {
      if (currentTurn.length > 0 && currentSpeaker) {
        turns.push({
          speakerId: currentSpeaker,
          label: speakerIdMap.get(currentSpeaker) ?? "?",
          words: currentTurn,
        });
      }
      currentSpeaker = sid;
      currentTurn = [w];
    } else {
      currentTurn.push(w);
    }
  }
  if (currentTurn.length > 0 && currentSpeaker) {
    turns.push({
      speakerId: currentSpeaker,
      label: speakerIdMap.get(currentSpeaker) ?? "?",
      words: currentTurn,
    });
  }

  // Build diarized text
  const blocks = turns.map((t) => {
    const text = t.words
      .map((w) => w.text)
      .join("")
      .trim();
    return `${t.label}: ${text}`;
  });
  const diarizedText = blocks.join("\n\n");

  // Compute per-speaker metrics
  const speakerStats = new Map<
    string,
    { id: string; label: string; wordCount: number; durationS: number }
  >();
  for (const t of turns) {
    const existing = speakerStats.get(t.speakerId) ?? {
      id: t.speakerId,
      label: t.label,
      wordCount: 0,
      durationS: 0,
    };
    const turnWords = t.words.filter((w) => w.type === "word");
    existing.wordCount += turnWords.length;
    if (turnWords.length > 0) {
      const start = turnWords[0].start;
      const end = turnWords[turnWords.length - 1].end;
      existing.durationS += end - start;
    }
    speakerStats.set(t.speakerId, existing);
  }

  const lastWord = words[words.length - 1];
  const totalDuration = lastWord ? lastWord.end : 0;
  const totalSpeakerDuration = Array.from(speakerStats.values()).reduce(
    (sum, s) => sum + s.durationS,
    0,
  );

  const speakers = Array.from(speakerStats.values()).map((s) => ({
    id: s.id,
    label: s.label,
    word_count: s.wordCount,
    estimated_duration_s: Math.round(s.durationS * 100) / 100,
    talk_ratio:
      totalSpeakerDuration > 0
        ? Math.round((s.durationS / totalSpeakerDuration) * 100) / 100
        : 0,
  }));

  // Detect filler words in Spanish
  const FILLER_WORDS = new Set([
    "eh", "este", "mmm", "em", "o sea", "tipo", "como que",
    "bueno", "digamos", "nada", "claro", "dale",
  ]);
  const fillerCounts = new Map<string, Map<string, number>>();
  for (const w of words) {
    if (w.type !== "word") continue;
    const lower = w.text.toLowerCase().trim();
    if (FILLER_WORDS.has(lower) && w.speaker_id) {
      const byWord = fillerCounts.get(w.speaker_id) ?? new Map<string, number>();
      byWord.set(lower, (byWord.get(lower) ?? 0) + 1);
      fillerCounts.set(w.speaker_id, byWord);
    }
  }
  const filler_words: AudioMetrics["filler_words"] = [];
  for (const [speakerId, byWord] of fillerCounts.entries()) {
    for (const [word, count] of byWord.entries()) {
      if (count >= 3) {
        // Only report if significant (3+ occurrences)
        filler_words.push({ word, count, speaker_id: speakerId });
      }
    }
  }

  // Word-level timings para captions sincronizadas en el frontend.
  // Solo palabras reales (filtramos spacing y audio_event) con start/end
  // del Scribe + el label de speaker mapeado.
  const wordsForCaption = words
    .filter((w) => w.type === "word")
    .map((w) => ({
      text: w.text,
      start: w.start,
      end: w.end,
      speaker_label: w.speaker_id ? speakerIdMap.get(w.speaker_id) ?? null : null,
    }));

  return {
    diarizedText,
    audioMetrics: {
      total_duration_s: Math.round(totalDuration * 100) / 100,
      speaker_count: speakerIdMap.size,
      speakers,
      filler_words,
      words: wordsForCaption,
    },
  };
}

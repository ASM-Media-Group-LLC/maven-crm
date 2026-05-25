import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, logEvent, whatsappCors } from "../_shared/whatsapp.ts";
import { logGroqAudioUsage } from "../_shared/usage.ts";

// whatsapp-transcribe-audio — transcribe audios del grupo con Whisper.
//
// Provider routing (en orden de preferencia):
//   1. SELF-HOSTED Whisper en Dokploy si WHISPER_API_URL está seteado.
//      Endpoint OpenAI-compatible (faster-whisper-server). $0 marginal,
//      audios no salen de la infra del cliente. Ver infra/whisper/README.md
//   2. GROQ Whisper turbo como fallback automático si self-hosted falla.
//      $0.04/h. Ver https://console.groq.com/docs/speech-text
//
// Si solo querés usar self-hosted (sin fallback), setear:
//   WHISPER_FALLBACK_ENABLED=false
//
// Si no hay ninguno seteado, marcamos el audio como '[no transcribible:
// no providers configured]' y skipeamos.
//
// (qa-transcribe sigue con ElevenLabs Scribe porque ahí necesitamos
// diarización nativa para separar closer/model en llamadas largas.)
//
// Diferencia con qa-transcribe: el audio NO está en Storage interno —
// viene de una URL externa del provider de WhatsApp (Evolution API
// expone media_url firmados con TTL ~5 min). Por eso primero hacemos
// GET al media_url y después lo subimos a Whisper.
//
// Después de transcribir, dispara whatsapp-extract-commitments con el
// message_id — el extractor está armado para usar transcribed_text
// cuando es audio.

const SELF_HOSTED_URL = Deno.env.get("WHISPER_API_URL") ?? "";
const SELF_HOSTED_KEY = Deno.env.get("WHISPER_API_KEY") ?? "";
// Self-hosted (faster-whisper-server) usa el path HuggingFace del modelo.
// Default: el turbo CT2 que precargamos en el compose. Configurable.
const SELF_HOSTED_MODEL = Deno.env.get("WHISPER_API_MODEL") ??
  "deepdml/faster-whisper-large-v3-turbo-ct2";
const FALLBACK_ENABLED = (Deno.env.get("WHISPER_FALLBACK_ENABLED") ?? "true") !== "false";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
// Groq usa su propio alias del modelo (no acepta paths de HF).
const GROQ_MODEL = "whisper-large-v3-turbo";
const WHISPER_TIMEOUT_MS = 90_000; // 90s — en CPU un audio de 30s tarda ~60s
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB — WA limita a ~16MB
const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
// Modelo que usamos para loggear costo en api_usage_log cuando va via Groq.
// Mantenemos esto separado del nombre que mandamos en el form (puede
// diferir si en el futuro Groq cambia el alias).
const GROQ_BILLING_MODEL = "whisper-large-v3-turbo";

interface TranscribeRequest {
  message_id?: string;
  // Modo batch: procesa audios pending (catch-up).
  batch?: boolean;
  batch_size?: number;
}

// Response shape de Whisper con response_format='verbose_json'. Tanto
// Groq como faster-whisper-server siguen este mismo formato (es el
// estándar de OpenAI). Por eso podemos compartir el parser.
interface WhisperResponse {
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{ start: number; end: number; text: string }>;
}

type TranscribeResult =
  | { ok: true; text: string; duration_s: number; provider: "self_hosted" | "groq" }
  | { ok: false; error: string };

async function downloadAudio(url: string): Promise<Blob | { error: string }> {
  try {
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) return { error: `download status ${resp.status}` };
    const blob = await resp.blob();
    if (blob.size === 0) return { error: "empty_audio" };
    if (blob.size > MAX_AUDIO_BYTES) return { error: "audio_too_large" };
    return blob;
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// Construye el FormData para una request OpenAI-compatible de
// transcripción. El nombre del modelo difiere por provider:
//   - Groq:       "whisper-large-v3-turbo" (alias propio de Groq)
//   - self-hosted: path HuggingFace, ej. "deepdml/faster-whisper-large-v3-turbo-ct2"
//     (faster-whisper-server requiere el path completo para descargar/cargar)
function buildWhisperForm(blob: Blob, modelName: string): FormData {
  // WhatsApp audios suelen ser .ogg opus en Android y .m4a/.aac en iOS.
  // Pasamos un nombre con extensión coherente con el MIME.
  const mime = blob.type || "audio/ogg";
  const ext = mime.includes("mp4") || mime.includes("m4a")
    ? "m4a"
    : mime.includes("mpeg")
    ? "mp3"
    : mime.includes("wav")
    ? "wav"
    : "ogg";
  const audioFile = new File([blob], `wa_audio.${ext}`, { type: mime });

  const form = new FormData();
  form.append("file", audioFile);
  form.append("model", modelName);
  form.append("language", "es");
  form.append("response_format", "verbose_json");
  // temperature=0 = output determinístico, mejor para detectar
  // compromisos sin que Whisper "invente" palabras.
  form.append("temperature", "0");
  return form;
}

async function callWhisperEndpoint(
  url: string,
  authHeader: string | null,
  blob: Blob,
  modelName: string,
): Promise<{ text: string; duration_s: number } | { error: string }> {
  const form = buildWhisperForm(blob, modelName);
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), WHISPER_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {};
    if (authHeader) headers["Authorization"] = authHeader;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: form,
      signal: ac.signal,
    });
    clearTimeout(timeoutId);
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return { error: `whisper ${resp.status}: ${errText.slice(0, 200)}` };
    }
    const data = (await resp.json()) as WhisperResponse;
    const text = (data.text ?? "").trim();
    if (!text) return { error: "empty_transcript" };
    return { text, duration_s: data.duration ?? 0 };
  } catch (e) {
    clearTimeout(timeoutId);
    const aborted = (e as Error).name === "AbortError";
    return {
      error: aborted
        ? `whisper_timeout_${WHISPER_TIMEOUT_MS / 1000}s`
        : (e as Error).message,
    };
  }
}

// Transcribe usando self-hosted primero, fallback a Groq si falla.
// Devuelve qué provider terminó atendiendo, para el logging y telemetría.
async function transcribeWithFallback(blob: Blob): Promise<TranscribeResult> {
  // 1. Self-hosted (preferido si está configurado).
  if (SELF_HOSTED_URL) {
    const authHeader = SELF_HOSTED_KEY ? `Bearer ${SELF_HOSTED_KEY}` : null;
    const r = await callWhisperEndpoint(SELF_HOSTED_URL, authHeader, blob, SELF_HOSTED_MODEL);
    if (!("error" in r)) {
      return { ok: true, text: r.text, duration_s: r.duration_s, provider: "self_hosted" };
    }
    console.warn("self-hosted whisper failed:", r.error);
    if (!FALLBACK_ENABLED) {
      return { ok: false, error: `self_hosted: ${r.error}` };
    }
    // Cae a Groq.
  }

  // 2. Groq fallback.
  if (!GROQ_API_KEY) {
    return {
      ok: false,
      error: SELF_HOSTED_URL
        ? "self_hosted failed and GROQ_API_KEY not set as fallback"
        : "no_whisper_provider_configured",
    };
  }
  const r = await callWhisperEndpoint(GROQ_URL, `Bearer ${GROQ_API_KEY}`, blob, GROQ_MODEL);
  if ("error" in r) {
    return { ok: false, error: `groq: ${r.error}` };
  }
  return { ok: true, text: r.text, duration_s: r.duration_s, provider: "groq" };
}

function fireExtractCommitments(messageId: string): void {
  fetch(`${PROJECT_URL}/functions/v1/whatsapp-extract-commitments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cron-Token": CRON_TOKEN,
    },
    body: JSON.stringify({ message_id: messageId }),
  }).catch((e) => console.warn("fireExtractCommitments failed:", (e as Error).message));
}

function fireAgent(messageId: string, groupId: string): void {
  fetch(`${PROJECT_URL}/functions/v1/whatsapp-agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cron-Token": CRON_TOKEN,
    },
    body: JSON.stringify({ message_id: messageId, group_id: groupId, invoked_by: "audio_mention" }),
  }).catch((e) => console.warn("fireAgent failed:", (e as Error).message));
}

// Heurística para detectar menciones al bot en una transcripción de
// audio. En audio la gente no usa "@maven" — dice "maven", "el bot",
// "el agente", "preguntale a maven", etc. Hacemos match laxo.
function audioMentionsBot(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\bmaven bot\b/.test(lower) ||
    /\bel bot\b/.test(lower) ||
    /\bpreguntal[ea]\s+(a\s+)?maven/.test(lower) ||
    /\bmaven[,. ]/.test(lower) ||
    lower.startsWith("maven ")
  );
}

async function processMessage(messageId: string): Promise<{ ok: boolean; reason?: string }> {
  const sb = adminClient();

  const { data: msg, error: msgErr } = await sb
    .from("whatsapp_messages")
    .select("id, tenant_id, group_id, msg_type, media_url, transcribed_text, analyzed_at, is_from_bot")
    .eq("id", messageId)
    .single();

  if (msgErr || !msg) return { ok: false, reason: "message_not_found" };
  if (msg.msg_type !== "audio") return { ok: true, reason: "not_audio" };
  if (msg.transcribed_text) {
    // Ya transcripto. Solo aseguramos que el extractor corrió.
    if (!msg.analyzed_at) fireExtractCommitments(messageId);
    return { ok: true, reason: "already_transcribed" };
  }
  if (msg.is_from_bot) return { ok: true, reason: "skip_bot_audio" };
  if (!msg.media_url) {
    await sb
      .from("whatsapp_messages")
      .update({
        transcribed_text: "[audio sin URL]",
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", msg.id);
    return { ok: false, reason: "no_media_url" };
  }

  if (!SELF_HOSTED_URL && !GROQ_API_KEY) {
    await logEvent(sb, {
      tenantId: msg.tenant_id,
      groupId: msg.group_id,
      kind: "error",
      payload: {
        stage: "transcribe_audio",
        error: "no whisper provider configured (set WHISPER_API_URL or GROQ_API_KEY)",
        message_id: msg.id,
      },
    });
    return { ok: false, reason: "no_provider_configured" };
  }

  const blob = await downloadAudio(msg.media_url);
  if ("error" in blob) {
    await logEvent(sb, {
      tenantId: msg.tenant_id,
      groupId: msg.group_id,
      kind: "error",
      payload: { stage: "download_audio", error: blob.error, message_id: msg.id },
    });
    // Marcamos analyzed_at para no reintentar mil veces — el media_url
    // de Evolution caduca a los 5 min, y si no lo agarramos ahí lo
    // perdemos. Igual el extractor ve transcribed_text='[no transcribible]'
    // y skipea limpio.
    await sb
      .from("whatsapp_messages")
      .update({
        transcribed_text: `[no transcribible: ${blob.error}]`,
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", msg.id);
    return { ok: false, reason: blob.error };
  }

  const result = await transcribeWithFallback(blob);
  if (!result.ok) {
    await logEvent(sb, {
      tenantId: msg.tenant_id,
      groupId: msg.group_id,
      kind: "error",
      payload: { stage: "whisper", error: result.error, message_id: msg.id },
    });
    await sb
      .from("whatsapp_messages")
      .update({
        transcribed_text: `[transcripción falló: ${result.error}]`,
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", msg.id);
    return { ok: false, reason: result.error };
  }

  // Guardar transcripción y bumpear el extractor.
  await sb
    .from("whatsapp_messages")
    .update({ transcribed_text: result.text })
    .eq("id", msg.id);

  // Loggeamos costo solo si fue via Groq. Self-hosted no tiene costo
  // marginal medible — la infra ya está pagada.
  if (result.provider === "groq") {
    void logGroqAudioUsage({
      operation: "whatsapp-transcribe-audio",
      model: GROQ_BILLING_MODEL,
      audioSeconds: result.duration_s,
      characters: result.text.length,
      tenantId: msg.tenant_id,
      context: { message_id: msg.id, group_id: msg.group_id, provider: "groq" },
    });
  }

  await logEvent(sb, {
    tenantId: msg.tenant_id,
    groupId: msg.group_id,
    kind: "audio_transcribed",
    payload: {
      message_id: msg.id,
      duration_s: result.duration_s,
      char_count: result.text.length,
      provider: result.provider,
    },
  });

  // Disparar el extractor para que detecte compromisos en el texto
  // transcripto (el extractor lee transcribed_text cuando msg_type='audio').
  fireExtractCommitments(msg.id);

  // Si el audio menciona al bot, también invocamos al agente. El agente
  // validará bot_enabled antes de responder al grupo.
  if (audioMentionsBot(result.text)) {
    fireAgent(msg.id, msg.group_id);
  }

  return { ok: true };
}

async function processBatch(batchSize: number): Promise<number> {
  const sb = adminClient();
  const { data: pending } = await sb
    .from("whatsapp_messages")
    .select("id")
    .eq("msg_type", "audio")
    .is("transcribed_text", null)
    .eq("is_from_bot", false)
    .not("media_url", "is", null)
    // Solo audios recientes — los media_url de Evolution caducan rápido,
    // los viejos ya son irrecuperables.
    .gte("received_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order("received_at", { ascending: true })
    .limit(batchSize);

  if (!pending || pending.length === 0) return 0;

  let processed = 0;
  for (const row of pending) {
    try {
      const r = await processMessage(row.id);
      if (r.ok) processed += 1;
    } catch (e) {
      console.warn("processMessage failed:", row.id, (e as Error).message);
    }
  }
  return processed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: whatsappCors });
  }

  if (!authorizeCronOrJwt(req)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  let body: TranscribeRequest = {};
  try {
    body = (await req.json()) as TranscribeRequest;
  } catch {
    // OK — sin body = batch.
  }

  try {
    if (body.message_id) {
      const r = await processMessage(body.message_id);
      return new Response(JSON.stringify({ ok: r.ok, reason: r.reason }), {
        status: 200,
        headers: { ...whatsappCors, "Content-Type": "application/json" },
      });
    }

    if (body.batch !== false) {
      const processed = await processBatch(body.batch_size ?? 10);
      return new Response(JSON.stringify({ ok: true, processed }), {
        status: 200,
        headers: { ...whatsappCors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "no_action" }), {
      status: 400,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...whatsappCors, "Content-Type": "application/json" } },
    );
  }
});

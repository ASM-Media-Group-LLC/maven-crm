import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, logEvent, resolveMimeType, whatsappCors } from "../_shared/whatsapp.ts";
import { logGroqAudioUsage } from "../_shared/usage.ts";
import { buildGlossary, type Glossary } from "../_shared/whisper-glossary.ts";

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
  // Modo PRUEBA: re-transcribe el audio y DEVUELVE el texto, sin tocar la DB ni
  // disparar extractor/agente. Para A/B de calidad (p.ej. glosario) contra audios
  // reales ya guardados — un re-proceso normal haría que el bot conteste de nuevo.
  test_message_id?: string;
}

// Response shape de Whisper con response_format='verbose_json'. Tanto
// Groq como faster-whisper-server siguen este mismo formato (es el
// estándar de OpenAI). Por eso podemos compartir el parser.
interface WhisperResponse {
  text: string;
  language?: string;
  duration?: number;
  // verbose_json trae POR SEGMENTO las señales de confianza (formato OpenAI,
  // lo emiten igual speaches y Groq). Antes las descartábamos.
  segments?: Array<{
    start: number;
    end: number;
    text: string;
    avg_logprob?: number;
    no_speech_prob?: number;
    compression_ratio?: number;
  }>;
}

type TranscribeResult =
  | { ok: true; text: string; duration_s: number; provider: "self_hosted" | "groq"; dudosa: boolean; confianza: string }
  | { ok: false; error: string };

// ¿La transcripción es confiable? Whisper lo venía diciendo y no lo mirábamos.
// Umbrales conservadores (habla clara en es ≈ logprob -0.2..-0.5):
//   · avg_logprob ponderado por duración < -0.85  → decodificó adivinando
//   · compression_ratio > 2.4                     → se metió en un loop de repetición
//   · no_speech_prob alto en todos los segmentos  → probablemente no era voz
function evaluarConfianza(data: WhisperResponse): { dudosa: boolean; detalle: string } {
  const segs = (data.segments ?? []).filter((s) => Number.isFinite(s?.avg_logprob));
  if (!segs.length) return { dudosa: false, detalle: "sin señales" };
  let dur = 0, acc = 0, maxCr = 0, minNs = 1;
  for (const s of segs) {
    const d = Math.max(0.1, (s.end ?? 0) - (s.start ?? 0));
    dur += d; acc += (s.avg_logprob ?? 0) * d;
    maxCr = Math.max(maxCr, s.compression_ratio ?? 0);
    minNs = Math.min(minNs, s.no_speech_prob ?? 0);
  }
  const logprob = acc / (dur || 1);
  const dudosa = logprob < -0.85 || maxCr > 2.4 || minNs > 0.6;
  return { dudosa, detalle: `logprob=${logprob.toFixed(2)} cr=${maxCr.toFixed(1)} ns=${minNs.toFixed(2)}` };
}

const GATEWAY_URL = Deno.env.get("WHATSAPP_EVOLUTION_URL") ?? "";
const GATEWAY_KEY = Deno.env.get("WHATSAPP_EVOLUTION_API_KEY") ?? "";

// Baja un audio del WhatsApp media usando el gateway (que aplica
// Baileys downloadContentFromMessage para desencriptar el .enc).
// Espera que el `raw` del mensaje contenga el sub-mensaje
// `audioMessage` con mediaKey + url/directPath + mimetype.
async function downloadAudioViaGateway(rawData: unknown): Promise<Blob | { error: string }> {
  if (!GATEWAY_URL || !GATEWAY_KEY) {
    return { error: "gateway_not_configured" };
  }
  // El raw que guardamos es { data: <waMessage>, event, instance }.
  // El audioMessage está en data.message.audioMessage.
  const r = rawData as { data?: { message?: { audioMessage?: unknown } } } | null;
  const audioMessage = r?.data?.message?.audioMessage;
  if (!audioMessage) return { error: "no_audio_message_in_raw" };

  try {
    const resp = await fetch(`${GATEWAY_URL.replace(/\/$/, "")}/media/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": GATEWAY_KEY,
      },
      body: JSON.stringify({ type: "audio", message: audioMessage }),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      return { error: `gateway ${resp.status}: ${txt.slice(0, 200)}` };
    }
    const buf = await resp.arrayBuffer();
    if (buf.byteLength === 0) return { error: "empty_audio_from_gateway" };
    if (buf.byteLength > MAX_AUDIO_BYTES) return { error: "audio_too_large" };
    const bytes = new Uint8Array(buf);
    const mime = resp.headers.get("content-type") ?? "audio/ogg";
    return new Blob([bytes], { type: mime });
  } catch (e) {
    return { error: (e as Error).message };
  }
}

async function downloadAudio(url: string): Promise<Blob | { error: string }> {
  try {
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) return { error: `download status ${resp.status}` };
    // Leemos primero como ArrayBuffer para poder sniffear el MIME real.
    // Evolution API devuelve application/octet-stream, lo que rompe Groq
    // Whisper ("could not process file - is it a valid media file?").
    const buf = await resp.arrayBuffer();
    if (buf.byteLength === 0) return { error: "empty_audio" };
    if (buf.byteLength > MAX_AUDIO_BYTES) return { error: "audio_too_large" };
    const bytes = new Uint8Array(buf);
    const mime = resolveMimeType(resp.headers.get("content-type"), bytes, "audio/ogg");
    return new Blob([bytes], { type: mime });
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// Construye el FormData para una request OpenAI-compatible de
// transcripción. El nombre del modelo difiere por provider:
//   - Groq:       "whisper-large-v3-turbo" (alias propio de Groq)
//   - self-hosted: path HuggingFace, ej. "deepdml/faster-whisper-large-v3-turbo-ct2"
//     (faster-whisper-server requiere el path completo para descargar/cargar)
function buildWhisperForm(blob: Blob, modelName: string, glossary: Glossary, hotwords: boolean): FormData {
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
  // Glosario (ver _shared/whisper-glossary.ts): sin él, Whisper escribía "shit"
  // por sheet, "hop stop" por Hubstaff y "calorina" por Carolina — y sobre esas
  // palabras el bot decide. `prompt` lo honran ambos providers.
  if (glossary.prompt) form.append("prompt", glossary.prompt);
  // `hotwords` es de speaches (self-host): a diferencia del prompt, sigue activo
  // en TODAS las ventanas de un audio largo. Groq no lo acepta → nunca se manda ahí.
  // (El server viejo lo ignora sin quejarse hasta que se migre el contenedor.)
  if (hotwords && glossary.hotwords) form.append("hotwords", glossary.hotwords);
  return form;
}

async function callWhisperEndpoint(
  url: string,
  authHeader: string | null,
  blob: Blob,
  modelName: string,
  glossary: Glossary,
  hotwords: boolean,
): Promise<{ text: string; duration_s: number; dudosa: boolean; confianza: string } | { error: string }> {
  const form = buildWhisperForm(blob, modelName, glossary, hotwords);
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
    const conf = evaluarConfianza(data);
    return { text, duration_s: data.duration ?? 0, dudosa: conf.dudosa, confianza: conf.detalle };
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
async function transcribeWithFallback(blob: Blob, glossary: Glossary): Promise<TranscribeResult> {
  // 1. Self-hosted (preferido si está configurado).
  if (SELF_HOSTED_URL) {
    const authHeader = SELF_HOSTED_KEY ? `Bearer ${SELF_HOSTED_KEY}` : null;
    const r = await callWhisperEndpoint(SELF_HOSTED_URL, authHeader, blob, SELF_HOSTED_MODEL, glossary, true);
    if (!("error" in r)) {
      return { ok: true, text: r.text, duration_s: r.duration_s, provider: "self_hosted", dudosa: r.dudosa, confianza: r.confianza };
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
  const r = await callWhisperEndpoint(GROQ_URL, `Bearer ${GROQ_API_KEY}`, blob, GROQ_MODEL, glossary, false);
  if ("error" in r) {
    return { ok: false, error: `groq: ${r.error}` };
  }
  return { ok: true, text: r.text, duration_s: r.duration_s, provider: "groq", dudosa: r.dudosa, confianza: r.confianza };
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

function fireAgent(messageId: string, groupId: string, reason: "audio_mention" | "auto"): void {
  fetch(`${PROJECT_URL}/functions/v1/whatsapp-agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cron-Token": CRON_TOKEN,
    },
    body: JSON.stringify({ message_id: messageId, group_id: groupId, invoked_by: reason }),
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
    .select("id, tenant_id, group_id, msg_type, media_url, transcribed_text, analyzed_at, is_from_bot, raw")
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

  // Estrategia de descarga:
  //   1. Si tenemos `raw` con audioMessage (típico para gateway Baileys),
  //      usar el endpoint /media/download del gateway que aplica
  //      downloadContentFromMessage para desencriptar el .enc.
  //   2. Fallback: GET directo al media_url (audios viejos de Evolution
  //      que ya venían desencriptados, o gateway no configurado).
  let blob: Blob | { error: string };
  const gatewayAttempt = await downloadAudioViaGateway(msg.raw);
  if (!("error" in gatewayAttempt)) {
    blob = gatewayAttempt;
  } else {
    console.warn(`gateway download failed (${gatewayAttempt.error}), trying direct media_url`);
    blob = await downloadAudio(msg.media_url);
  }
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

  const glossary = await buildGlossary(sb, msg.group_id);
  const result = await transcribeWithFallback(blob, glossary);
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

  // Guardar transcripción y bumpear el extractor. Si Whisper mismo dice que
  // decodificó adivinando, el texto queda MARCADO: Clari (y quien lea el chat)
  // ve "[transcripción dudosa]" y puede repreguntar en vez de actuar en firme
  // sobre basura — de ahí salieron los malentendidos con Álvaro del 31/07.
  const textoFinal = (result.dudosa ? "[transcripción dudosa] " : "") + result.text;
  await sb
    .from("whatsapp_messages")
    .update({ transcribed_text: textoFinal })
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
      dudosa: result.dudosa,
      confianza: result.confianza,
    },
  });

  // Disparar el extractor para que detecte compromisos en el texto
  // transcripto (el extractor lee transcribed_text cuando msg_type='audio').
  fireExtractCommitments(msg.id);

  // Trigger del agent. Depende del bot_mode del grupo:
  //   - mention: solo si la transcripción menciona "maven", "el bot", etc
  //   - always:  siempre que el audio tenga contenido sustantivo (>4 chars)
  //   - off:     nunca
  const { data: group } = await sb
    .from("whatsapp_groups")
    .select("bot_enabled, bot_mode, is_direct, wa_bots(department)")
    .eq("id", msg.group_id)
    .maybeSingle();
  const groupWaBots = (group as any)?.wa_bots;
  const groupDept = (Array.isArray(groupWaBots) ? groupWaBots[0]?.department : groupWaBots?.department) ?? null;
  const supervisorBot = groupDept === "manager";
  // DMs 1:1 (pseudo-grupos is_direct): el remitente está whitelisted y escribió
  // directo al bot → siempre responde, sin gate de horario (como los supervisores).
  const isDirectDm = (group as any)?.is_direct === true;
  const alwaysFire = supervisorBot || isDirectDm;
  if (group?.bot_enabled && group?.bot_mode !== "off") {
    if (audioMentionsBot(result.text)) {
      fireAgent(msg.id, msg.group_id, "audio_mention");
    } else if (group.bot_mode === "always" && result.text.trim().length >= 4) {
      // Supervisores (managers) y DMs se invocan 24/7 (sin gate de horario); el
      // prompt decide si el mensaje va dirigido al bot. El resto sigue el gate
      // por horario laboral — mismo criterio que el ingest de texto.
      if (alwaysFire) {
        fireAgent(msg.id, msg.group_id, "auto");
      } else {
        const { data: inHours } = await sb.rpc("whatsapp_group_in_business_hours", { p_group_id: msg.group_id });
        if (inHours) fireAgent(msg.id, msg.group_id, "auto");
      }
    }
  }

  return { ok: true };
}

// Re-transcribe SIN efectos: ni update, ni extractor, ni agente. Devuelve el
// texto nuevo junto al guardado, para comparar al lado del otro.
async function testTranscribe(messageId: string): Promise<Record<string, unknown>> {
  const sb = adminClient();
  const { data: msg } = await sb
    .from("whatsapp_messages")
    .select("id, group_id, msg_type, media_url, transcribed_text, raw")
    .eq("id", messageId)
    .single();
  if (!msg) return { ok: false, error: "message_not_found" };
  if (msg.msg_type !== "audio") return { ok: false, error: "not_audio" };

  let blob: Blob | { error: string } = await downloadAudioViaGateway(msg.raw);
  if ("error" in blob && msg.media_url) blob = await downloadAudio(msg.media_url);
  if ("error" in blob) return { ok: false, error: `download: ${blob.error}` };

  const glossary = await buildGlossary(sb, msg.group_id);
  const result = await transcribeWithFallback(blob, glossary);
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    provider: result.provider,
    guardado: msg.transcribed_text,
    nuevo: result.text,
    dudosa: result.dudosa,
    confianza: result.confianza,
    glossary_usado: glossary.prompt.slice(0, 300),
  };
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
    if (body.test_message_id) {
      const r = await testTranscribe(body.test_message_id);
      return new Response(JSON.stringify(r), {
        status: 200,
        headers: { ...whatsappCors, "Content-Type": "application/json" },
      });
    }
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

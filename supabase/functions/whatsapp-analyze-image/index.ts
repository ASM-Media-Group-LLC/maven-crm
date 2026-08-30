import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, hasBotMention, logEvent, resolveMimeType, whatsappCors } from "../_shared/whatsapp.ts";
import { logGeminiUsage } from "../_shared/usage.ts";

// whatsapp-analyze-image — analiza imágenes del grupo con un LLM con
// vision. Reconoce:
//   - Texto en pantalla (OCR de screenshots de WhatsApp, IG DMs, etc)
//   - Descripción visual ("captura de bandeja de spam de IG")
//   - Menciones a personas/cuentas dentro de la imagen
//   - Indicios de red flags (perfil restringido, error message, etc)
//
// El output se guarda en whatsapp_messages.transcribed_text como JSON
// estructurado. El extractor de compromisos lo lee igual que el texto
// transcripto de un audio.
//
// Trigger: whatsapp-ingest dispara esta function async cuando llega un
// mensaje con msg_type='image' y media_url presente.
//
// Después dispara whatsapp-extract-commitments para que detecte
// compromisos en cualquier texto OCR'd o caption + descripción.
//
// LLM via OpenRouter — unificado con Promolog para tener un solo
// proveedor (un billing, un cap de gasto, resiliencia multi-model).
// Default model: google/gemini-2.5-flash. Costo ~$0.00017 por imagen,
// 100 imágenes/día ≈ $0.50/mes (incluido el ~5% de overhead de OR).
// Si quieres cambiar el modelo (claude-haiku, gpt-4o-mini, etc.), basta
// con cambiar PROMOLOG_LLM_MODEL — no toca código.

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
// Reusamos PROMOLOG_LLM_MODEL para que un solo override controle toda la
// stack vision de Maven (WhatsApp + Promolog). Si se necesita modelo
// distinto por módulo en el futuro, separamos en var dedicada.
const LLM_MODEL = Deno.env.get("WHATSAPP_LLM_MODEL")
  ?? Deno.env.get("PROMOLOG_LLM_MODEL")
  ?? "google/gemini-2.5-flash";
const LLM_TIMEOUT_MS = 30_000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB — WA limita imágenes a ~16MB
const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
// Gateway custom que aplica Baileys downloadContentFromMessage para
// desencriptar los .enc de WhatsApp. Mismo patrón que whatsapp-transcribe-audio.
const GATEWAY_URL = Deno.env.get("WHATSAPP_EVOLUTION_URL") ?? "";
const GATEWAY_KEY = Deno.env.get("WHATSAPP_EVOLUTION_API_KEY") ?? "";

const VISION_PROMPT = `Eres un analista de imágenes para un equipo de ventas de agencias de OnlyFans. Te van a pasar una imagen que alguien compartió en un grupo de WhatsApp del equipo. Tu tarea: extraer toda la info útil de la imagen para que el bot que vive en el grupo pueda detectar compromisos, responder preguntas y trackear casos.

Devuelve JSON estricto con esta forma:

{
  "description": "qué es la imagen, en 1-2 oraciones (ej. 'screenshot de Instagram mostrando bandeja de mensajes no leídos del perfil restringido @mariiaroz')",
  "ocr_text": "todo el texto que aparece en la imagen, transcripto literal. Si no hay texto, string vacío.",
  "category": "screenshot_ig" | "screenshot_wa" | "screenshot_of" | "photo_real" | "meme" | "document" | "chart" | "other",
  "contains_restriction": true | false,
  "contains_payment_proof": true | false,
  "mentions": [{"name": "nombre o handle mencionado", "kind": "person_name | ig_handle | wa_phone | of_handle | other"}],
  "red_flags": ["máx 3 items, ej. 'cuenta restringida', 'sin foto perfil', 'baja interacción' — solo cuando son ciertos y observables"]
}

REGLAS:
- Si el texto es OCR, transcríbelo TAL CUAL aparece, sin corregir typos. Preserva emojis y ortografía.
- NO inventes red flags ni mentions que no estén visibles claramente.
- Si la imagen está restringida (IG dice "esta cuenta es privada" o similar), contains_restriction=true.
- Si hay comprobante de transferencia/factura/payment, contains_payment_proof=true.
- description es BREVE — máx 2 oraciones. No describas color de fondo ni cosas irrelevantes.

OUTPUT: solo JSON. Sin markdown, sin explicaciones.`;

interface AnalyzeRequest {
  message_id?: string;
  batch?: boolean;
  batch_size?: number;
}

interface VisionAnalysis {
  description: string;
  ocr_text: string;
  category: string;
  contains_restriction: boolean;
  contains_payment_proof: boolean;
  mentions: Array<{ name: string; kind: string }>;
  red_flags: string[];
}

// Baja una imagen del WhatsApp media usando el gateway (que aplica
// Baileys downloadContentFromMessage para desencriptar el .enc).
// Espera que el `raw` del mensaje contenga el sub-mensaje `imageMessage`
// con mediaKey + url/directPath + mimetype.
//
// IMPORTANTE: este es el path principal. El fetch directo a mmg.whatsapp.net
// devuelve bytes ENCRIPTADOS (content-disposition: attachment;filename=file.enc)
// que ni Gemini ni ningún LLM pueden procesar. Sin el gateway, el análisis
// siempre falla con "Unable to process input image / INVALID_ARGUMENT".
async function downloadImageViaGateway(
  rawData: unknown,
): Promise<{ data: Uint8Array; mime: string } | { error: string }> {
  if (!GATEWAY_URL || !GATEWAY_KEY) {
    return { error: "gateway_not_configured" };
  }
  // El raw que guardamos es { data: <waMessage>, event, instance }.
  // El imageMessage está en data.message.imageMessage. Algunas variantes
  // de Evolution lo ponen directamente en message.imageMessage.
  const r = rawData as
    | { data?: { message?: { imageMessage?: unknown } }; message?: { imageMessage?: unknown } }
    | null;
  const imageMessage = r?.data?.message?.imageMessage ?? r?.message?.imageMessage;
  if (!imageMessage) return { error: "no_image_message_in_raw" };

  try {
    const resp = await fetch(`${GATEWAY_URL.replace(/\/$/, "")}/media/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": GATEWAY_KEY,
      },
      body: JSON.stringify({ type: "image", message: imageMessage }),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      return { error: `gateway ${resp.status}: ${txt.slice(0, 200)}` };
    }
    const buf = await resp.arrayBuffer();
    if (buf.byteLength === 0) return { error: "empty_image_from_gateway" };
    if (buf.byteLength > MAX_IMAGE_BYTES) return { error: "image_too_large" };
    const data = new Uint8Array(buf);
    // El gateway devuelve el MIME real (image/jpeg, image/png, etc) en
    // content-type. Si no lo manda, sniffeamos por magic bytes.
    const mime = resolveMimeType(resp.headers.get("content-type"), data, "image/jpeg");
    return { data, mime };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// Fallback: descarga directa desde la URL pública. SOLO funciona para
// imágenes ya desencriptadas (ej. media compartido por otros bots o
// pruebas con URLs limpias). Para mensajes reales de WhatsApp, siempre
// va a fallar porque devuelve .enc. Lo dejamos como red de seguridad.
async function downloadImage(url: string): Promise<{ data: Uint8Array; mime: string } | { error: string }> {
  try {
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) return { error: `download status ${resp.status}` };
    const buf = await resp.arrayBuffer();
    if (buf.byteLength === 0) return { error: "empty_image" };
    if (buf.byteLength > MAX_IMAGE_BYTES) return { error: "image_too_large" };
    const data = new Uint8Array(buf);
    // Evolution API devuelve application/octet-stream para todas las medias.
    // Sniffeamos los magic bytes para obtener el MIME real — Gemini Vision
    // rechaza octet-stream con "Unsupported MIME type".
    const mime = resolveMimeType(resp.headers.get("content-type"), data, "image/jpeg");
    return { data, mime };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  // Deno permite Buffer-like via btoa() pero hay que armar el string.
  // Usamos un loop con chunks para no chocar con stack size en archivos grandes.
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// callLlmVision — llama OpenRouter (OpenAI-compatible API) con el modelo
// configurado. La imagen se manda como data URI base64. OpenRouter rutea
// al provider correspondiente (Google AI Studio para gemini, Anthropic
// para claude, etc.) y devuelve la respuesta uniformada.
//
// max_tokens=2048 (era 1024) — con el prompt extendido + JSON estricto,
// había casos donde la respuesta se cortaba a la mitad y rompía el
// parser. El costo extra es despreciable.
async function callLlmVision(
  imageBytes: Uint8Array,
  mime: string,
  contextHint: string | null,
  modelOverride?: string,
): Promise<{ analysis: VisionAnalysis; usage: Record<string, number> } | { error: string }> {
  const dataUri = `data:${mime};base64,${bytesToBase64(imageBytes)}`;
  const promptText = contextHint
    ? `Contexto: el mensaje que acompaña esta imagen dice: "${contextHint}"\n\n${VISION_PROMPT}`
    : VISION_PROMPT;

  const body = {
    model: modelOverride ?? LLM_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: promptText },
          { type: "image_url", image_url: { url: dataUri } },
        ],
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 2048,
  };

  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        // Recomendados por OpenRouter (no obligatorios) — aparecen en
        // su dashboard de uso para que el equipo identifique de dónde
        // viene cada call.
        "HTTP-Referer": "https://maven.asmtech.me",
        "X-Title": "Maven WhatsApp Image Analyzer",
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return { error: `openrouter ${resp.status}: ${errText.slice(0, 300)}` };
    }

    const data = await resp.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) return { error: "empty_response" };

    let analysis: VisionAnalysis;
    try {
      const parsed = JSON.parse(text);
      analysis = {
        description: String(parsed.description ?? ""),
        ocr_text: String(parsed.ocr_text ?? ""),
        category: String(parsed.category ?? "other"),
        contains_restriction: parsed.contains_restriction === true,
        contains_payment_proof: parsed.contains_payment_proof === true,
        mentions: Array.isArray(parsed.mentions) ? parsed.mentions : [],
        red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags : [],
      };
    } catch (e) {
      return { error: `json_parse: ${(e as Error).message}` };
    }

    const usage = {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
    };

    return { analysis, usage };
  } catch (e) {
    clearTimeout(timeoutId);
    const aborted = (e as Error).name === "AbortError";
    return {
      error: aborted
        ? `llm_timeout_${LLM_TIMEOUT_MS / 1000}s`
        : (e as Error).message,
    };
  }
}

// Build el texto que se guarda en transcribed_text. Combina description
// y ocr_text para que el extractor de compromisos pueda detectar
// fácilmente si hay un compromiso visible en la imagen ("mañana pago"
// escrito en una captura de WA, por ejemplo).
function buildExtractedText(a: VisionAnalysis): string {
  const parts: string[] = [];
  if (a.description) parts.push(a.description);
  if (a.ocr_text) parts.push(`Texto en pantalla:\n${a.ocr_text}`);
  if (a.contains_restriction) parts.push("⚠️ La imagen muestra una cuenta/perfil restringido.");
  if (a.contains_payment_proof) parts.push("💰 La imagen contiene un comprobante de pago.");
  if (a.mentions.length > 0) {
    parts.push(`Menciones detectadas: ${a.mentions.map((m) => `${m.name} (${m.kind})`).join(", ")}`);
  }
  return parts.join("\n\n");
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

async function processMessage(messageId: string): Promise<{ ok: boolean; reason?: string }> {
  const sb = adminClient();

  const { data: msg, error: msgErr } = await sb
    .from("whatsapp_messages")
    .select("id, tenant_id, group_id, msg_type, body, media_url, transcribed_text, analyzed_at, is_from_bot, raw")
    .eq("id", messageId)
    .single();

  if (msgErr || !msg) return { ok: false, reason: "message_not_found" };
  if (msg.msg_type !== "image" && msg.msg_type !== "video") return { ok: true, reason: "not_image" };
  if (msg.transcribed_text) {
    if (!msg.analyzed_at) fireExtractCommitments(messageId);
    return { ok: true, reason: "already_analyzed" };
  }
  if (msg.is_from_bot) return { ok: true, reason: "skip_bot_image" };
  if (!msg.media_url) {
    await sb
      .from("whatsapp_messages")
      .update({
        transcribed_text: "[imagen sin URL]",
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", msg.id);
    await fireAgentPeseAlFallo(sb, msg, "no_media_url");
    return { ok: false, reason: "no_media_url" };
  }
  if (!OPENROUTER_API_KEY) {
    await logEvent(sb, {
      tenantId: msg.tenant_id,
      groupId: msg.group_id,
      kind: "error",
      payload: { stage: "analyze_image", error: "OPENROUTER_API_KEY missing", message_id: msg.id },
    });
    return { ok: false, reason: "openrouter_not_configured" };
  }

  // Estrategia (igual que whatsapp-transcribe-audio):
  //   1. Si tenemos `raw` con imageMessage, usar el endpoint /media/download
  //      del gateway que aplica Baileys decrypt → bytes plain de la imagen.
  //   2. Fallback: fetch directo a la URL (sirve si la URL ya es de un
  //      media desencriptado, o si el gateway no está configurado).
  //      Para WhatsApp real esto SIEMPRE falla porque devuelve .enc.
  let downloaded: { data: Uint8Array; mime: string } | { error: string };
  const esVideo = msg.msg_type === "video";
  if (esVideo) {
    // VIDEOS (04/08): sin ffmpeg en el edge no se extraen frames — v1 analiza
    // la PORTADA (jpegThumbnail que WhatsApp adjunta en el raw). Mejor un
    // fotograma real que un "[video]" ciego (las pruebas en video de Lizeth
    // del 03/08 pasaron sin leerse).
    const rv = msg.raw as
      | { data?: { message?: { videoMessage?: { jpegThumbnail?: string } } }; message?: { videoMessage?: { jpegThumbnail?: string } } }
      | null;
    const thumb = rv?.data?.message?.videoMessage?.jpegThumbnail ?? rv?.message?.videoMessage?.jpegThumbnail;
    if (!thumb) {
      await sb.from("whatsapp_messages").update({
        transcribed_text: "[video sin análisis: sin miniatura en el mensaje]",
        analyzed_at: new Date().toISOString(),
      }).eq("id", msg.id);
      await fireAgentPeseAlFallo(sb, msg, "video_sin_thumbnail");
      return { ok: false, reason: "video_sin_thumbnail" };
    }
    try {
      downloaded = { data: Uint8Array.from(atob(thumb), (c) => c.charCodeAt(0)), mime: "image/jpeg" };
    } catch {
      await sb.from("whatsapp_messages").update({
        transcribed_text: "[video sin análisis: miniatura ilegible]",
        analyzed_at: new Date().toISOString(),
      }).eq("id", msg.id);
      await fireAgentPeseAlFallo(sb, msg, "video_thumbnail_invalida");
      return { ok: false, reason: "video_thumbnail_invalida" };
    }
  } else {
    downloaded = await downloadImageViaGateway(msg.raw);
    if ("error" in downloaded) {
      console.warn(`gateway download failed (${downloaded.error}), trying direct media_url`);
      downloaded = await downloadImage(msg.media_url);
    }
  }
  if ("error" in downloaded) {
    await logEvent(sb, {
      tenantId: msg.tenant_id,
      groupId: msg.group_id,
      kind: "error",
      payload: { stage: "download_image", error: downloaded.error, message_id: msg.id },
    });
    await sb
      .from("whatsapp_messages")
      .update({
        transcribed_text: `[imagen no recuperable: ${downloaded.error}]`,
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", msg.id);
    await fireAgentPeseAlFallo(sb, msg, `download: ${downloaded.error}`.slice(0, 120));
    return { ok: false, reason: downloaded.error };
  }

  // Si la imagen tenía caption, lo pasamos a Gemini como hint para que
  // priorice extraer info relevante a ese contexto.
  const contextHint = msg.body && msg.body !== "[imagen]" ? msg.body : null;

  let result = await callLlmVision(downloaded.data, downloaded.mime, contextHint);
  // Gemini a veces rechaza la imagen entera ("Unable to process input image",
  // 400) — pasó el 03/08 con las capturas de Lizeth: el bot quedó ciego y
  // encima respondió como si la hubiera visto. Ante un 4xx del provider se
  // reintenta UNA vez con un modelo de visión distinto antes de rendirse.
  if ("error" in result && /openrouter 4\d\d/.test(result.error)) {
    console.warn("vision primario rechazó la imagen, reintento con fallback:", result.error.slice(0, 120));
    result = await callLlmVision(downloaded.data, downloaded.mime, contextHint, "openai/gpt-4o-mini");
  }
  if ("error" in result) {
    await logEvent(sb, {
      tenantId: msg.tenant_id,
      groupId: msg.group_id,
      kind: "error",
      payload: { stage: "llm", error: result.error, message_id: msg.id },
    });
    await sb
      .from("whatsapp_messages")
      .update({
        transcribed_text: `[análisis falló: ${result.error}]`,
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", msg.id);
    await fireAgentPeseAlFallo(sb, msg, `llm: ${result.error}`.slice(0, 120));
    return { ok: false, reason: result.error };
  }

  // Los videos se analizan por su PORTADA: el prefijo lo deja claro para que
  // nadie (ni el bot) crea que se vio el video completo.
  const extractedText = (esVideo ? "[video — análisis de la portada] " : "") + buildExtractedText(result.analysis);

  // Guardar el texto extraído + el análisis JSON completo en analysis.
  await sb
    .from("whatsapp_messages")
    .update({
      transcribed_text: extractedText,
      analysis: { vision: result.analysis },
    })
    .eq("id", msg.id);

  // Log cost en api_usage_log. Mantenemos logGeminiUsage como nombre
  // del helper porque la tabla `api_usage_log` ya tiene historial bajo
  // "gemini" — pero el model field refleja el modelo real (que ahora
  // puede ser Gemini o cualquier otro via OpenRouter).
  void logGeminiUsage({
    operation: "whatsapp-analyze-image",
    model: LLM_MODEL,
    inputTokens: result.usage.input_tokens,
    outputTokens: result.usage.output_tokens,
    tenantId: msg.tenant_id,
    context: { message_id: msg.id, group_id: msg.group_id, category: result.analysis.category, provider: "openrouter" },
  });

  await logEvent(sb, {
    tenantId: msg.tenant_id,
    groupId: msg.group_id,
    kind: "image_analyzed",
    payload: {
      message_id: msg.id,
      category: result.analysis.category,
      has_ocr: result.analysis.ocr_text.length > 0,
      mentions: result.analysis.mentions.length,
      red_flags: result.analysis.red_flags.length,
    },
  });

  // Disparar el extractor con el texto extraído.
  fireExtractCommitments(msg.id);

  // Trigger del agent. Depende del bot_mode del grupo:
  //   - mention: solo si el OCR/caption tiene mención explícita al bot
  //   - always:  siempre que el análisis haya extraído contenido útil
  //   - off:     nunca
  const { data: group } = await sb
    .from("whatsapp_groups")
    .select("bot_enabled, bot_mode")
    .eq("id", msg.group_id)
    .maybeSingle();
  if (group?.bot_enabled && group?.bot_mode !== "off") {
    // ⚠️ La mención va en el CAPTION del mensaje (msg.body), no adentro de la imagen,
    // y WhatsApp la serializa como el LID numérico ("@140716701401153"), no como
    // "@maven". Antes acá solo se miraba el OCR y solo esos literales → en un grupo
    // en modo `mention` NINGUNA imagen disparaba al agente. Costó real: el 30/07
    // Daniel posteó su primer número obtenido del día como screenshot y el bot nunca
    // fue invocado. Ahora se usa el detector compartido sobre caption + OCR.
    if (hasBotMention(msg.body, result.analysis.ocr_text)) {
      fireAgent(msg.id, msg.group_id, "image_mention");
    } else if (group.bot_mode === "always" && extractedText.trim().length >= 4) {
      const { data: inHours } = await sb.rpc("whatsapp_group_in_business_hours", { p_group_id: msg.group_id });
      if (inHours) fireAgent(msg.id, msg.group_id, "auto");
    }
  }

  return { ok: true };
}

function fireAgent(messageId: string, groupId: string, reason: "image_mention" | "auto"): void {
  fetch(`${PROJECT_URL}/functions/v1/whatsapp-agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cron-Token": Deno.env.get("CRON_INTERNAL_TOKEN") ?? "",
    },
    body: JSON.stringify({ message_id: messageId, group_id: groupId, invoked_by: reason }),
  }).catch((e) => console.warn("fireAgent failed:", (e as Error).message));
}

// El análisis falló, pero la PREGUNTA suele venir escrita en el caption. Antes los
// caminos de fallo morían MUDOS: el 05/08 10:21 Daniel mandó una captura con la
// pregunta completa en el caption (mención al bot incluida), el análisis murió en
// json_parse y nadie le contestó — Brayan tuvo que reenviar la imagen 10 minutos
// después y pedir explícitamente que ayudáramos. La invocación del agente no puede
// depender de que el análisis funcione: si el caption trae mención (o el grupo está
// en always y el caption tiene sustancia), el agente corre igual — va a ver el
// marcador "[análisis falló…]" en el contexto y contesta por el texto, aclarando
// que no pudo ver la imagen. Evento image_analysis_degraded para poder auditarlo.
async function fireAgentPeseAlFallo(
  sb: ReturnType<typeof adminClient>,
  msg: { id: string; tenant_id: string; group_id: string; body: string | null },
  motivo: string,
): Promise<void> {
  const { data: group } = await sb
    .from("whatsapp_groups")
    .select("bot_enabled, bot_mode")
    .eq("id", msg.group_id)
    .maybeSingle();
  if (!group?.bot_enabled || group?.bot_mode === "off") return;

  const caption = (msg.body ?? "").trim();
  let reason: "image_mention" | "auto" | null = null;
  if (hasBotMention(msg.body, "")) {
    reason = "image_mention";
  } else if (group.bot_mode === "always" && caption.length >= 10 && caption !== "[imagen]") {
    const { data: inHours } = await sb.rpc("whatsapp_group_in_business_hours", { p_group_id: msg.group_id });
    if (inHours) reason = "auto";
  }
  if (!reason) return;

  await logEvent(sb, {
    tenantId: msg.tenant_id,
    groupId: msg.group_id,
    kind: "image_analysis_degraded",
    payload: { message_id: msg.id, motivo, invoked_as: reason },
  });
  fireAgent(msg.id, msg.group_id, reason);
}

async function processBatch(batchSize: number): Promise<number> {
  const sb = adminClient();
  const { data: pending } = await sb
    .from("whatsapp_messages")
    .select("id")
    .eq("msg_type", "image")
    .is("transcribed_text", null)
    .eq("is_from_bot", false)
    .not("media_url", "is", null)
    // Las imágenes de Evolution caducan en ~5 min como los audios.
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

  let body: AnalyzeRequest = {};
  try {
    body = (await req.json()) as AnalyzeRequest;
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

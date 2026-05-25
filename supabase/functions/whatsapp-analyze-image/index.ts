import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, logEvent, whatsappCors } from "../_shared/whatsapp.ts";
import { logGeminiUsage } from "../_shared/usage.ts";

// whatsapp-analyze-image — analiza imágenes del grupo con Gemini 2.5
// Flash (vision built-in). Reconoce:
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
// Costo: Gemini 2.5 Flash es ~$0.075 input / $0.30 output por 1M tokens.
// Una imagen típica consume ~258 tokens de input + ~500 tokens de
// output = ~$0.00017 por imagen. 100 imágenes/día ≈ $0.50/mes.
// Despreciable.

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = Deno.env.get("WHATSAPP_GEMINI_MODEL") ?? "gemini-2.5-flash";
const GEMINI_TIMEOUT_MS = 30_000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB — WA limita imágenes a ~16MB
const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";

const VISION_PROMPT = `Sos un analista de imágenes para un equipo de ventas de agencias de OnlyFans. Te van a pasar una imagen que alguien compartió en un grupo de WhatsApp del equipo. Tu tarea: extraer toda la info útil de la imagen para que el bot que vive en el grupo pueda detectar compromisos, responder preguntas y trackear casos.

Devolvé JSON estricto con esta forma:

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
- Si el texto es OCR, transcribilo TAL CUAL aparece, sin corregir typos. Preserva emojis y ortografía.
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

async function downloadImage(url: string): Promise<{ data: Uint8Array; mime: string } | { error: string }> {
  try {
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) return { error: `download status ${resp.status}` };
    const buf = await resp.arrayBuffer();
    if (buf.byteLength === 0) return { error: "empty_image" };
    if (buf.byteLength > MAX_IMAGE_BYTES) return { error: "image_too_large" };
    const mime = resp.headers.get("content-type") || "image/jpeg";
    return { data: new Uint8Array(buf), mime };
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

async function callGeminiVision(
  imageBytes: Uint8Array,
  mime: string,
  contextHint: string | null,
): Promise<{ analysis: VisionAnalysis; usage: Record<string, number> } | { error: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const userParts: Array<Record<string, unknown>> = [
    {
      inline_data: {
        mime_type: mime,
        data: bytesToBase64(imageBytes),
      },
    },
    {
      text: contextHint
        ? `Contexto: el mensaje que acompaña esta imagen dice: "${contextHint}"\n\n${VISION_PROMPT}`
        : VISION_PROMPT,
    },
  ];

  const body = {
    contents: [{ parts: userParts }],
    generationConfig: {
      temperature: 0.1,
      // Forzar JSON output. Gemini lo respeta cuando se le pide explícito.
      responseMimeType: "application/json",
      maxOutputTokens: 1024,
    },
  };

  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), GEMINI_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return { error: `gemini ${resp.status}: ${errText.slice(0, 300)}` };
    }

    const data = await resp.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
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
      input_tokens: data.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };

    return { analysis, usage };
  } catch (e) {
    clearTimeout(timeoutId);
    const aborted = (e as Error).name === "AbortError";
    return {
      error: aborted
        ? `gemini_timeout_${GEMINI_TIMEOUT_MS / 1000}s`
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
    .select("id, tenant_id, group_id, msg_type, body, media_url, transcribed_text, analyzed_at, is_from_bot")
    .eq("id", messageId)
    .single();

  if (msgErr || !msg) return { ok: false, reason: "message_not_found" };
  if (msg.msg_type !== "image") return { ok: true, reason: "not_image" };
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
    return { ok: false, reason: "no_media_url" };
  }
  if (!GEMINI_API_KEY) {
    await logEvent(sb, {
      tenantId: msg.tenant_id,
      groupId: msg.group_id,
      kind: "error",
      payload: { stage: "analyze_image", error: "GEMINI_API_KEY missing", message_id: msg.id },
    });
    return { ok: false, reason: "gemini_not_configured" };
  }

  const downloaded = await downloadImage(msg.media_url);
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
    return { ok: false, reason: downloaded.error };
  }

  // Si la imagen tenía caption, lo pasamos a Gemini como hint para que
  // priorice extraer info relevante a ese contexto.
  const contextHint = msg.body && msg.body !== "[imagen]" ? msg.body : null;

  const result = await callGeminiVision(downloaded.data, downloaded.mime, contextHint);
  if ("error" in result) {
    await logEvent(sb, {
      tenantId: msg.tenant_id,
      groupId: msg.group_id,
      kind: "error",
      payload: { stage: "gemini", error: result.error, message_id: msg.id },
    });
    await sb
      .from("whatsapp_messages")
      .update({
        transcribed_text: `[análisis falló: ${result.error}]`,
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", msg.id);
    return { ok: false, reason: result.error };
  }

  const extractedText = buildExtractedText(result.analysis);

  // Guardar el texto extraído + el análisis JSON completo en analysis.
  await sb
    .from("whatsapp_messages")
    .update({
      transcribed_text: extractedText,
      analysis: { vision: result.analysis },
    })
    .eq("id", msg.id);

  // Log cost en api_usage_log.
  void logGeminiUsage({
    operation: "whatsapp-analyze-image",
    model: GEMINI_MODEL,
    inputTokens: result.usage.input_tokens,
    outputTokens: result.usage.output_tokens,
    tenantId: msg.tenant_id,
    context: { message_id: msg.id, group_id: msg.group_id, category: result.analysis.category },
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

  return { ok: true };
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

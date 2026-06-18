import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, resolveMimeType, whatsappCors } from "../_shared/whatsapp.ts";
import { logGeminiUsage } from "../_shared/usage.ts";

// wa-inbox-analyze-image — analiza las IMÁGENES de la BANDEJA (wa_conversation_messages)
// con un LLM de visión (OpenRouter → google/gemini-2.5-flash por defecto) y escribe una
// descripción + OCR en `body`. Hermano de wa-inbox-transcribe (audios/Whisper).
//
// A diferencia del bot del grupo (whatsapp-analyze-image, media .enc efímera que hay que
// desencriptar por el gateway), la media de la bandeja YA se baja desencriptada y se sube a
// Supabase Storage (whatsapp-ingest/downloadAndStoreInboundMedia, URL firmada 1 año). Es
// PERSISTENTE y son bytes PLANOS (JPEG/PNG/WebP reales), así que acá basta con fetchear el
// media_url y mandarlo a base64 — sin gateway, sin decrypt. Backfillea las viejas y procesa
// las nuevas. Modo batch (cron) o single (message_id).
//
// Idempotente: solo toma imágenes con body NULL o el placeholder "[imagen]". Éxito → body
// queda con la descripción (no vuelve a tomarse); fallo permanente → body marcado para no
// reintentar en loop; fallo transitorio (timeout/red/5xx) → se deja para el próximo barrido.
// El bot lee `body` vía la tool get_model_whatsapp_context (ya no marca "[sin transcribir]").

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
// Reusamos el mismo override que el analizador del grupo + Promolog: un solo
// modelo controla toda la stack de visión de Maven.
const LLM_MODEL = Deno.env.get("WHATSAPP_LLM_MODEL")
  ?? Deno.env.get("PROMOLOG_LLM_MODEL")
  ?? "google/gemini-2.5-flash";
const LLM_TIMEOUT_MS = 30_000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const VISION_PROMPT = `Sos un analista de imágenes para un equipo de ventas de agencias de OnlyFans. Te van a pasar una imagen que una modelo/lead mandó por WhatsApp en una conversación 1:1 con el equipo. Tu tarea: extraer toda la info útil de la imagen para que el bot que asiste al equipo pueda entender el contexto de la conversación.

Devolvé JSON estricto con esta forma:

{
  "description": "qué es la imagen, en 1-2 oraciones (ej. 'comprobante de transferencia bancaria por $200' o 'selfie de la modelo' o 'screenshot de su perfil de Instagram')",
  "ocr_text": "todo el texto que aparece en la imagen, transcripto literal. Si no hay texto, string vacío.",
  "category": "comprobante_pago" | "screenshot_ig" | "screenshot_wa" | "screenshot_of" | "selfie_foto" | "documento" | "meme" | "otro",
  "contains_payment_proof": true | false,
  "mentions": [{"name": "nombre o handle mencionado", "kind": "person_name | ig_handle | wa_phone | of_handle | other"}]
}

REGLAS:
- Si el texto es OCR, transcribilo TAL CUAL aparece, sin corregir typos. Preservá emojis y ortografía.
- NO inventes menciones que no estén visibles claramente.
- Si hay comprobante de transferencia/factura/payment, contains_payment_proof=true.
- description es BREVE — máx 2 oraciones. No describas color de fondo ni cosas irrelevantes.

OUTPUT: solo JSON. Sin markdown, sin explicaciones.`;

interface VisionAnalysis {
  description: string;
  ocr_text: string;
  category: string;
  contains_payment_proof: boolean;
  mentions: Array<{ name: string; kind: string }>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...whatsappCors, "Content-Type": "application/json" } });
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function callLlmVision(
  imageBytes: Uint8Array,
  mime: string,
): Promise<{ analysis: VisionAnalysis; usage: Record<string, number> } | { error: string }> {
  if (!OPENROUTER_API_KEY) return { error: "OPENROUTER_API_KEY_not_set" };
  const dataUri = `data:${mime};base64,${bytesToBase64(imageBytes)}`;
  const reqBody = {
    model: LLM_MODEL,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: VISION_PROMPT },
        { type: "image_url", image_url: { url: dataUri } },
      ],
    }],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 2048,
  };
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://maven.asmtech.me",
        "X-Title": "Maven WhatsApp Inbox Image Analyzer",
      },
      body: JSON.stringify(reqBody),
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!resp.ok) {
      return { error: `openrouter ${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 200)}` };
    }
    const data = await resp.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) return { error: "empty_response" };
    let analysis: VisionAnalysis;
    try {
      const p = JSON.parse(text);
      analysis = {
        description: String(p.description ?? ""),
        ocr_text: String(p.ocr_text ?? ""),
        category: String(p.category ?? "otro"),
        contains_payment_proof: p.contains_payment_proof === true,
        mentions: Array.isArray(p.mentions) ? p.mentions : [],
      };
    } catch (e) {
      return { error: `json_parse: ${(e as Error).message}` };
    }
    return {
      analysis,
      usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0 },
    };
  } catch (e) {
    clearTimeout(t);
    return { error: (e as Error).name === "AbortError" ? `llm_timeout_${LLM_TIMEOUT_MS / 1000}s` : (e as Error).message };
  }
}

// Texto humano que se guarda en body. Prefijo 🖼️ para que el bot sepa que este
// "mensaje" era una imagen y lo que sigue es su análisis (no texto tipeado por la modelo).
function buildBodyText(a: VisionAnalysis): string {
  const parts: string[] = [];
  parts.push(`🖼️ Imagen: ${a.description || "(sin descripción)"}`);
  if (a.ocr_text) parts.push(`Texto en la imagen: ${a.ocr_text}`);
  if (a.contains_payment_proof) parts.push("💰 Contiene un comprobante de pago.");
  if (a.mentions.length > 0) parts.push(`Menciones: ${a.mentions.map((m) => `${m.name} (${m.kind})`).join(", ")}`);
  return parts.join("\n");
}

// deno-lint-ignore no-explicit-any
async function processOne(sb: any, row: { id: string; tenant_id?: string; media_url: string }): Promise<boolean> {
  const mark = (txt: string) => sb.from("wa_conversation_messages").update({ body: txt }).eq("id", row.id);
  try {
    const resp = await fetch(row.media_url);
    if (!resp.ok) { await mark(`[imagen no analizable: descarga ${resp.status}]`); return false; }
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (!buf.length || buf.length > MAX_IMAGE_BYTES) { await mark("[imagen no analizable: tamaño]"); return false; }
    const mime = resolveMimeType(resp.headers.get("content-type"), buf, "image/jpeg");
    const res = await callLlmVision(buf, mime);
    if ("error" in res) {
      console.warn("vision failed", row.id, res.error);
      // Solo marcamos PERMANENTE si el error no es transitorio. Transitorios (se
      // reintentan dejando body=null): timeouts/red, 5xx/429 de OpenRouter, y
      // blips del modelo (empty_response/json_parse — Gemini a veces devuelve vacío
      // o JSON malformado un tick; reintentar suele resolver). Permanente real:
      // 4xx de imagen (400/401/403) y descarga fallida (otra rama).
      const transient = /timeout|fetch|network|openrouter 5\d\d|openrouter 429|empty_response|json_parse/i.test(res.error);
      if (!transient) await mark("[imagen no analizable]");
      return false;
    }
    await sb.from("wa_conversation_messages").update({ body: buildBodyText(res.analysis) }).eq("id", row.id);
    void logGeminiUsage({
      operation: "wa-inbox-analyze-image",
      model: LLM_MODEL,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      tenantId: row.tenant_id ?? null,
      context: { message_id: row.id, category: res.analysis.category, provider: "openrouter" },
    });
    return true;
  } catch (e) {
    console.warn("processOne error", row.id, (e as Error).message);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });
  if (!authorizeCronOrJwt(req)) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as { message_id?: string; batch_size?: number };
  const sb = adminClient();

  if (body.message_id) {
    const { data: row } = await sb
      .from("wa_conversation_messages").select("id, tenant_id, media_url")
      .eq("id", body.message_id).maybeSingle();
    if (!row?.media_url) return json({ ok: false, reason: "no_media" });
    const ok = await processOne(sb, row as { id: string; tenant_id?: string; media_url: string });
    return json({ ok, processed: 1, analyzed: ok ? 1 : 0 });
  }

  // Batch: imágenes de la bandeja sin analizar (body null o "[imagen]") con media en Storage.
  const limit = Math.min(body.batch_size ?? 10, 25);
  const { data: rows } = await sb
    .from("wa_conversation_messages")
    .select("id, tenant_id, media_url, body")
    .eq("msg_type", "image")
    .not("media_url", "is", null)
    .or("body.is.null,body.eq.[imagen]")
    .is("deleted_at", null)
    .order("sent_at", { ascending: false })
    .limit(limit);

  let ok = 0;
  for (const r of (rows ?? []) as Array<{ id: string; tenant_id?: string; media_url: string }>) {
    if (await processOne(sb, r)) ok++;
  }
  return json({ ok: true, processed: (rows ?? []).length, analyzed: ok });
});

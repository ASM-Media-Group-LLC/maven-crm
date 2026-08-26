import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, resolveMimeType, whatsappCors } from "../_shared/whatsapp.ts";
import { logGeminiUsage } from "../_shared/usage.ts";

// closers-analyze-screenshot — analiza las CAPTURAS que los closers adjuntan a la nota
// de un lead (closer_lead_files) y escribe una descripción + OCR en `vision_text`.
// Hermana de wa-inbox-analyze-image, misma stack de visión (OpenRouter → gemini-2.5-flash).
//
// Por qué existe: el bot de WhatsApp NUNCA ve imágenes — su contrato con la media es
// siempre texto pre-analizado (whatsapp_messages.transcribed_text, wa_conversation_messages.body).
// Para que el bot pueda "revisar las capturas" que pidió Álvaro, alguien tiene que
// convertirlas en texto antes. Eso hace esta función.
//
// La media vive en el bucket PRIVADO closer-evidence. Como acá corremos con service_role,
// se baja directo con storage.download() — no hace falta firmar URL ni pasar por el gateway
// (a diferencia del analizador del grupo, que sí tiene que desencriptar el .enc de Baileys).
//
// Idempotente y con tope de reintentos: solo toma filas con analyzed_at NULL y
// analysis_attempts < 3. Cada intento incrementa el contador, así que un fallo permanente
// sale de la cola sola después de 3 vueltas en vez de quemar cuota para siempre.
// Modo batch (cron) o single (file_id).

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
// Mismo override que el resto de la stack de visión de Maven: un solo modelo la controla.
const LLM_MODEL = Deno.env.get("WHATSAPP_LLM_MODEL")
  ?? Deno.env.get("PROMOLOG_LLM_MODEL")
  ?? "google/gemini-2.5-flash";
const LLM_TIMEOUT_MS = 30_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // igual que el file_size_limit del bucket
const MAX_ATTEMPTS = 3;
const BUCKET = "closer-evidence";

const VISION_PROMPT = `Sos un analista para el equipo comercial (closers) de una agencia de OnlyFans. Un closer adjuntó esta captura a la ficha de un lead en el CRM, como evidencia de lo que pasó con ese contacto. Extraé lo que le sirva al asistente del equipo para entender en qué quedó el caso y poder hacerle seguimiento.

Devolvé JSON estricto con esta forma:

{
  "description": "qué muestra la captura, en 1-2 oraciones (ej. 'conversación de WhatsApp donde la agencia pide precios de BLU' o 'comprobante de pago de suscripción por $249')",
  "ocr_text": "todo el texto legible de la imagen, transcripto literal. Si no hay texto, string vacío.",
  "category": "conversacion_whatsapp" | "conversacion_ig" | "correo" | "propuesta_precios" | "comprobante_pago" | "perfil_creadora" | "perfil_agencia" | "metricas" | "contrato" | "otro",
  "lead_signal": "interesado" | "objecion" | "no_interesado" | "cerrado" | "seguimiento_pendiente" | "informativo",
  "amounts": ["montos de dinero que aparezcan, con moneda, ej. 'USD 249/mes'"],
  "next_step": "el próximo paso acordado si la captura lo muestra (ej. 'llamada el jueves 10am'). Si no hay, string vacío.",
  "mentions": [{"name": "nombre, handle o empresa mencionada", "kind": "person_name | ig_handle | wa_phone | agency_name | email | other"}]
}

REGLAS:
- El OCR va TAL CUAL aparece, sin corregir typos. Preservá emojis y ortografía.
- NO inventes nada que no esté visible. Si no se ve, dejá el campo vacío.
- description es BREVE — máx 2 oraciones, sin describir colores ni cosas irrelevantes.
- lead_signal es tu lectura de en qué quedó el contacto según lo que se ve. Si la captura no dice nada del estado, usá "informativo".
- next_step SOLO si está explícito en la imagen.

OUTPUT: solo JSON. Sin markdown, sin explicaciones.`;

interface VisionAnalysis {
  description: string;
  ocr_text: string;
  category: string;
  lead_signal: string;
  amounts: string[];
  next_step: string;
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
        "X-Title": "Maven Closers Screenshot Analyzer",
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
        lead_signal: String(p.lead_signal ?? "informativo"),
        amounts: Array.isArray(p.amounts) ? p.amounts.map(String) : [],
        next_step: String(p.next_step ?? ""),
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

// Texto que lee el bot. Prefijo 🖼️ para que sepa que esto no lo tipeó el closer:
// es el análisis de una captura que adjuntó.
function buildVisionText(a: VisionAnalysis): string {
  const parts: string[] = [];
  parts.push(`🖼️ Captura: ${a.description || "(sin descripción)"}`);
  if (a.lead_signal && a.lead_signal !== "informativo") parts.push(`Señal del lead: ${a.lead_signal}`);
  if (a.next_step) parts.push(`Próximo paso: ${a.next_step}`);
  if (a.amounts.length > 0) parts.push(`Montos: ${a.amounts.join(", ")}`);
  if (a.mentions.length > 0) parts.push(`Menciones: ${a.mentions.map((m) => `${m.name} (${m.kind})`).join(", ")}`);
  if (a.ocr_text) parts.push(`Texto en la captura: ${a.ocr_text}`);
  return parts.join("\n");
}

interface FileRow { id: string; storage_path: string; analysis_attempts: number }

// deno-lint-ignore no-explicit-any
async function processOne(sb: any, row: FileRow): Promise<boolean> {
  // El intento se cuenta ANTES de gastar el LLM: si la función muere a mitad, la fila
  // no queda reintentándose para siempre.
  const attempts = (row.analysis_attempts ?? 0) + 1;
  await sb.from("closer_lead_files").update({ analysis_attempts: attempts }).eq("id", row.id);

  const fallo = (msg: string) =>
    sb.from("closer_lead_files").update({ analysis_error: msg.slice(0, 500) }).eq("id", row.id);

  try {
    const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(row.storage_path);
    if (dlErr || !blob) { await fallo(`descarga: ${dlErr?.message ?? "sin blob"}`); return false; }

    const buf = new Uint8Array(await blob.arrayBuffer());
    if (!buf.length || buf.length > MAX_IMAGE_BYTES) { await fallo("tamaño fuera de rango"); return false; }

    const mime = resolveMimeType(blob.type, buf, "image/png");
    const res = await callLlmVision(buf, mime);
    if ("error" in res) {
      console.warn("vision failed", row.id, res.error);
      await fallo(res.error);
      return false;
    }

    await sb.from("closer_lead_files").update({
      vision_text: buildVisionText(res.analysis),
      vision_analysis: res.analysis,
      analyzed_at: new Date().toISOString(),
      analysis_error: null,
    }).eq("id", row.id);

    void logGeminiUsage({
      operation: "closers-analyze-screenshot",
      model: LLM_MODEL,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      tenantId: null,
      context: { file_id: row.id, category: res.analysis.category, provider: "openrouter" },
    });
    return true;
  } catch (e) {
    console.warn("processOne error", row.id, (e as Error).message);
    await fallo((e as Error).message);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });
  if (!authorizeCronOrJwt(req)) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as { file_id?: string; batch_size?: number };
  const sb = adminClient();

  if (body.file_id) {
    const { data: row } = await sb
      .from("closer_lead_files").select("id, storage_path, analysis_attempts")
      .eq("id", body.file_id).maybeSingle();
    if (!row) return json({ ok: false, reason: "not_found" });
    const ok = await processOne(sb, row as FileRow);
    return json({ ok, processed: 1, analyzed: ok ? 1 : 0 });
  }

  const limit = Math.min(body.batch_size ?? 10, 25);
  const { data: rows } = await sb
    .from("closer_lead_files")
    .select("id, storage_path, analysis_attempts")
    .is("analyzed_at", null)
    .lt("analysis_attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(limit);

  let ok = 0;
  for (const r of (rows ?? []) as FileRow[]) {
    if (await processOne(sb, r)) ok++;
  }
  return json({ ok: true, processed: (rows ?? []).length, analyzed: ok });
});

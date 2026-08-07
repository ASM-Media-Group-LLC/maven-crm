import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { unzipSync } from "https://esm.sh/fflate@0.8.2";
import { adminClient, authorizeCronOrJwt, cortarSeguro, whatsappCors } from "../_shared/whatsapp.ts";

// whatsapp-extract-document — convierte un DOCUMENTO de WhatsApp (PDF/PPTX/DOCX/
// TXT) en texto y se lo deja al agente en transcribed_text, igual que hace el
// transcriptor con los audios. Al terminar dispara al agente.
//
// POR QUÉ EXISTE (07/08): Álvaro mandó al DM de Clari un PPTX ("Unlimited_Maquina_
// de_Leads.pptx") y un texto largo (WhatsApp convierte textos largos pegados en
// adjunto .txt) — el ingest los descartaba con dm_ignored_non_text y el bot decía
// "los PDF no me llegan". El pipeline: ingest inserta el mensaje → esta función
// baja el archivo vía gateway (/media/download desencripta con Baileys), extrae el
// texto y dispara al agente.
//
// Extracción por tipo:
//   · PDF  → Anthropic con bloque document base64 (nativo; 32MB request/600 págs).
//   · PPTX/DOCX → unzip + XML localmente (cero costo de modelo).
//   · TXT/MD/CSV → decodificación directa.
//   · Otro → mensaje honesto en transcribed_text para que el bot lo explique.
// SIEMPRE dispara al agente al final, incluso si la extracción falló — un bot que
// explica el fallo gana a un bot mudo (mismo principio que analyze-image #1149).

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
// Modelo para leer PDFs. Los directivos actúan sobre estos resúmenes y el volumen
// es bajo (algunos por semana), así que va calidad por defecto; ajustable por env.
const DOC_MODEL = Deno.env.get("WHATSAPP_DOC_MODEL") ?? "claude-opus-5";
const GATEWAY_URL = Deno.env.get("WHATSAPP_EVOLUTION_URL") ?? "";
const GATEWAY_KEY = Deno.env.get("WHATSAPP_EVOLUTION_API_KEY") ?? "";
const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";

// El request a Anthropic admite 32MB; el base64 infla 4/3 → tope crudo conservador.
const MAX_DOC_BYTES = 20 * 1024 * 1024;
// Tope del texto extraído que entra al contexto del agente.
const MAX_TEXTO_CHARS = 50_000;

async function descargarViaGateway(documentMessage: unknown): Promise<Uint8Array | { error: string }> {
  if (!GATEWAY_URL || !GATEWAY_KEY) return { error: "gateway_not_configured" };
  try {
    const resp = await fetch(`${GATEWAY_URL.replace(/\/$/, "")}/media/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": GATEWAY_KEY },
      body: JSON.stringify({ type: "document", message: documentMessage }),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      return { error: `gateway ${resp.status}: ${txt.slice(0, 200)}` };
    }
    const buf = await resp.arrayBuffer();
    if (buf.byteLength === 0) return { error: "documento_vacio" };
    if (buf.byteLength > MAX_DOC_BYTES) return { error: `documento_muy_grande (${Math.round(buf.byteLength / 1048576)}MB > 20MB)` };
    return new Uint8Array(buf);
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// Entidades XML mínimas que aparecen en texto de Office.
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

// PPTX: zip con ppt/slides/slideN.xml; el texto vive en runs <a:t>…</a:t>.
function extraerPptx(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const dec = new TextDecoder();
  const slides = Object.keys(files)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (slides.length === 0) return "";
  const partes: string[] = [];
  for (const [i, key] of slides.entries()) {
    const xml = dec.decode(files[key]);
    // Un párrafo <a:p> = una línea; dentro, los runs <a:t> se concatenan.
    const lineas = [...xml.matchAll(/<a:p[ >][\s\S]*?<\/a:p>/g)]
      .map((p) => [...p[0].matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((t) => decodeXmlEntities(t[1])).join(""))
      .filter((l) => l.trim().length > 0);
    partes.push(`— Diapositiva ${i + 1} —\n${lineas.join("\n")}`);
  }
  return partes.join("\n\n");
}

// DOCX: word/document.xml; texto en <w:t>, párrafos en <w:p>.
function extraerDocx(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const doc = files["word/document.xml"];
  if (!doc) return "";
  const xml = new TextDecoder().decode(doc);
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map((p) => [...p[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => decodeXmlEntities(t[1])).join(""))
    .filter((l) => l.trim().length > 0)
    .join("\n");
}

function toBase64(bytes: Uint8Array): string {
  // btoa por chunks: String.fromCharCode(...bytes) revienta el stack con archivos grandes.
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// PDF → Anthropic con bloque document (el modelo LEE el PDF nativo, incluidas
// imágenes/diagramas). Pedimos extracción fiel, no opinión: el que opina después
// es el agente, con el contexto de la conversación.
async function extraerPdf(bytes: Uint8Array, fileName: string): Promise<string | { error: string }> {
  if (!ANTHROPIC_API_KEY) return { error: "anthropic_key_missing" };
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: DOC_MODEL,
        max_tokens: 6000,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: toBase64(bytes) } },
            {
              type: "text",
              text:
                `Extrae el contenido de este documento ("${fileName}") en español, fiel y completo: ` +
                "títulos, texto, cifras, tablas (como listas) y qué muestran las imágenes/diagramas relevantes. " +
                "Mantén la estructura con encabezados simples. NO opines ni resumas de más — es una transcripción de trabajo.",
            },
          ],
        }],
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      return { error: `anthropic ${resp.status}: ${txt.slice(0, 200)}` };
    }
    const data = await resp.json() as { content?: Array<{ type: string; text?: string }>; stop_reason?: string };
    if (data.stop_reason === "refusal") return { error: "modelo_declino_leerlo" };
    const texto = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
    return texto.trim().length > 0 ? texto : { error: "extraccion_vacia" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function fireAgent(messageId: string, groupId: string): void {
  fetch(`${PROJECT_URL}/functions/v1/whatsapp-agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Cron-Token": CRON_TOKEN },
    body: JSON.stringify({ message_id: messageId, group_id: groupId, invoked_by: "mention" }),
  }).catch((e) => console.warn("fireAgent failed:", (e as Error).message));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });
  if (!authorizeCronOrJwt(req)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401, headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  const sb = adminClient();
  let messageId = "";
  try {
    const body = await req.json() as { message_id?: string };
    messageId = String(body.message_id ?? "");
  } catch { /* body inválido → 400 abajo */ }
  if (!messageId) {
    return new Response(JSON.stringify({ ok: false, error: "message_id_required" }), {
      status: 400, headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  const { data: msg } = await sb
    .from("whatsapp_messages")
    .select("id, group_id, tenant_id, msg_type, body, transcribed_text, raw")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) {
    return new Response(JSON.stringify({ ok: false, error: "message_not_found" }), {
      status: 404, headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }
  // Idempotente: si otra corrida ya lo extrajo, solo re-disparamos al agente.
  if (msg.transcribed_text) {
    fireAgent(msg.id, msg.group_id);
    return new Response(JSON.stringify({ ok: true, skipped: "ya_extraido" }), {
      status: 200, headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  // El raw guarda { data: <waMessage>, ... }; el documento puede venir directo o
  // envuelto en documentWithCaptionMessage (cuando trae caption).
  const r = msg.raw as { data?: { message?: Record<string, unknown> } } | null;
  const m = r?.data?.message ?? {};
  const docMsg = (m.documentMessage ??
    (m.documentWithCaptionMessage as { message?: { documentMessage?: unknown } } | undefined)?.message?.documentMessage) as
    | { fileName?: string; mimetype?: string }
    | undefined;

  const fileName = String(docMsg?.fileName ?? msg.body ?? "documento");
  const mime = String(docMsg?.mimetype ?? "").toLowerCase();
  const ext = (fileName.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();

  let texto = "";
  let fallo = "";

  if (!docMsg) {
    fallo = "raw_sin_documentMessage";
  } else {
    const bytes = await descargarViaGateway(docMsg);
    if (bytes instanceof Uint8Array) {
      try {
        if (mime === "application/pdf" || ext === "pdf") {
          const res = await extraerPdf(bytes, fileName);
          if (typeof res === "string") texto = res;
          else fallo = res.error;
        } else if (ext === "pptx" || mime.includes("presentationml")) {
          texto = extraerPptx(bytes);
          if (!texto) fallo = "pptx_sin_texto";
        } else if (ext === "docx" || mime.includes("wordprocessingml")) {
          texto = extraerDocx(bytes);
          if (!texto) fallo = "docx_sin_texto";
        } else if (mime.startsWith("text/") || ["txt", "md", "csv", "log", "json"].includes(ext)) {
          texto = new TextDecoder().decode(bytes);
          if (!texto.trim()) fallo = "texto_vacio";
        } else {
          fallo = `formato_no_soportado:${ext || mime || "desconocido"}`;
        }
      } catch (e) {
        fallo = `extraccion: ${(e as Error).message}`.slice(0, 200);
      }
    } else {
      fallo = bytes.error;
    }
  }

  const contenido = texto
    ? `[DOCUMENTO ADJUNTO: ${fileName}]\n${cortarSeguro(texto, MAX_TEXTO_CHARS)}` +
      (texto.length > MAX_TEXTO_CHARS ? "\n[…documento truncado a 50k caracteres]" : "")
    : `[DOCUMENTO ADJUNTO: ${fileName} — NO SE PUDO LEER: ${fallo}. ` +
      "Dile a la persona qué pasó, honesto y en una línea; los formatos que sí lees son PDF, PPTX, DOCX y TXT/MD/CSV — que lo convierta a uno de esos si aplica.]";

  await sb.from("whatsapp_messages").update({ transcribed_text: contenido }).eq("id", msg.id);

  await sb.from("whatsapp_bot_events").insert({
    tenant_id: msg.tenant_id ?? null,
    group_id: msg.group_id,
    kind: texto ? "document_extracted" : "document_extract_failed",
    payload: { message_id: msg.id, file: fileName.slice(0, 120), chars: texto.length, ...(fallo ? { error: fallo } : {}) },
  });

  // Nunca mudo: el agente responde con el contenido o con el fallo explicado.
  fireAgent(msg.id, msg.group_id);

  return new Response(JSON.stringify({ ok: true, extracted: Boolean(texto), chars: texto.length, ...(fallo ? { error: fallo } : {}) }), {
    status: 200, headers: { ...whatsappCors, "Content-Type": "application/json" },
  });
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, whatsappCors } from "../_shared/whatsapp.ts";
import { logAnthropicUsage } from "../_shared/usage.ts";

// wa-conversation-summarize — genera un ROLLING SUMMARY por conversación de la
// bandeja (wa_conversation_messages → wa_conversations.summary) con Haiku, para que
// el bot (tool get_model_whatsapp_context) tenga la NARRATIVA completa de relaciones
// largas sin leer 200+ mensajes. La media ya viene resuelta en `body` (audio→Whisper,
// imagen→visión), así que el resumen es multimodal.
//
// Incremental por watermark: solo re-resume cuando llegan mensajes nuevos
// (last_message_at > last_summarized_message_at). Conversaciones cortas (< MIN_MSGS)
// NO se resumen — el bot ya ve todo en los últimos-30; igual se marca el watermark
// para no re-evaluarlas en cada barrido. Modo batch (cron) o single (conversation_id).
// Haiku es barato (~$0.001/conv); el cron está acotado a convos activas (45 días).

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = "claude-haiku-4-5";
const MAX_MESSAGES = 60;       // ventana que se le pasa a Haiku
const MIN_MESSAGES = 7;        // por debajo de esto no vale la pena (last-30 ya lo cubre)
const MAX_CHARS_PER_MSG = 500;
const TIMEOUT_MS = 30_000;

const SYSTEM = `Eres un asesor de ventas de una agencia que recluta y trabaja con modelos de OnlyFans. Te paso una conversación de WhatsApp 1:1 entre el equipo ("nosotros") y una modelo/lead. Resúmela para que otro miembro del equipo (o un bot asesor) entienda la relación de un vistazo, sin leer todo el historial.

Devuelve 3 a 6 bullets cortos en español, cubriendo lo que aplique:
- Estado/etapa del lead y temperatura (frío/tibio/caliente).
- Qué marca/producto se le ofreció y qué se habló.
- Objeción, duda o traba principal.
- Compromisos o próximos pasos pendientes (de cualquiera de los dos lados).
- Datos concretos mencionados (montos, fechas, links, comprobantes).

REGLAS: No inventes nada que no esté en la conversación. No incluyas números de teléfono. Sé conciso y concreto. Sin preámbulo ni cierre, solo los bullets.`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...whatsappCors, "Content-Type": "application/json" } });
}

// Defensa-en-profundidad de masking: el prompt ya pide no incluir teléfonos, pero
// es una regla blanda. Acá enmascaramos en el INPUT (antes de Haiku) sólo secuencias
// CON FORMA de teléfono — un "+" seguido de 8+ dígitos/separadores (E.164), o una corrida
// de 10+ dígitos contiguos. NO toca montos ($1.171), fechas (2026), horas (10:26) ni IDs
// cortos, que el resumen sí debe conservar. Así Haiku nunca ve el número y no puede repetirlo.
function maskPhones(s: string): string {
  return s
    .replace(/\+\d[\d\s().\-]{6,}\d/g, "[teléfono]")
    .replace(/\b\d{10,}\b/g, "[teléfono]");
}

// deno-lint-ignore no-explicit-any
async function buildTranscript(sb: any, conversationId: string): Promise<{ text: string; count: number; lastAt: string | null }> {
  const { data: rows } = await sb
    .from("wa_conversation_messages")
    .select("direction, body, msg_type, sent_at")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("sent_at", { ascending: false })
    .limit(MAX_MESSAGES);
  const list = ((rows ?? []) as Array<{ direction: string; body: string | null; msg_type: string; sent_at: string }>).slice().reverse();
  const lastAt = list.length ? list[list.length - 1].sent_at : null;
  const text = list
    .map((m) => {
      const who = m.direction === "out" ? "Nosotros" : "Modelo";
      const b = (m.body ?? "").trim();
      const content = b ? b.slice(0, MAX_CHARS_PER_MSG) : `[${m.msg_type}]`;
      return `${who}: ${maskPhones(content)}`;
    })
    .join("\n");
  return { text, count: list.length, lastAt };
}

// deno-lint-ignore no-explicit-any
async function summarizeOne(sb: any, conv: { id: string; tenant_id?: string | null; last_message_at: string | null }): Promise<"ok" | "skip" | "fail"> {
  const { text, count, lastAt } = await buildTranscript(sb, conv.id);
  const watermark = lastAt ?? conv.last_message_at;

  // Conversación corta: no vale resumir. Marcamos watermark para no re-evaluarla
  // hasta que lleguen mensajes nuevos (no tocamos summary ni summary_updated_at).
  if (count < MIN_MESSAGES || !text.trim()) {
    await sb.from("wa_conversations").update({ last_summarized_message_at: watermark }).eq("id", conv.id);
    return "skip";
  }

  if (!ANTHROPIC_API_KEY) return "fail";
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: "user", content: `Conversación (lo más nuevo abajo):\n\n${text}` }],
      }),
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!resp.ok) { console.warn("anthropic", conv.id, resp.status); return "fail"; }
    const data = await resp.json() as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const summary = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
    if (!summary) return "fail";

    await sb.from("wa_conversations").update({
      summary,
      summary_updated_at: new Date().toISOString(),
      last_summarized_message_at: watermark,
      summary_model: MODEL,
    }).eq("id", conv.id);

    void logAnthropicUsage({
      operation: "wa-conversation-summarize",
      model: MODEL,
      usage: { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0 },
      tenantId: conv.tenant_id ?? null,
      context: { conversation_id: conv.id, messages: count },
    });
    return "ok";
  } catch (e) {
    clearTimeout(t);
    console.warn("summarizeOne error", conv.id, (e as Error).message);
    return "fail";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });
  if (!authorizeCronOrJwt(req)) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as { conversation_id?: string; batch_size?: number };
  const sb = adminClient();

  if (body.conversation_id) {
    const { data: conv } = await sb
      .from("wa_conversations").select("id, tenant_id, last_message_at")
      .eq("id", body.conversation_id).maybeSingle();
    if (!conv) return json({ ok: false, reason: "not_found" });
    const r = await summarizeOne(sb, conv as { id: string; tenant_id?: string | null; last_message_at: string | null });
    return json({ ok: r !== "fail", result: r });
  }

  // Batch: conversaciones activas (45 días) con watermark atrasado o nunca resumidas.
  // El picker (comparación columna-vs-columna) vive en la RPC SECURITY DEFINER.
  const limit = Math.min(body.batch_size ?? 6, 20);
  const { data: convs, error: pickErr } = await sb.rpc("wa_conversations_needing_summary", { p_limit: limit, p_days: 45 });
  if (pickErr) return json({ ok: false, error: pickErr.message }, 500);
  const candidates = (convs ?? []) as Array<{ id: string; tenant_id?: string | null; last_message_at: string | null }>;

  let ok = 0, skip = 0, fail = 0;
  for (const c of candidates) {
    const r = await summarizeOne(sb, c);
    if (r === "ok") ok++; else if (r === "skip") skip++; else fail++;
  }
  return json({ ok: true, considered: candidates.length, summarized: ok, skipped: skip, failed: fail });
});

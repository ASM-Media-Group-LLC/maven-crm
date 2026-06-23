// chatter-qa-analyze — borrador IA del QA cualitativo de chatters (QA-B / Slice 4).
//
// Lee la fila chatter_qa_reports (creada en status='processing' por el frontend), MUESTREA
// conversaciones chatter↔fan de Mensajes Pro vía WS de BLU (participants→hilos→messages,
// acotado), hace UNA sola llamada a Gemini Flash con el lente del correo del supervisor
// (ejecución comercial / calentamiento / desarrollo / personalización / venta prematura /
// oportunidades), valida el shape y escribe report+veredicto+sampling. Costo-consciente:
// muestreo (no todo) + 1 LLM + modelo barato → ~1-2¢ por reporte.
//
// Auth: service_role o JWT de staff. Deployar con --no-verify-jwt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGeminiOnce } from "../_shared/gemini.ts";
import { logGeminiUsage } from "../_shared/usage.ts";

const BLU_WS_URL = Deno.env.get("BLU_WS_URL") ?? "wss://of.unlok.me/";
const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_THREADS = 6;          // hilos muestreados por modelo
const MAX_MSGS = 40;            // ventana por hilo (query del owner)
const MSG_CHARS = 240;          // truncado por mensaje
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const stripHtml = (h: string) => String(h || "").replace(/<\/p>/gi, " ").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

type Msg = Record<string, unknown>;
// Un WS por llamada: auth una vez, varias queries secuenciales (matcher único activo).
function openConn(token: string, authTimeoutMs = 22000): Promise<{ query: (q: Msg, accept: (m: Msg) => boolean, t?: number) => Promise<Msg>; freshToken: () => string | null; close: () => void }> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try { ws = new WebSocket(BLU_WS_URL); } catch (e) { return reject(new Error("WS open: " + (e as Error).message)); }
    let authed = false, freshToken: string | null = null, settled = false;
    let waiter: { accept: (m: Msg) => boolean; res: (m: Msg) => void; rej: (e: Error) => void } | null = null;
    const authTo = setTimeout(() => { if (!settled) { settled = true; try { ws.close(); } catch { /* */ } reject(new Error("WS auth timeout")); } }, authTimeoutMs);
    const conn = {
      freshToken: () => freshToken,
      close: () => { try { ws.close(); } catch { /* */ } },
      query: (q: Msg, accept: (m: Msg) => boolean, t = 22000) =>
        new Promise<Msg>((res, rej) => {
          const to = setTimeout(() => { if (waiter && waiter.rej === rej) { waiter = null; rej(new Error("WS query timeout")); } }, t);
          waiter = { accept, res: (m) => { clearTimeout(to); res(m); }, rej: (e) => { clearTimeout(to); rej(e); } };
          try { ws.send(JSON.stringify(q)); } catch (e) { clearTimeout(to); waiter = null; rej(e as Error); }
        }),
    };
    ws.onopen = () => { try { ws.send(JSON.stringify({ type: "auth:token", token })); } catch { /* */ } };
    ws.onmessage = (ev: MessageEvent) => {
      let m: Msg; try { m = JSON.parse(typeof ev.data === "string" ? ev.data : ""); } catch { return; }
      const t = typeof m?.type === "string" ? m.type : "";
      if (t === "ping") { try { ws.send(JSON.stringify({ type: "pong" })); } catch { /* */ } return; }
      if (/auth:error|unauthorized|token.*(invalid|expired)|invalid.*token/i.test(t + " " + (m?.error ?? ""))) {
        if (!settled) { settled = true; clearTimeout(authTo); try { ws.close(); } catch { /* */ } reject(Object.assign(new Error("WS auth rechazado (¿BLU_JWT vencido?)"), { expired: true })); }
        return;
      }
      if (t === "auth:ok") { authed = true; if (typeof m.token === "string") freshToken = m.token; if (!settled) { settled = true; clearTimeout(authTo); resolve(conn); } return; }
      if (!authed || t === "connected" || t === "pong") return;
      if (waiter && waiter.accept(m)) { const w = waiter; waiter = null; w.res(m); }
    };
    ws.onerror = () => { if (!settled) { settled = true; clearTimeout(authTo); reject(new Error("WS error")); } if (waiter) { const w = waiter; waiter = null; w.rej(new Error("WS error")); } };
    ws.onclose = () => { if (waiter) { const w = waiter; waiter = null; w.rej(new Error("WS cerró")); } };
  });
}
const rid = (p: string) => `${p}:${Date.now()}:${Math.floor(performance.now())}`;

const SYSTEM_PROMPT = `Sos un evaluador de calidad (QA) de chatters de una agencia de OnlyFans, con el mismo criterio que usa el capacitador de chatters de la empresa. Te paso EXTRACTOS REALES de conversaciones entre un chatter y los fans de una o más modelos. Evaluá la EJECUCIÓN COMERCIAL del chatter con este lente:
- Calentamiento previo (¿desarrolla conversación antes de ofrecer/vender, o manda PPV en frío?)
- Desarrollo de la conversación (¿genera interés/conexión/curiosidad, o solo vende?)
- Personalización (¿aprovecha historial/preferencias del fan?)
- Venta prematura (¿ofrece antes de detectar señales de interés?)
- Oportunidades desaprovechadas (fans con interés emocional/disposición que no se trabajan)
- Monetización (iniciativa comercial, llamados a la acción, seguimiento)

Devolvé EXCLUSIVAMENTE un JSON válido (sin markdown, sin backticks, sin texto antes ni después) con EXACTAMENTE estas claves:
{
  "intro": "1-2 frases con el objetivo de la evaluación",
  "resumen": "diagnóstico general en 2-4 frases",
  "aspectos_positivos": ["bullet", "..."],
  "aspectos_mejora": [{"categoria": "Falta de calentamiento previo", "detalle": "..."}],
  "observaciones_por_modelo": [{"model_id": 0, "model_name": "...", "observaciones": ["..."], "ejemplos": [{"quote": "cita textual breve del chat", "por_que": "por qué ilustra el punto"}]}],
  "recomendaciones": ["bullet accionable", "..."],
  "conclusion": "párrafo de cierre",
  "hallazgo_principal": "la observación más importante en 1 frase",
  "veredicto": "uno de: excelente | bueno | requiere_mejora | critico"
}
Reglas: en español neutro, profesional y constructivo. Usá SOLO evidencia de los extractos (no inventes). Las citas en "ejemplos" deben ser textuales y breves. "veredicto" DEBE ser uno de los 4 valores exactos. Si la evidencia es escasa, decilo en el resumen y usá veredicto conservador.`;

const VEREDICTOS = ["excelente", "bueno", "requiere_mejora", "critico"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ error: "unauthorized" }, 401);
  if (bearer !== SERVICE_KEY) {
    const { data: { user }, error } = await sb.auth.getUser(bearer);
    if (error || !user) return json({ error: "unauthorized" }, 401);
    const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", user.id);
    if (!(roles ?? []).some((r: { role: string }) => ["admin", "owner", "manager"].includes(r.role))) return json({ error: "forbidden" }, 403);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* */ }
  const reportId = String(body.report_id ?? "");
  const withFeedback = !!body.with_feedback;
  if (!reportId) return json({ error: "report_id requerido" }, 400);

  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY no configurada" }, 500);

  const { data: report, error: rErr } = await sb.from("chatter_qa_reports").select("*").eq("id", reportId).maybeSingle();
  if (rErr || !report) return json({ error: "reporte no encontrado" }, 404);
  const evModels = (report.evaluated_models ?? []) as Array<{ model_id: number; model_name: string }>;
  if (evModels.length === 0) {
    await sb.from("chatter_qa_reports").update({ status: "failed", error_message: "Agregá al menos una modelo evaluada antes de generar el borrador IA." }).eq("id", reportId);
    return json({ error: "sin modelos evaluadas" }, 400);
  }

  const { data: sess } = await sb.from("blu_session").select("token").eq("id", 1).maybeSingle();
  const token = (sess?.token as string | undefined) ?? Deno.env.get("BLU_JWT") ?? "";
  if (!token) { await sb.from("chatter_qa_reports").update({ status: "failed", error_message: "Sin token de sesión BLU" }).eq("id", reportId); return json({ error: "sin token BLU" }, 500); }

  // ── Sampler: por modelo, N hilos × ventana de mensajes (un WS para todo) ──
  let conn;
  try { conn = await openConn(token); }
  catch (e) { const err = e as Error & { expired?: boolean }; await sb.from("chatter_qa_reports").update({ status: "failed", error_message: "BLU: " + err.message }).eq("id", reportId); return json({ error: err.message, expired: !!err.expired }, err.expired ? 401 : 502); }

  let threadsSampled = 0, messagesRead = 0;
  const blocks: string[] = [];
  try {
    for (const mdl of evModels) {
      const modelId = Number(mdl.model_id);
      if (!modelId) continue;
      const partMsg = await conn.query(
        { type: "messages-pro-get-participants", modelId, offset: 0, limit: 30, requestId: rid(`qa-part:${modelId}`) },
        (m) => m.type === "messages-pro-get-participants" && !!m.data,
      );
      const parts = ((((partMsg as any)?.data?.list) ?? []) as Array<{ withUser?: any }>).slice(0, MAX_THREADS);
      for (const p of parts) {
        const u = p?.withUser; const chatId = Number(u?.id);
        if (!chatId) continue;
        const fan = u?.name ?? u?.username ?? `fan ${chatId}`;
        try {
          const msgMsg = await conn.query(
            { type: "messages-pro-get-messages", modelId, chatId, limit: MAX_MSGS, order: "desc", requestId: rid(`qa-msg:${modelId}:${chatId}`) },
            (m) => m.type === "messages-pro-get-messages" && !!m.data,
          );
          const msgs = ((((msgMsg as any)?.data?.list) ?? []) as any[]).slice().reverse(); // cronológico
          const lines = msgs.map((m) => {
            const who = m?.fromMe ? "CHATTER" : "FAN";
            const tags = [m?.isTip ? "[TIP]" : "", (!m?.isFree && Number(m?.price) > 0) ? `[PPV $${m.price}]` : ""].filter(Boolean).join(" ");
            const txt = stripHtml(m?.text ?? "").slice(0, MSG_CHARS);
            return (txt || tags) ? `${who}: ${tags} ${txt}`.trim() : "";
          }).filter(Boolean);
          if (lines.length) {
            blocks.push(`### Modelo: ${mdl.model_name} — Fan: ${fan}\n${lines.join("\n")}`);
            messagesRead += lines.length;
          }
          threadsSampled++;
        } catch { /* hilo fallido no aborta */ }
      }
    }
    const fresh = conn.freshToken(); conn.close();
    if (fresh && fresh !== token) await sb.from("blu_session").upsert({ id: 1, token: fresh, refreshed_at: new Date().toISOString() });
  } catch (e) { try { conn.close(); } catch { /* */ } await sb.from("chatter_qa_reports").update({ status: "failed", error_message: "Sampler: " + (e as Error).message }).eq("id", reportId); return json({ error: (e as Error).message }, 502); }

  if (blocks.length === 0) {
    await sb.from("chatter_qa_reports").update({ status: "failed", error_message: "No se encontraron conversaciones para muestrear en las modelos evaluadas." }).eq("id", reportId);
    return json({ error: "sin conversaciones" }, 422);
  }

  // Feedback humano previo (re-análisis con correcciones).
  let feedbackBlock = "";
  if (withFeedback) {
    const { data: fb } = await sb.from("chatter_qa_section_feedback").select("section_type, thumbs, note").eq("report_id", reportId);
    const notes = (fb ?? []).filter((f: any) => f.note).map((f: any) => `- (${f.thumbs > 0 ? "👍" : "👎"} ${f.section_type}) ${f.note}`);
    if (notes.length) feedbackBlock = `\n\n[CORRECCIONES DEL SUPERVISOR — tenelas en cuenta]\n${notes.join("\n")}`;
  }

  const userMessage =
    `Chatter evaluado: ${report.chatter_name} (compañía ${report.company}).\n` +
    `Modelos: ${evModels.map((m) => m.model_name).join(", ")}.\n\n` +
    `EXTRACTOS DE CONVERSACIONES (CHATTER = mensajes del chatter, FAN = mensajes del fan):\n\n` +
    blocks.join("\n\n").slice(0, 60000) + feedbackBlock +
    `\n\nDevolvé SOLO el JSON con el shape pedido. "model_id" en observaciones_por_modelo debe coincidir con: ${JSON.stringify(evModels)}.`;

  // ── Una sola llamada a Gemini Flash ──
  let result;
  try {
    result = await callGeminiOnce({ apiKey: GEMINI_API_KEY, model: GEMINI_MODEL, systemPrompt: SYSTEM_PROMPT, messages: [{ role: "user", content: userMessage }], temperature: 0.4, maxOutputTokens: 3000 });
  } catch (e) {
    await sb.from("chatter_qa_reports").update({ status: "failed", error_message: "Gemini: " + (e as Error).message }).eq("id", reportId);
    return json({ error: (e as Error).message }, 502);
  }

  // Parse + validación de shape.
  let parsed: any;
  try {
    const t = result.text.replace(/^[^{]*/, "").replace(/[^}]*$/, "");
    parsed = JSON.parse(t);
  } catch {
    await sb.from("chatter_qa_reports").update({ status: "failed", error_message: "La IA no devolvió JSON válido. Reintentá." }).eq("id", reportId);
    return json({ error: "JSON inválido de la IA" }, 502);
  }
  if (!parsed || !VEREDICTOS.includes(parsed.veredicto)) {
    await sb.from("chatter_qa_reports").update({ status: "failed", error_message: "La IA devolvió un veredicto inválido. Reintentá." }).eq("id", reportId);
    return json({ error: "veredicto inválido" }, 502);
  }
  const arr = (x: unknown) => (Array.isArray(x) ? x : []);
  const reportBody = {
    intro: typeof parsed.intro === "string" ? parsed.intro : "",
    resumen: typeof parsed.resumen === "string" ? parsed.resumen : "",
    aspectos_positivos: arr(parsed.aspectos_positivos),
    aspectos_mejora: arr(parsed.aspectos_mejora),
    observaciones_por_modelo: arr(parsed.observaciones_por_modelo),
    recomendaciones: arr(parsed.recomendaciones),
    conclusion: typeof parsed.conclusion === "string" ? parsed.conclusion : "",
    hallazgo_principal: typeof parsed.hallazgo_principal === "string" ? parsed.hallazgo_principal : "",
  };
  const sampling = { models: evModels.length, threads_sampled: threadsSampled, messages_read: messagesRead, model: GEMINI_MODEL };

  const { error: uErr } = await sb.from("chatter_qa_reports").update({
    report: reportBody, veredicto: parsed.veredicto, sampling, status: "ready", source: "ai_draft", error_message: null, evaluator_name: "Claude AI",
  }).eq("id", reportId);
  if (uErr) return json({ error: "update: " + uErr.message }, 502);

  await logGeminiUsage({ operation: "chatter-qa-analyze", model: GEMINI_MODEL, inputTokens: result.usage.prompt_tokens ?? 0, outputTokens: result.usage.completion_tokens ?? 0, context: { reportId, chatter: report.chatter_name } });

  return json({ ok: true, report_id: reportId, veredicto: parsed.veredicto, sampling });
});

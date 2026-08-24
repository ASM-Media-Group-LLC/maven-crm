import { corsFor } from "../_shared/cors.ts";
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
import { logGeminiUsage } from "../_shared/usage.ts";

const BLU_WS_URL = Deno.env.get("BLU_WS_URL") ?? "wss://of.unlok.me/";
// Gemini 2.5 Flash vía OpenRouter (ruta paga, OpenAI-compatible) → sin los 503 del
// free tier de Gemini directo, y response_format json_object fuerza JSON limpio.
const OR_MODEL = "google/gemini-2.5-flash";
const MAX_THREADS = 6;          // hilos (del chatter elegido) a INCLUIR por modelo
const SCAN_LIMIT = 15;          // fans a escanear por modelo buscando los hilos del chatter
const MAX_MSGS = 40;            // ventana por hilo (query del owner)
const MSG_CHARS = 240;          // truncado por mensaje
const cors = (req: Request) => corsFor(req);
const json = (req: Request, b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors(req), "Content-Type": "application/json" } });
const stripHtml = (h: string) => String(h || "").replace(/<\/p>/gi, " ").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const num = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
// Atribución de masivos al chatter por NOMBRE (of-mass/smart-messages traen senderName, no id).
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const nameMatches = (a: unknown, b: unknown) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };

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

const SYSTEM_PROMPT = `Sos un evaluador de calidad (QA) de chatters de una agencia de OnlyFans, con el mismo criterio que usa el capacitador de chatters de la empresa. Te paso EXTRACTOS REALES de conversaciones entre un chatter y los fans de una o más modelos. IMPORTANTE: los extractos ya EXCLUYEN los mensajes MASIVOS/de cola (PPVs y blasts enviados a muchos fans a la vez) — evaluás SOLO las respuestas 1-a-1 GENUINAS que el chatter escribió de forma personal. Si hay poco 1-a-1 real, decilo en el resumen (suele indicar dependencia excesiva de masivos). Evaluá la EJECUCIÓN COMERCIAL del chatter con este lente:
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
  "observaciones_por_modelo": [{"model_id": 0, "model_name": "...", "observaciones": ["..."], "ejemplos": [{"quote": "cita textual breve del chat", "por_que": "por qué ilustra el punto", "fan": "@username exacto del fan de esa cita"}]}],
  "recomendaciones": ["bullet accionable", "..."],
  "conclusion": "párrafo de cierre",
  "hallazgo_principal": "la observación más importante en 1 frase",
  "venta_masiva": {"resumen": "diagnóstico de los masivos del chatter en 2-3 frases", "mejores": [{"copy": "copy textual breve", "metricas": "enviados X · vistos Y · ventas Z · $W", "por_que": "qué lo hizo efectivo"}], "peores": [{"copy": "...", "metricas": "...", "por_que": "por qué rindió poco"}], "patrones": ["patrón que separa lo que funciona de lo que no"], "recomendaciones": ["mejora accionable para los masivos"]},
  "veredicto": "uno de: excelente | bueno | requiere_mejora | critico"
}
Reglas: en español neutro, profesional y constructivo. Usá SOLO evidencia de los extractos (no inventes). Las citas en "ejemplos" deben ser textuales y breves. SIEMPRE que menciones a un fan (en observaciones o ejemplos) referencialo por su **@username exacto** (cada extracto trae al fan como "<nombre> @username") — NO solo por el nombre, porque el supervisor necesita el @ para ubicar la conversación. "veredicto" DEBE ser uno de los 4 valores exactos. Si la evidencia es escasa, decilo en el resumen y usá veredicto conservador. Si te paso un bloque "MASIVOS ENVIADOS POR EL CHATTER", llená "venta_masiva": compará los más efectivos (más ventas/ingresos y mejor conversión vistos→compras) con los menos, detectá PATRONES (gancho de apertura, longitud, precio, explícito vs teaser, con/sin media) y dá recomendaciones concretas. Si NO te paso ese bloque, devolvé "venta_masiva" con arrays vacíos y resumen "El chatter no envió masivos propios en las modelos evaluadas.". NO mezcles los masivos con la evaluación 1-a-1.`;

const VEREDICTOS = ["excelente", "bueno", "requiere_mejora", "critico"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json(req, { error: "unauthorized" }, 401);
  if (bearer !== SERVICE_KEY) {
    const { data: { user }, error } = await sb.auth.getUser(bearer);
    if (error || !user) return json(req, { error: "unauthorized" }, 401);
    const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", user.id);
    let ok = (roles ?? []).some((r: { role: string }) => ["admin", "owner", "manager"].includes(r.role));
    if (!ok) { const { data: can } = await sb.rpc("can_access_chatters_qa", { p_uid: user.id }); ok = can === true; }
    if (!ok) return json(req, { error: "forbidden" }, 403);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* */ }
  const reportId = String(body.report_id ?? "");
  const withFeedback = !!body.with_feedback;
  if (!reportId) return json(req, { error: "report_id requerido" }, 400);

  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
  if (!OPENROUTER_API_KEY) return json(req, { error: "OPENROUTER_API_KEY no configurada" }, 500);

  const { data: report, error: rErr } = await sb.from("chatter_qa_reports").select("*").eq("id", reportId).maybeSingle();
  if (rErr || !report) return json(req, { error: "reporte no encontrado" }, 404);
  const allModels = (report.evaluated_models ?? []) as Array<{ model_id: number; model_name: string }>;
  if (allModels.length === 0) {
    await sb.from("chatter_qa_reports").update({ status: "failed", error_message: "Agregá al menos una modelo evaluada antes de generar el borrador IA." }).eq("id", reportId);
    return json(req, { error: "sin modelos evaluadas" }, 400);
  }
  // Cap de modelos: cada modelo = ~15 lecturas WS de hilos + 2 de masivos. Con muchas (un chatter
  // puede estar asignado a 17) el edge se pasaba del presupuesto de ~150s y nunca devolvía.
  const MAX_MODELS = 4;
  const evModels = allModels.slice(0, MAX_MODELS);
  const modelsSkipped = allModels.slice(MAX_MODELS).map((m) => m.model_name);

  const { data: sess } = await sb.from("blu_session").select("token").eq("id", 1).maybeSingle();
  const token = (sess?.token as string | undefined) ?? Deno.env.get("BLU_JWT") ?? "";
  if (!token) { await sb.from("chatter_qa_reports").update({ status: "failed", error_message: "Sin token de sesión BLU" }).eq("id", reportId); return json(req, { error: "sin token BLU" }, 500); }

  // ── Sampler: por modelo, N hilos × ventana de mensajes (un WS para todo) ──
  let conn;
  try { conn = await openConn(token); }
  catch (e) { const err = e as Error & { expired?: boolean }; await sb.from("chatter_qa_reports").update({ status: "failed", error_message: "BLU: " + err.message }).eq("id", reportId); return json(req, { error: err.message, expired: !!err.expired }, err.expired ? 401 : 502); }

  let threadsSampled = 0, messagesRead = 0;
  const blocks: string[] = [];
  // Mapa @username → {modelId, chatId} de los fans muestreados → el frontend linkea
  // las citas del QA a la conversación real en Mensajes Pro (/conversaciones?model=&chat=).
  const fanIndex: Record<string, { m: number; c: number; n?: string }> = {};
  // Filtramos al chatter ELEGIDO por su blu_employee_id (= sentByManager.id en los mensajes).
  // Un fan lo chatean VARIOS chatters; sin esto el QA los mezclaba. coverage = nº de mensajes
  // genuinos (1-a-1) del chatter por modelo; emptyModels = modelos donde no tomó chats.
  const bluId = (report as any).blu_employee_id ? Number((report as any).blu_employee_id) : null;
  const coverage: Record<string, number> = {};
  let emptyModels: string[] = [];
  // Masivos (PPV/blasts) ENVIADOS POR ESTE CHATTER en las modelos evaluadas → sección "venta masiva".
  const chatterMasivos: Array<{ model: string; type: string; copy: string; price: number; sent: number; viewed: number; purchased: number; earnings: number }> = [];
  try {
    for (const mdl of evModels) {
      const modelId = Number(mdl.model_id);
      if (!modelId) { coverage[mdl.model_name] = 0; continue; }
      const partMsg = await conn.query(
        { type: "messages-pro-get-participants", modelId, offset: 0, limit: 40, requestId: rid(`qa-part:${modelId}`) },
        (m) => m.type === "messages-pro-get-participants" && !!m.data,
      );
      // Escaneamos hasta SCAN_LIMIT fans (los más recientes) buscando los hilos donde participó
      // EL chatter elegido — puede no estar en los primeros — e incluimos hasta MAX_THREADS.
      const parts = ((((partMsg as any)?.data?.list) ?? []) as Array<{ withUser?: any }>).slice(0, SCAN_LIMIT);
      let included = 0, modelChatterMsgs = 0;
      for (const p of parts) {
        if (included >= MAX_THREADS) break;
        const u = p?.withUser; const chatId = Number(u?.id);
        if (!chatId) continue;
        try {
          const msgMsg = await conn.query(
            { type: "messages-pro-get-messages", modelId, chatId, limit: MAX_MSGS, order: "desc", requestId: rid(`qa-msg:${modelId}:${chatId}`) },
            (m) => m.type === "messages-pro-get-messages" && !!m.data,
          );
          const msgs = ((((msgMsg as any)?.data?.list) ?? []) as any[]).slice().reverse(); // cronológico
          let threadChatterMsgs = 0;
          const lines = msgs.map((m) => {
            const sm = m?.sentByManager;
            const smId = sm && typeof sm === "object" ? Number(sm.id) : (typeof sm === "number" ? sm : null);
            const senderName = sm && typeof sm === "object" ? (sm.name ?? null) : (smId ? `#${smId}` : null);
            if (m?.fromMe) {
              // Sacar MASIVOS del análisis 1-a-1: salió por COLA (isFromQueue → of-mass /
              // smart-messages PRIORITY_MASS) o SIN nombre de quien lo envió (otro CRM, PD del owner).
              if (m?.isFromQueue || !senderName) return "";
              // Filtrar al chatter ELEGIDO: mensajes de OTRO chatter en el mismo hilo NO entran.
              if (bluId && smId !== bluId) return "";
              threadChatterMsgs++;
            }
            const who = m?.fromMe ? "CHATTER" : "FAN";
            const tags = [m?.isTip ? "[TIP]" : "", (!m?.isFree && Number(m?.price) > 0) ? `[PPV $${m.price}]` : ""].filter(Boolean).join(" ");
            const txt = stripHtml(m?.text ?? "").slice(0, MSG_CHARS);
            return (txt || tags) ? `${who}: ${tags} ${txt}`.trim() : "";
          }).filter(Boolean);
          // Solo incluimos el hilo si el chatter ELEGIDO participó (≥1 mensaje genuino suyo);
          // de lo contrario es la conversación de otro chatter y no aporta a SU QA.
          if (threadChatterMsgs > 0 && lines.length) {
            const fanName = u?.name ?? u?.displayName ?? "";
            const fanHandle = u?.username ? `@${u.username}` : "";
            const fan = [fanName, fanHandle].filter(Boolean).join(" ").trim() || `fan ${chatId}`;
            if (u?.username) fanIndex[`@${u.username}`] = { m: modelId, c: chatId, n: fanName || undefined };
            blocks.push(`### Modelo: ${mdl.model_name} — Fan: ${fan}\n${lines.join("\n")}`);
            messagesRead += lines.length; modelChatterMsgs += threadChatterMsgs; included++; threadsSampled++;
          }
        } catch { /* hilo fallido no aborta */ }
      }
      coverage[mdl.model_name] = modelChatterMsgs;
      // Masivos ENVIADOS POR ESTE CHATTER en el modelo (of-mass + smart-messages), atribuidos por senderName.
      try {
        const ofm = await conn.query({ type: "agency:messages-pro:of-mass:list", modelId, requestId: rid(`of-mass:${modelId}`) }, (m) => m.type === "agency:messages-pro:of-mass:list");
        for (const r of ((((ofm as any)?.data?.rows) ?? []) as any[])) {
          const sn = r?.senderName && r.senderName !== "Sent on OnlyFans" ? r.senderName : null; // null = otro CRM
          if (!nameMatches(sn, report.chatter_name)) continue;
          chatterMasivos.push({ model: mdl.model_name, type: "OF mass", copy: stripHtml(r?.message ?? "").slice(0, 220), price: num(r?.price), sent: num(r?.sent), viewed: num(r?.viewed), purchased: num(r?.purchased), earnings: num(r?.earnings) });
        }
        const sm = await conn.query({ type: "agency:messages-pro:smart-messages:list", modelId, requestId: rid(`smart:${modelId}`) }, (m) => m.type === "agency:messages-pro:smart-messages:list");
        for (const x of ((((sm as any)?.data?.messages) ?? []) as any[])) {
          if (!nameMatches(x?.senderName, report.chatter_name)) continue;
          chatterMasivos.push({ model: mdl.model_name, type: "Priority", copy: stripHtml(x?.name ?? x?.textPreview ?? "").slice(0, 220), price: num(x?.price), sent: num(x?.sent ?? x?.sentCount), viewed: num(x?.viewed ?? x?.viewedCount), purchased: num(x?.purchased ?? x?.purchasedCount), earnings: num(x?.earnings) });
        }
      } catch { /* masivos no aborta el QA 1-a-1 */ }
    }
    emptyModels = evModels.filter((m) => (coverage[m.model_name] ?? 0) === 0).map((m) => m.model_name);
    const fresh = conn.freshToken(); conn.close();
    if (fresh && fresh !== token) await sb.from("blu_session").upsert({ id: 1, token: fresh, refreshed_at: new Date().toISOString() });
  } catch (e) { try { conn.close(); } catch { /* */ } await sb.from("chatter_qa_reports").update({ status: "failed", error_message: "Sampler: " + (e as Error).message }).eq("id", reportId); return json(req, { error: (e as Error).message }, 502); }

  if (blocks.length === 0) {
    // El chatter elegido no tomó chats 1-a-1 en NINGUNA de las modelos evaluadas
    // (solo masivos, o no atendió a nadie) → no hay nada genuino que evaluar.
    const msg = bluId
      ? `${report.chatter_name} no tiene chats 1-a-1 en ${evModels.map((m) => m.model_name).join(", ")} (solo masivos o sin actividad reciente). No hay conversaciones para analizar.`
      : "No se encontraron conversaciones 1-a-1 para muestrear en las modelos evaluadas.";
    await sb.from("chatter_qa_reports").update({ status: "failed", error_message: msg }).eq("id", reportId);
    // 200 a propósito: condición de negocio (no error HTTP) → supabase-js deja el body en `data`
    // y el frontend muestra el mensaje amable (un 4xx daría data=null + error genérico "non-2xx").
    return json(req, { error: msg, code: "no_chats", empty_models: emptyModels, models_skipped: modelsSkipped });
  }

  // Feedback humano previo (re-análisis con correcciones).
  let feedbackBlock = "";
  if (withFeedback) {
    const { data: fb } = await sb.from("chatter_qa_section_feedback").select("section_type, thumbs, note").eq("report_id", reportId);
    const notes = (fb ?? []).filter((f: any) => f.note).map((f: any) => `- (${f.thumbs > 0 ? "👍" : "👎"} ${f.section_type}) ${f.note}`);
    if (notes.length) feedbackBlock = `\n\n[CORRECCIONES DEL SUPERVISOR — tenelas en cuenta]\n${notes.join("\n")}`;
  }

  // Bloque de masivos del chatter (rankeado por ingresos) → la IA llena "venta_masiva".
  const masStats = chatterMasivos.reduce((a, m) => ({ count: a.count + 1, sent: a.sent + m.sent, viewed: a.viewed + m.viewed, purchased: a.purchased + m.purchased, earnings: a.earnings + m.earnings }), { count: 0, sent: 0, viewed: 0, purchased: 0, earnings: 0 });
  const masivosBlock = chatterMasivos.length
    ? `\n\nMASIVOS ENVIADOS POR EL CHATTER (copy + performance; analizá esto SOLO en "venta_masiva"):\n` +
      chatterMasivos.slice().sort((a, b) => b.earnings - a.earnings)
        .map((m) => `[${m.type} · ${m.model}] enviados:${m.sent} vistos:${m.viewed} ventas:${m.purchased} $${m.earnings}${m.price > 0 ? ` (PPV $${m.price})` : ""} — "${m.copy}"`)
        .join("\n").slice(0, 14000)
    : "";

  const userMessage =
    `Chatter evaluado: ${report.chatter_name} (compañía ${report.company}).\n` +
    `Modelos: ${evModels.map((m) => m.model_name).join(", ")}.\n\n` +
    `EXTRACTOS DE CONVERSACIONES (CHATTER = mensajes del chatter, FAN = mensajes del fan):\n\n` +
    blocks.join("\n\n").slice(0, 60000) + feedbackBlock + masivosBlock +
    `\n\nDevolvé SOLO el JSON con el shape pedido. "model_id" en observaciones_por_modelo debe coincidir con: ${JSON.stringify(evModels)}.`;

  // ── Una sola llamada a Gemini 2.5 Flash vía OpenRouter (ruta paga → sin 503) ──
  let text = "", usage = { prompt_tokens: 0, completion_tokens: 0 };
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://maven.asmtech.me",
        "X-Title": "Maven Chatter QA",
      },
      body: JSON.stringify({
        model: OR_MODEL,
        max_tokens: 6000,   // headroom: reporte completo + sección venta_masiva (mejores/peores/patrones)
        temperature: 0.4,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userMessage }],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) throw new Error(`openrouter ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    text = data.choices?.[0]?.message?.content ?? "";
    usage = { prompt_tokens: data.usage?.prompt_tokens ?? 0, completion_tokens: data.usage?.completion_tokens ?? 0 };
  } catch (e) {
    await sb.from("chatter_qa_reports").update({ status: "failed", error_message: "IA: " + (e as Error).message }).eq("id", reportId);
    return json(req, { error: (e as Error).message }, 502);
  }

  // Parse + validación de shape (json_object ya devuelve JSON; limpiamos backticks por las dudas).
  let parsed: any;
  try {
    parsed = JSON.parse(text.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim());
  } catch {
    await sb.from("chatter_qa_reports").update({ status: "failed", error_message: "La IA no devolvió JSON válido. Reintenta." }).eq("id", reportId);
    return json(req, { error: "JSON inválido de la IA" }, 502);
  }
  if (!parsed || !VEREDICTOS.includes(parsed.veredicto)) {
    await sb.from("chatter_qa_reports").update({ status: "failed", error_message: "La IA devolvió un veredicto inválido. Reintenta." }).eq("id", reportId);
    return json(req, { error: "veredicto inválido" }, 502);
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
    // Solo incluimos venta_masiva si el chatter envió masivos propios (atribuidos por senderName);
    // si no detectamos masivos suyos → null → la sección NO aparece (en manual el supervisor la carga a mano).
    venta_masiva: masStats.count > 0 ? {
      resumen: typeof parsed.venta_masiva?.resumen === "string" ? parsed.venta_masiva.resumen : "",
      mejores: arr(parsed.venta_masiva?.mejores),
      peores: arr(parsed.venta_masiva?.peores),
      patrones: arr(parsed.venta_masiva?.patrones),
      recomendaciones: arr(parsed.venta_masiva?.recomendaciones),
      stats: masStats,
    } : null,
  };
  const sampling = { models: evModels.length, threads_sampled: threadsSampled, messages_read: messagesRead, model: OR_MODEL, fan_index: fanIndex, coverage, empty_models: emptyModels, models_skipped: modelsSkipped, masivos_stats: masStats };

  const { error: uErr } = await sb.from("chatter_qa_reports").update({
    report: reportBody, veredicto: parsed.veredicto, sampling, status: "ready", source: "ai_draft", error_message: null, evaluator_name: "Claude AI",
  }).eq("id", reportId);
  if (uErr) return json(req, { error: "update: " + uErr.message }, 502);

  await logGeminiUsage({ operation: "chatter-qa-analyze", model: OR_MODEL, inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, context: { reportId, chatter: report.chatter_name, provider: "openrouter" } });

  return json(req, { ok: true, report_id: reportId, veredicto: parsed.veredicto, sampling, empty_models: emptyModels, models_skipped: modelsSkipped });
});

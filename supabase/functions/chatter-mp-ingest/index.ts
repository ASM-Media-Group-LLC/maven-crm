import { corsFor } from "../_shared/cors.ts";
// chatter-mp-ingest — ingesta histórica de Mensajes Pro a chatter_conversations (QA-D / Slice 2).
//
// Por modelo: pagina participants (offset, ya capturado) → por cada hilo trae la ventana reciente
// de mensajes (get-messages limit/order) → upsert idempotente en chatter_conversations. Materia
// prima del borrador IA del QA cualitativo + búsqueda.
//
// EFICIENTE: abre UN solo WS por llamada (auth una vez, muchas queries) en vez de uno por query
// → ~1s/hilo y gentil con BLU. SCOPED + RESUMIBLE: procesa hasta `maxThreads` por llamada y devuelve
// `nextOffset` (offset de participante, no de página) para continuar sin pasarse del budget ni re-procesar.
// Reúsa la query EXACTA del owner (misma que blu-mp). Profundidad >limit por hilo espera el cursor.
//
// Auth: service_role (cron/manual) o JWT de staff. Deployar con --no-verify-jwt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// El dominio de BLU migró: `of.unlok.me` está MUERTO (no responde nada) y todo
// vive en `of.blu.luxe`. El bridge se corrigió en su momento (#1208, "no era el
// token, era el dominio") pero estas funciones quedaron con el viejo, así que
// fallaban con "WS error" mientras el bridge andaba perfecto.
//
// Se ignora el valor del entorno si apunta al dominio muerto: no existe un caso
// donde quieras usarlo, y así el arreglo no depende de acordarse de un secreto.
const BLU_WS_DEFAULT = "wss://of.blu.luxe/";
const BLU_WS_ENV = Deno.env.get("BLU_WS_URL");
const BLU_WS_URL = BLU_WS_ENV && !/of\.unlok\.me/i.test(BLU_WS_ENV) ? BLU_WS_ENV : BLU_WS_DEFAULT;
const cors = (req: Request) => corsFor(req);
function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}

type Msg = Record<string, unknown>;
interface BluConn {
  query: (q: Msg, accept: (m: Msg) => boolean, timeoutMs?: number) => Promise<Msg>;
  freshToken: () => string | null;
  close: () => void;
}

// Abre UN WS, autentica (auth:token→auth:ok) y mantiene la conexión para correr múltiples queries
// secuenciales. Maneja ping/pong app-level. Las queries se mandan de a una (await), así el matcher
// activo es siempre único.
function openConn(token: string, authTimeoutMs = 22000): Promise<BluConn> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try { ws = new WebSocket(BLU_WS_URL); } catch (e) { return reject(new Error("WS open: " + (e as Error).message)); }
    let authed = false, freshToken: string | null = null, settledAuth = false;
    let waiter: { accept: (m: Msg) => boolean; res: (m: Msg) => void; rej: (e: Error) => void } | null = null;
    const authTo = setTimeout(() => { if (!settledAuth) { settledAuth = true; try { ws.close(); } catch { /* */ } reject(new Error("WS auth timeout")); } }, authTimeoutMs);

    const conn: BluConn = {
      freshToken: () => freshToken,
      close: () => { try { ws.close(); } catch { /* */ } },
      query: (q, accept, timeoutMs = 22000) =>
        new Promise<Msg>((res, rej) => {
          const to = setTimeout(() => { if (waiter && waiter.rej === rej) { waiter = null; rej(new Error("WS query timeout")); } }, timeoutMs);
          waiter = { accept, res: (m) => { clearTimeout(to); res(m); }, rej: (e) => { clearTimeout(to); rej(e); } };
          try { ws.send(JSON.stringify(q)); } catch (e) { clearTimeout(to); waiter = null; rej(e as Error); }
        }),
    };

    ws.onopen = () => { try { ws.send(JSON.stringify({ type: "auth:token", token })); } catch { /* */ } };
    ws.onmessage = (ev: MessageEvent) => {
      let m: Msg;
      try { m = JSON.parse(typeof ev.data === "string" ? ev.data : ""); } catch { return; }
      const t = typeof m?.type === "string" ? m.type : "";
      if (t === "ping") { try { ws.send(JSON.stringify({ type: "pong" })); } catch { /* */ } return; }
      if (/auth:error|unauthorized|token.*(invalid|expired)|invalid.*token/i.test(t + " " + (m?.error ?? ""))) {
        if (!settledAuth) { settledAuth = true; clearTimeout(authTo); try { ws.close(); } catch { /* */ } reject(Object.assign(new Error("WS auth rechazado (¿BLU_JWT vencido?)"), { expired: true })); }
        return;
      }
      if (t === "auth:ok") {
        authed = true;
        if (typeof m.token === "string") freshToken = m.token;
        if (!settledAuth) { settledAuth = true; clearTimeout(authTo); resolve(conn); }
        return;
      }
      if (!authed || t === "connected" || t === "pong") return;
      if (waiter && waiter.accept(m)) { const w = waiter; waiter = null; w.res(m); }
    };
    ws.onerror = () => {
      if (!settledAuth) { settledAuth = true; clearTimeout(authTo); reject(new Error("WS error")); }
      if (waiter) { const w = waiter; waiter = null; w.rej(new Error("WS error")); }
    };
    ws.onclose = () => { if (waiter) { const w = waiter; waiter = null; w.rej(new Error("WS cerró")); } };
  });
}

const rid = (p: string) => `${p}:${Date.now()}:${Math.floor(performance.now())}`;
const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // Auth: service_role o JWT de staff (admin/owner/manager).
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json(req, { error: "unauthorized" }, 401);
  if (bearer !== SERVICE_KEY) {
    const { data: { user }, error } = await sb.auth.getUser(bearer);
    if (error || !user) return json(req, { error: "unauthorized" }, 401);
    const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", user.id);
    const ok = (roles ?? []).some((r: { role: string }) => ["admin", "owner", "manager"].includes(r.role));
    if (!ok) return json(req, { error: "forbidden" }, 403);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* */ }
  const modelId = Number(body.modelId);
  if (!modelId) return json(req, { error: "modelId requerido" }, 400);
  const modelName = body.modelName ? String(body.modelName) : null;
  const startOffset = Math.max(0, Number(body.startOffset ?? 0));
  const maxThreads = Math.min(120, Math.max(1, Number(body.maxThreads ?? 40)));  // tope por llamada (budget)
  const msgLimit = Math.min(40, Math.max(1, Number(body.msgLimit ?? 40)));        // ventana por hilo (query del owner)
  const PART_PAGE = 40;

  const { data: sess } = await sb.from("blu_session").select("token").eq("id", 1).maybeSingle();
  const token = (sess?.token as string | undefined) ?? Deno.env.get("BLU_JWT") ?? "";
  if (!token) return json(req, { error: "sin token de sesión BLU (blu_session vacío)" }, 500);

  let conn: BluConn;
  try { conn = await openConn(token); }
  catch (e) { const err = e as Error & { expired?: boolean }; return json(req, { error: err.message, expired: !!err.expired }, err.expired ? 401 : 502); }

  const rows: Record<string, unknown>[] = [];
  let threadsProcessed = 0;
  let offset = startOffset;
  let exhausted = false;

  try {
    outer: while (threadsProcessed < maxThreads) {
      const partMsg = await conn.query(
        { type: "messages-pro-get-participants", modelId, offset, limit: PART_PAGE, requestId: rid(`mp-part:${modelId}`) },
        (m) => m.type === "messages-pro-get-participants" && !!m.data,
      );
      const partList = (((partMsg as any)?.data?.list) ?? []) as Array<{ withUser?: any }>;
      if (partList.length === 0) { exhausted = true; break; }

      for (const p of partList) {
        if (threadsProcessed >= maxThreads) break outer;
        const u = p?.withUser;
        const chatId = Number(u?.id);
        if (!chatId) { threadsProcessed++; continue; }
        const fanName = u?.name ?? u?.username ?? null;
        const fanUsername = u?.username ?? null;

        try {
          const msgMsg = await conn.query(
            { type: "messages-pro-get-messages", modelId, chatId, limit: msgLimit, order: "desc", requestId: rid(`mp-msg:${modelId}:${chatId}`) },
            (m) => m.type === "messages-pro-get-messages" && !!m.data,
          );
          const msgs = (((msgMsg as any)?.data?.list) ?? []) as any[];
          for (const m of msgs) {
            const sm = m?.sentByManager;
            const chatterId = sm && typeof sm === "object" ? num(sm.id) : (typeof sm === "number" ? sm : null);
            const chatterName = sm && typeof sm === "object" ? (sm.name ?? null) : null;
            rows.push({
              model_id: modelId, model_name: modelName,
              chat_id: chatId, fan_name: fanName, fan_username: fanUsername,
              message_id: Number(m?.id),
              from_me: !!m?.fromMe,
              sent_by_chatter_id: chatterId, sent_by_chatter_name: chatterName,
              body: typeof m?.text === "string" ? m.text : null,
              price: num(m?.price), is_free: !!m?.isFree, is_tip: !!m?.isTip,
              tip_amount: num(m?.tipAmount), media_count: num(m?.mediaCount) ?? 0, is_opened: !!m?.isOpened,
              sent_at: m?.createdAt ?? null,
            });
          }
        } catch (_e) { /* un hilo fallido no aborta la corrida */ }
        threadsProcessed++;
      }

      if (partList.length < PART_PAGE) { exhausted = true; break; }
      offset += PART_PAGE;
    }

    const fresh = conn.freshToken();
    conn.close();
    if (fresh && fresh !== token) {
      await sb.from("blu_session").upsert({ id: 1, token: fresh, refreshed_at: new Date().toISOString() });
    }

    let upserted = 0;
    const valid = rows.filter((r) => Number.isFinite(r.message_id as number));
    for (let i = 0; i < valid.length; i += 500) {
      const chunk = valid.slice(i, i + 500);
      const { error } = await sb.from("chatter_conversations").upsert(chunk, { onConflict: "model_id,chat_id,message_id" });
      if (error) return json(req, { error: "upsert: " + error.message, threadsProcessed, upserted }, 502);
      upserted += chunk.length;
    }

    // nextOffset = offset del próximo participante a procesar (granularidad participante, no página).
    const nextOffset = exhausted ? null : startOffset + threadsProcessed;
    return json(req, { ok: true, modelId, threadsProcessed, messagesUpserted: upserted, nextOffset });
  } catch (e) {
    try { conn.close(); } catch { /* */ }
    const err = e as Error & { expired?: boolean };
    return json(req, { error: err.message, expired: !!err.expired, threadsProcessed }, err.expired ? 401 : 502);
  }
});

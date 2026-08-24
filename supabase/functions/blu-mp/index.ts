import { corsFor } from "../_shared/cors.ts";
// blu-mp — proxy ON-DEMAND a Messages Pro de BLU (wss://of.unlok.me).
//
// El management abre un hilo en Maven → esta fn abre un WS a BLU con el token de sesión
// (tabla blu_session, refrescada por el micro blu-bridge cada ~3h), corre la query EXACTA
// que capturó el owner y devuelve el JSON. NO almacena nada (viewer on-demand → huella PII
// mínima; el histórico bulk para QA es un slice aparte).
//
// Queries soportadas (las que dio el owner desde Messages Pro):
//   models       → agency:models:list                                  (dropdown de modelos)
//   participants → messages-pro-get-participants {modelId, offset, limit}  (lista de fans/hilos)
//   messages     → messages-pro-get-messages {modelId, chatId, limit, order} (el hilo)
//   fan-summary  → fan:get-summary {modelId, fanId}                     (tarjeta del fan)
//
// Auth: service_role (tests) o JWT de staff (admin/owner/manager). Deployar con --no-verify-jwt
// (hace su propia auth). Reúsa el flujo auth:token→auth:ok + ping/pong app-level del micro.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BLU_WS_URL = Deno.env.get("BLU_WS_URL") ?? "wss://of.unlok.me/";
const cors = (req: Request) => corsFor(req);
function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}

// Abre WS, autentica, manda `query`, resuelve con el 1er mensaje que matchee `accept`.
// Maneja ping/pong. En timeout devuelve los tipos vistos (post-auth) para diagnosticar matchers.
function bluQuery(
  token: string,
  query: Record<string, unknown>,
  accept: (m: Record<string, unknown>) => boolean,
  timeoutMs = 22000,
): Promise<{ msg: Record<string, unknown>; freshToken: string | null }> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try { ws = new WebSocket(BLU_WS_URL); } catch (e) { return reject(new Error("WS open: " + (e as Error).message)); }
    let authed = false, resolved = false, freshToken: string | null = null;
    const seen: string[] = [];
    const to = setTimeout(
      () => done(reject, new Error(`WS timeout (${timeoutMs}ms). Tipos vistos: ${seen.join(", ") || "ninguno"}`)),
      timeoutMs,
    );
    function done(fn: (a: unknown) => void, arg: unknown) {
      if (resolved) return; resolved = true; clearTimeout(to); try { ws.close(); } catch { /* */ } fn(arg);
    }
    ws.onopen = () => ws.send(JSON.stringify({ type: "auth:token", token }));
    ws.onmessage = (ev: MessageEvent) => {
      let m: Record<string, unknown>;
      try { m = JSON.parse(typeof ev.data === "string" ? ev.data : ""); } catch { return; }
      const t = typeof m?.type === "string" ? m.type : "";
      if (t === "ping") { try { ws.send(JSON.stringify({ type: "pong" })); } catch { /* */ } return; }
      if (/auth:error|unauthorized|token.*(invalid|expired)|invalid.*token/i.test(t + " " + (m?.error ?? ""))) {
        return done(reject, Object.assign(new Error("WS auth rechazado (¿BLU_JWT vencido?)"), { expired: true }));
      }
      if (t === "auth:ok") {
        authed = true;
        if (typeof m.token === "string") freshToken = m.token;
        try { ws.send(JSON.stringify(query)); } catch { /* */ }
        return;
      }
      if (t === "connected" || t === "pong") return;
      if (!authed) return;
      if (seen.length < 25 && t) seen.push(t);
      if (accept(m)) return done(resolve, { msg: m, freshToken });
    };
    ws.onerror = () => done(reject, new Error("WS error"));
    ws.onclose = () => { if (!resolved) done(reject, new Error("WS cerró antes de responder")); };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // Auth: service_role (tests internos) o JWT de staff. Permitido: management O rol con permiso
  // a "Mensajes Pro"/"Chatters QA" (can_use_blu_mp) — p.ej. Chatter Supervisor.
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json(req, { error: "unauthorized" }, 401);
  if (bearer !== SERVICE_KEY) {
    const { data: { user }, error } = await sb.auth.getUser(bearer);
    if (error || !user) return json(req, { error: "unauthorized" }, 401);
    const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", user.id);
    let ok = (roles ?? []).some((r: { role: string }) => ["admin", "owner", "manager"].includes(r.role));
    if (!ok) { const { data: can } = await sb.rpc("can_use_blu_mp", { p_uid: user.id }); ok = can === true; }
    if (!ok) return json(req, { error: "forbidden" }, 403);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* */ }
  const action = String(body.action ?? "");

  const { data: sess } = await sb.from("blu_session").select("token").eq("id", 1).maybeSingle();
  const token = (sess?.token as string | undefined) ?? Deno.env.get("BLU_JWT");
  if (!token) return json(req, { error: "sin token de sesión BLU (blu_session vacío)" }, 500);

  // Query EXACTA + cómo reconocer su respuesta (los tipos confirmados en la captura del owner).
  const rid = (p: string) => `${p}:${Date.now()}`;
  let query: Record<string, unknown>;
  let accept: (m: Record<string, unknown>) => boolean;
  switch (action) {
    case "models":
      query = { type: "agency:models:list" };
      accept = (m) => m.type === "agency:models:list" && Array.isArray(m.models);
      break;
    case "participants": {
      const modelId = Number(body.modelId);
      const offset = Number(body.offset ?? 0), limit = Number(body.limit ?? 30);
      if (!modelId) return json(req, { error: "modelId requerido" }, 400);
      query = { type: "messages-pro-get-participants", modelId, offset, limit, requestId: rid(`messages-pro-get-participants:${modelId}`) };
      accept = (m) => m.type === "messages-pro-get-participants" && !!m.data;
      break;
    }
    case "messages": {
      const modelId = Number(body.modelId), chatId = Number(body.chatId);
      const limit = Number(body.limit ?? 30), order = String(body.order ?? "desc");
      if (!modelId || !chatId) return json(req, { error: "modelId y chatId requeridos" }, 400);
      query = { type: "messages-pro-get-messages", modelId, chatId, limit, order, requestId: rid(`mp:messages-pro-get-messages:${modelId}:${chatId}`) };
      accept = (m) => m.type === "messages-pro-get-messages" && !!m.data;
      break;
    }
    case "fan-summary": {
      const modelId = Number(body.modelId), fanId = Number(body.fanId);
      if (!modelId || !fanId) return json(req, { error: "modelId y fanId requeridos" }, 400);
      query = { type: "fan:get-summary", fanId, modelId, requestId: rid(`${modelId}:${fanId}`) };
      accept = (m) => m.type === "fan:summary" && Number(m.fanId) === fanId;
      break;
    }
    // Masivos (queries capturadas por el owner). of-mass = OF mass (incl. externos de otro CRM,
    // source:'external', con `queued`=queueId); smart-messages = PRIORITY_MASS de BLU.
    case "of-mass": {
      const modelId = Number(body.modelId);
      if (!modelId) return json(req, { error: "modelId requerido" }, 400);
      query = { type: "agency:messages-pro:of-mass:list", modelId, requestId: rid(`of-mass:${modelId}`) };
      accept = (m) => m.type === "agency:messages-pro:of-mass:list";
      break;
    }
    case "smart-messages": {
      const modelId = Number(body.modelId);
      if (!modelId) return json(req, { error: "modelId requerido" }, 400);
      query = { type: "agency:messages-pro:smart-messages:list", modelId, requestId: rid(`smart:${modelId}`) };
      accept = (m) => m.type === "agency:messages-pro:smart-messages:list";
      break;
    }
    // Roster por ROL (queries capturadas por el owner). roles = catálogo de roles de la agencia
    // ({id,name,description,status,permissions}); employees = empleados ({id,fullName,email,group,
    // assignedCreators[]}) → fuente de verdad de quién es chatter (por rol, no por actividad).
    case "roles":
      query = { type: "agency:roles:list" };
      accept = (m) => m.type === "agency:roles:list" && Array.isArray(m.roles);
      break;
    case "employees":
      query = { type: "agency:employees:list" };
      accept = (m) => m.type === "agency:employees:list" && Array.isArray(m.employees);
      break;
    default:
      return json(req, { error: "action inválida (models|participants|messages|fan-summary|of-mass|smart-messages|roles|employees)" }, 400);
  }

  try {
    const { msg, freshToken } = await bluQuery(token, query, accept);
    // El auth:ok puede traer un token fresco → lo persistimos (idempotente; el micro también refresca).
    if (freshToken && freshToken !== token) {
      await sb.from("blu_session").upsert({ id: 1, token: freshToken, refreshed_at: new Date().toISOString() });
    }
    return json(req, { ok: true, data: msg });
  } catch (e) {
    const err = e as Error & { expired?: boolean };
    return json(req, { error: err.message, expired: !!err.expired }, err.expired ? 401 : 502);
  }
});

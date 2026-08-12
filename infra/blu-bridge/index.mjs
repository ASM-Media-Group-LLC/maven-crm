// blu-bridge — micro en Dokploy. Cada corrida (cada ~12h, < 24h de vida del token):
//   1) Toma el JWT de sesión: de la tabla blu_session (refrescado) o de BLU_JWT (seed inicial).
//   2) Conecta WS a BLU (wss://of.unlok.me/), manda auth:token. El server responde auth:ok
//      con un TOKEN FRESCO → lo guardamos en blu_session para la próxima corrida.
//      → AUTO-REFRESH: mientras las corridas no se espacien más de ~24h, el token nunca vence.
//   3) Pide agency:analytics:creator-reports UN DÍA A LA VEZ (gross), mapea metrics.*.grossAmount,
//      ingesta en Maven vía RPC import_blu_earnings.
//
// BLU sirve esto por WebSocket (no REST). AUTH = JWT de sesión del owner (HS256 ~24h):
//   seed inicial = secreto BLU_JWT en Dokploy; después el micro lo refresca solo del auth:ok.
//   Si el auth:ok no refrescara y el token venciera → loguea "renová BLU_JWT" (re-seedear).

import { createClient } from "@supabase/supabase-js";

const {
  BLU_JWT,
  BLU_JWT_MASSIVE,   // seed de la 2ª cuenta-agencia (Kash Massive); si falta, Massive NO se corre
  BLU_WS_URL = "wss://of.unlok.me/",
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  LOOKBACK_DAYS = "8",
  BACKFILL_DAYS = "0",   // >0: en el PRIMER run rellena ese nº de días hacia atrás (histórico, 1 sola vez)
  RESYNC_DAYS = "90",    // resync PESADO: re-jala los últimos N días → auto-corrige reembolsos/chargebacks
  RUN_EVERY_HOURS = "3", // cadencia LIVIANA: corre seguido y solo refresca el mes en curso (barato)
  RESYNC_EVERY_HOURS = "12", // cadencia del resync PESADO (90 días). Las corridas intermedias son livianas.
  // Desde cuándo pedirle a BLU el top-fans HISTÓRICO. El primer día con ingresos en Maven es
  // el 02/12/2025; se arranca antes por las dudas. Solo afecta al período 'alltime'.
  BLU_HISTORY_START = "2025-01-01",
  RUN_ONCE,
} = process.env;

function requireEnv(keys = ["BLU_JWT", "BLU_WS_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) throw new Error("Faltan env vars: " + missing.join(", "));
}

const sb = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function jwtExpMs(token) {
  try {
    const p = JSON.parse(Buffer.from(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return p.exp ? p.exp * 1000 : null;
  } catch { return null; }
}

// ── token de sesión POR CUENTA: blu_session[id] (refrescado) → seed inicial ──
// id 1 = plus (Kash Plus), id 2 = massive (Kash Massive). Cada cuenta tiene su
// fila propia + su seed (BLU_JWT / BLU_JWT_MASSIVE) y se auto-refresca sola. El
// id discrimina la cuenta (no hace falta columna extra en blu_session).
async function getToken(id, seed) {
  try {
    const { data } = await sb().from("blu_session").select("token").eq("id", id).maybeSingle();
    if (data?.token) return data.token;
  } catch (e) { console.error(`[blu-bridge] getToken(id=${id}) falló, uso seed:`, e.message); }
  return seed;
}
async function saveToken(id, token) {
  const { error } = await sb().from("blu_session").upsert({ id, token, refreshed_at: new Date().toISOString() });
  if (error) console.error("[blu-bridge] saveToken:", error.message);
}

const DAY = 86400000;
const ymd = (d) => d.toISOString().slice(0, 10);
const addDay = (d) => ymd(new Date(new Date(d + "T00:00:00.000Z").getTime() + DAY));
const daysBack = (n) => { const out = []; for (let i = n; i >= 0; i--) out.push(ymd(new Date(Date.now() - i * DAY))); return out; };
const chunk = (arr, size) => { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };

// Marca de tiempo del último resync PESADO (90 días). Las corridas livianas intermedias solo
// refrescan el mes en curso; cada RESYNC_EVERY_HOURS se hace uno pesado para corregir reembolsos.
const lastFullResyncMs = {};   // por cuenta (id → ms del último resync pesado)

// ── WS: auth (captura el token fresco del auth:ok) + pedir reportes día a día ──
async function fetchEarningsWS(token, days) {
  const { default: WS } = await import("ws");
  return await new Promise((resolve, reject) => {
    const ws = new WS(BLU_WS_URL);
    const results = [];
    let idx = 0, authed = false, resolved = false, freshToken = null;
    const timeoutMs = Math.max(120000, days.length * 4000);   // escala con el nº de días del chunk
    const to = setTimeout(() => done(reject, new Error(`WS timeout (${Math.round(timeoutMs / 1000)}s)`)), timeoutMs);
    function done(fn, arg) { if (resolved) return; resolved = true; clearTimeout(to); try { ws.close(); } catch {} fn(arg); }
    function queryNext() {
      if (idx >= days.length) return done(resolve, { results, freshToken });
      ws.send(JSON.stringify({ type: "agency:analytics:creator-reports", startDate: days[idx], endDate: addDay(days[idx]), groupBy: "day", earningsType: "gross" }));
    }
    ws.on("open", () => ws.send(JSON.stringify({ type: "auth:token", token })));
    ws.on("message", (data) => {
      let m; try { m = JSON.parse(data.toString()); } catch { return; }
      const t = typeof m.type === "string" ? m.type : "";
      if (/auth:error|unauthorized|token.*(invalid|expired)|invalid.*token/i.test(t + " " + (m.error || ""))) {
        return done(reject, Object.assign(new Error("WS auth rechazado (¿JWT vencido?): " + t), { expired: true }));
      }
      if (t === "auth:ok") { authed = true; if (m.token) freshToken = m.token; queryNext(); return; }
      if (t === "connected") return;     // saludo del server
      if (!authed) return;               // ignorar lo que llegue antes del auth:ok
      if (t === "agency:analytics:creator-reports" && m.range) {
        results.push({ date: days[idx], payload: m });
        idx++;
        queryNext();
      }
    });
    ws.on("error", (e) => done(reject, new Error("WS error: " + e.message)));
    ws.on("close", () => { if (!resolved) done(reject, new Error("WS cerró antes de terminar (¿auth?)")); });
  });
}

// ── WS: fan-reports. auth → agency:models:list → fan-reports:model POR MODELO.
//    Cada fan-reports:model cubre TODO el rango [startDate,endDate] (trends diarios) en 1 call.
async function fetchFanReportsWS(token, startDate, endDate) {
  const { default: WS } = await import("ws");
  return await new Promise((resolve, reject) => {
    const ws = new WS(BLU_WS_URL);
    const results = [];
    let modelIds = [], idx = 0, authed = false, gotModels = false, resolved = false, freshToken = null, seenTypes = 0;
    const hardTo = setTimeout(() => finish("timeout-hard"), 600000);   // tope absoluto
    let idleTo = null;
    function bumpIdle() {
      if (idleTo) clearTimeout(idleTo);
      idleTo = setTimeout(() => {
        // Sin actividad: si estábamos consultando modelos, saltar el atascado; si no, cerrar con lo que haya.
        if (gotModels && idx < modelIds.length) { console.error(`[blu-bridge] fan-reports: sin respuesta para modelId ${modelIds[idx]}, salto.`); idx++; queryNext(); }
        else finish("idle");
      }, 25000);
    }
    function clearTimers() { clearTimeout(hardTo); if (idleTo) clearTimeout(idleTo); }
    function finish(why) {   // SIEMPRE resuelve (parcial si hace falta) — no perder lo recolectado
      if (resolved) return; resolved = true; clearTimers();
      console.log(`[blu-bridge] fan-reports cierre (${why}): ${results.length}/${modelIds.length} modelos con data.`);
      try { ws.close(); } catch {}
      resolve({ results, freshToken });
    }
    function fail(err) { if (resolved) return; resolved = true; clearTimers(); try { ws.close(); } catch {} reject(err); }
    function queryNext() {
      if (idx >= modelIds.length) return finish("completo");
      ws.send(JSON.stringify({ type: "agency:analytics:fan-reports:model", modelId: modelIds[idx], startDate, endDate }));
      bumpIdle();
    }
    ws.on("open", () => { ws.send(JSON.stringify({ type: "auth:token", token })); bumpIdle(); });
    ws.on("message", (data) => {
      bumpIdle();
      let m; try { m = JSON.parse(data.toString()); } catch { return; }
      const t = typeof m.type === "string" ? m.type : "";
      if (t === "ping") { try { ws.send(JSON.stringify({ type: "pong" })); } catch {} return; }   // heartbeat app-level
      if (/auth:error|unauthorized|token.*(invalid|expired)|invalid.*token/i.test(t + " " + (m.error || ""))) {
        return fail(Object.assign(new Error("WS auth rechazado (¿JWT vencido?): " + t), { expired: true }));
      }
      if (t === "auth:ok") { authed = true; if (m.token) freshToken = m.token; console.log("[blu-bridge] fan-reports: auth ok → pido models:list"); ws.send(JSON.stringify({ type: "agency:models:list" })); return; }
      if (t === "connected" || t === "pong") return;
      if (!authed) return;
      if (t === "agency:models:list" && Array.isArray(m.models)) {
        if (gotModels) return;   // el server puede empujarla más de una vez
        modelIds = m.models.map((x) => x?.id).filter((x) => x != null);
        gotModels = true;
        console.log(`[blu-bridge] fan-reports: ${modelIds.length} modelos a consultar.`);
        return queryNext();
      }
      if (t === "agency:analytics:fan-reports:model") { if (m.model) results.push(m.model); idx++; return queryNext(); }
      if (seenTypes < 15) { seenTypes++; console.log(`[blu-bridge] fan-reports: msg '${t}' (ignorado)`); }   // diagnóstico
    });
    ws.on("error", (e) => fail(new Error("WS error: " + e.message)));
    ws.on("close", (code) => { if (!resolved) { console.error(`[blu-bridge] fan-reports: WS cerró (code ${code}) con ${results.length} modelos → resuelvo parcial.`); finish("cerró-server"); } });
  });
}

// employee-reports (chatters): auth → query exacta (la que dio el owner) → devuelve m.employees[]
// (cada uno con metrics + deltas). Maneja ping/pong app-level.
async function fetchEmployeeReports(token, startDate, endDate) {
  const { default: WS } = await import("ws");
  return await new Promise((resolve, reject) => {
    const ws = new WS(BLU_WS_URL);
    let authed = false, resolved = false, freshToken = null;
    const to = setTimeout(() => done(reject, new Error("WS timeout employee-reports (120s)")), 120000);
    function done(fn, arg) { if (resolved) return; resolved = true; clearTimeout(to); try { ws.close(); } catch {} fn(arg); }
    ws.on("open", () => ws.send(JSON.stringify({ type: "auth:token", token })));
    ws.on("message", (data) => {
      let m; try { m = JSON.parse(data.toString()); } catch { return; }
      const t = typeof m.type === "string" ? m.type : "";
      if (t === "ping") { try { ws.send(JSON.stringify({ type: "pong" })); } catch {} return; }
      if (/auth:error|unauthorized|token.*(invalid|expired)|invalid.*token/i.test(t + " " + (m.error || ""))) {
        return done(reject, Object.assign(new Error("WS auth rechazado (¿JWT vencido?): " + t), { expired: true }));
      }
      if (t === "auth:ok") {
        authed = true; if (m.token) freshToken = m.token;
        ws.send(JSON.stringify({ type: "agency:analytics:employee-reports", startDate, endDate, groupBy: "day", ranking: "descending", chatterOnly: false, creatorIds: [], employeeIds: [], groupIds: [], employeeFilterMode: "or", assignment: "all", recordsLimit: 5000 }));
        return;
      }
      if (!authed) return;
      if (t === "agency:analytics:employee-reports" && Array.isArray(m.employees)) {
        return done(resolve, { employees: m.employees, freshToken });
      }
    });
    ws.on("error", (e) => done(reject, new Error("WS error: " + e.message)));
    ws.on("close", () => { if (!resolved) done(reject, new Error("WS cerró antes de terminar (¿auth?)")); });
  });
}

// employee-reports POR DÍA: auth → loop de días sobre UN socket (como fetchEarningsWS), pide
// employee-reports [day, day+1) por día → cada respuesta trae el total de ESE día por chatter.
// Sirve para diarizar la venta por chatter (chatter_performance es solo snapshot mensual).
async function fetchEmployeeReportsDaily(token, days) {
  const { default: WS } = await import("ws");
  return await new Promise((resolve, reject) => {
    const ws = new WS(BLU_WS_URL);
    const results = [];
    let idx = 0, authed = false, resolved = false, freshToken = null;
    const timeoutMs = Math.max(120000, days.length * 4000);
    const to = setTimeout(() => done(reject, new Error(`WS timeout employee-daily (${Math.round(timeoutMs / 1000)}s)`)), timeoutMs);
    function done(fn, arg) { if (resolved) return; resolved = true; clearTimeout(to); try { ws.close(); } catch {} fn(arg); }
    function queryNext() {
      if (idx >= days.length) return done(resolve, { results, freshToken });
      // employee-reports es INCLUSIVO [start,end]: usar el MISMO día (no addDay) → 1 día por call.
      // Con addDay contaba [día, día+1] = 2 días y las ventanas consecutivas se solapaban (~2× la venta real).
      ws.send(JSON.stringify({ type: "agency:analytics:employee-reports", startDate: days[idx], endDate: days[idx], groupBy: "day", ranking: "descending", chatterOnly: false, creatorIds: [], employeeIds: [], groupIds: [], employeeFilterMode: "or", assignment: "all", recordsLimit: 5000 }));
    }
    ws.on("open", () => ws.send(JSON.stringify({ type: "auth:token", token })));
    ws.on("message", (data) => {
      let m; try { m = JSON.parse(data.toString()); } catch { return; }
      const t = typeof m.type === "string" ? m.type : "";
      if (t === "ping") { try { ws.send(JSON.stringify({ type: "pong" })); } catch {} return; }
      if (/auth:error|unauthorized|token.*(invalid|expired)|invalid.*token/i.test(t + " " + (m.error || ""))) {
        return done(reject, Object.assign(new Error("WS auth rechazado employee-daily: " + t), { expired: true }));
      }
      if (t === "auth:ok") { authed = true; if (m.token) freshToken = m.token; queryNext(); return; }
      if (!authed) return;
      if (t === "agency:analytics:employee-reports" && Array.isArray(m.employees)) {
        results.push({ date: days[idx], employees: m.employees });
        idx++;
        queryNext();
      }
    });
    ws.on("error", (e) => done(reject, new Error("WS error employee-daily: " + e.message)));
    ws.on("close", () => { if (!resolved) done(reject, new Error("WS cerró antes de terminar (employee-daily)")); });
  });
}

// ── SOPHIE (la AI de BLU; interno "persona-pro"): ventas/mensajes AI por modelo ──
// Contrato sacado del bundle de la app de escritorio (07/08): mismo WS, request
// {type:"persona-pro-stats-rollup", modelIds:"all", from, to} → {data:{models:[...]}}.
// Pedimos POR DÍA (un rollup por día sobre un socket) para diarizar "cuánto vendió
// Sophie ayer" — igual que employee-reports diario.
async function fetchSophieDailyWS(token, days) {
  const { default: WS } = await import("ws");
  return await new Promise((resolve, reject) => {
    const ws = new WS(BLU_WS_URL);
    const results = [];
    let idx = 0, authed = false, resolved = false, freshToken = null;
    const timeoutMs = Math.max(90000, days.length * 8000);
    const to = setTimeout(() => done(resolve, { results, freshToken, partial: true }), timeoutMs);   // parcial > nada
    function done(fn, arg) { if (resolved) return; resolved = true; clearTimeout(to); try { ws.close(); } catch {} fn(arg); }
    function queryNext() {
      if (idx >= days.length) return done(resolve, { results, freshToken });
      ws.send(JSON.stringify({
        type: "persona-pro-stats-rollup", modelIds: "all",
        from: `${days[idx]}T00:00:00.000Z`, to: `${days[idx]}T23:59:59.999Z`,
      }));
    }
    ws.on("open", () => ws.send(JSON.stringify({ type: "auth:token", token })));
    ws.on("message", (data) => {
      let m; try { m = JSON.parse(data.toString()); } catch { return; }
      const t = typeof m.type === "string" ? m.type : "";
      if (t === "ping") { try { ws.send(JSON.stringify({ type: "pong" })); } catch {} return; }
      if (/auth:error|unauthorized|token.*(invalid|expired)|invalid.*token/i.test(t + " " + (m.error || ""))) {
        return done(reject, Object.assign(new Error("WS auth rechazado (sophie): " + t), { expired: true }));
      }
      if (t === "auth:ok") { authed = true; if (m.token) freshToken = m.token; queryNext(); return; }
      if (t === "connected" || t === "pong") return;
      if (!authed) return;
      if (t === "persona-pro-stats-rollup") {
        if (m.error) console.error(`[blu-bridge] sophie rollup ${days[idx]}: ${String(m.error).slice(0, 120)}`);
        else results.push({ date: days[idx], models: Array.isArray(m?.data?.models) ? m.data.models : [] });
        idx++;
        return queryNext();
      }
    });
    ws.on("error", (e) => done(reject, new Error("WS error (sophie): " + e.message)));
    ws.on("close", () => { if (!resolved) done(resolve, { results, freshToken, partial: true }); });
  });
}

// {date, models[]} → filas sophie_daily_stats. Mapeo DEFENSIVO (el shape exacto del
// rollup se confirma con la primera corrida real) + raw jsonb para re-parsear sin
// re-pedir a BLU si algún campo viene con otro nombre. Solo días con actividad.
//
// ⚠️ 12/08: la primera corrida real devolvió "sophie: 0 filas en 8/8 días" — o sea
// que el WS conectó, autenticó y CONTESTÓ los ocho días sin un solo error… y salieron
// cero filas. Ese log confundía tres causas distintas en un mismo "0":
//   (a) BLU no manda modelos → Sophie de verdad no registró nada
//   (b) los manda pero todos con 0 ventas y 0 mensajes → el filtro los descarta
//   (c) los manda pero el campo del id se llama distinto → se saltean todos
// Y el `raw` jsonb, que existe justamente para re-parsear sin volver a pedirle a BLU,
// solo se guarda en filas INSERTADAS: con cero filas no quedaba ni rastro de lo que
// llegó. Estábamos ciegos, no rotos.
// Ahora la función devuelve además un diagnóstico con una MUESTRA del primer modelo
// visto, para que el próximo log diga cuál de las tres es sin otro ciclo de deploy.
function transformSophieDaily(results, account) {
  const rows = [];
  const diag = {
    dias_con_respuesta: 0, dias_con_modelos: 0, modelos_vistos: 0,
    descartados_sin_id: 0, descartados_sin_actividad: 0, id_no_numerico: 0,
    claves_del_modelo: null, muestra: null,
  };
  for (const { date, models } of (results || [])) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    diag.dias_con_respuesta++;
    const lista = Array.isArray(models) ? models : [];
    if (lista.length) diag.dias_con_modelos++;
    // Muestra del PRIMER modelo que aparezca en toda la corrida: es lo único que
    // permite ver el shape real sin volver a pedirle nada a BLU.
    if (!diag.muestra && lista.length) {
      diag.claves_del_modelo = Object.keys(lista[0] ?? {}).join(",");
      try { diag.muestra = JSON.stringify(lista[0]).slice(0, 400); } catch { /* circular */ }
    }
    for (const md of lista) {
      diag.modelos_vistos++;
      // Se amplían los alias: si BLU nombra distinto, no se pierde la fila entera.
      const id = md?.modelId ?? md?.id ?? md?.model_id ?? md?.personaId ?? md?.persona_id;
      if (id == null) { diag.descartados_sin_id++; continue; }
      // blu_model_id es BIGINT: un id no numérico haría fallar el upsert entero.
      // Se cuenta aparte para poder decirlo en el log en vez de tumbar la corrida.
      if (!Number.isFinite(Number(id))) { diag.id_no_numerico++; continue; }
      const tot = md.totals || md.stats || md.metrics || md;
      const sales = Number(tot.aiSales ?? tot.salesValue ?? tot.sales ?? tot.totalSales ?? tot.revenue ?? 0) || 0;
      const msgs = Number(tot.aiMessages ?? tot.messages ?? tot.messagesSent ?? tot.sentMessages ?? 0) || 0;
      if (sales <= 0 && msgs <= 0) { diag.descartados_sin_actividad++; continue; }
      rows.push({
        date, account, blu_model_id: Number(id),
        model_name: md.modelName ?? md.displayName ?? md.name ?? null,
        username: md.username ?? md.handle ?? null,
        ai_sales: sales, ai_messages: msgs,
        raw: md, updated_at: new Date().toISOString(),
      });
    }
  }
  return { rows, diag };
}

// {date, employees[]} por día → filas {blu_employee_id, date, total_sales, ...}. Solo con actividad.
function transformChatterDaily(results) {
  const rows = [];
  for (const { date, employees } of (results || [])) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    for (const e of (employees || [])) {
      if (e?.id == null) continue;
      const m = e.metrics || {};
      const sales = Number(m.totalSales) || 0;
      const sold = Number(m.soldMessages) || 0;
      if (sales <= 0 && sold <= 0) continue;   // sin actividad ese día → no guardamos fila
      rows.push({
        blu_employee_id: e.id, date, name: e.name ?? null,
        total_sales: sales, sold_messages: sold, fans_chatted: Number(m.fansChatted) || 0,
      });
    }
  }
  return rows;
}

// employee-reports.employees[] → filas de chatter_performance (metrics + deltas).
function transformChatters(employees) {
  const rows = [];
  for (const e of (employees || [])) {
    if (e?.id == null) continue;
    const m = e.metrics || {};
    rows.push({
      blu_employee_id: e.id, name: e.name ?? null, email: e.email ?? null,
      group_name: e.group?.name ?? null,
      is_chatter: typeof e.isChatter === "boolean" ? e.isChatter : null,
      total_sales: Number(m.totalSales) || 0, sold_messages: Number(m.soldMessages) || 0,
      direct_messages: Number(m.directMessages) || 0, fans_chatted: Number(m.fansChatted) || 0,
      fans_spent_money: Number(m.fansSpentMoney) || 0, fans_who_didnt_spend: Number(m.fansWhoDidntSpendMoney) || 0,
      fan_conversion_rate: m.fanConversionRate ?? null, avg_earnings_per_paying_fan: m.avgEarningsPerFanWhoSpentMoney ?? null,
      unlock_rate: m.unlockRate ?? null, avg_response_seconds: m.averageResponseSeconds ?? null,
      scheduled_hours: m.scheduledHours ?? null, clocked_hours: m.clockedHours ?? null,
      characters_sent: m.charactersSent ?? null, creators_count: m.creatorsCount ?? null,
      delta_total_sales: e.deltas?.totalSales ?? null,
      metrics: m, deltas: e.deltas ?? null,
    });
  }
  return rows;
}

// fan-reports:model → filas {blu_name, date, active_fans, new_fans}. Mismo blu_name que earnings
// (creator.username) → upsert sobre la MISMA fila (blu_creator_name+date).
function transformFans(models) {
  const rows = [];
  for (const md of (models || [])) {
    const name = String(md.creator?.username ?? md.creator?.name ?? md.aboutMe?.username ?? "").trim();
    if (!name) continue;
    const fr = md.fanReport || {};
    const byDate = {};
    for (const p of (fr.totalFansTrend || [])) {
      const d = String(p?.date ?? "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) (byDate[d] ||= {}).active_fans = Number(p.activeFans) || 0;
    }
    for (const p of (fr.newFansTrend || [])) {
      const d = String(p?.date ?? "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) (byDate[d] ||= {}).new_fans = Number(p.all) || 0;
    }
    for (const [date, v] of Object.entries(byDate)) {
      rows.push({ blu_name: name, date, active_fans: v.active_fans ?? null, new_fans: v.new_fans ?? null });
    }
  }
  return rows;
}

// fan-reports:model → ballenas (top fans) por modelo: md.modelId + md.fanReport.topFans[].
function transformTopFans(models) {
  const rows = [];
  for (const md of (models || [])) {
    const modelId = md?.modelId;
    const name = String(md.creator?.username ?? md.creator?.name ?? md.aboutMe?.username ?? "").trim();
    if (modelId == null || !name) continue;
    for (const f of (md.fanReport?.topFans || [])) {
      if (f?.userId == null) continue;
      rows.push({
        blu_model_id: modelId, blu_name: name,
        fan_user_id: f.userId, rank: f.rank ?? null,
        fan_name: f.name ?? null, fan_username: f.username ?? null,
        spent_gross: Number(f.spentGross ?? f.spent ?? 0) || 0,
        transactions: Number(f.transactions ?? 0) || 0,
        messages_gross: Number(f.messagesSpentGross ?? f.messagesSpent ?? 0) || 0,
        tips_gross: Number(f.tipsSpentGross ?? f.tipsSpent ?? 0) || 0,
        subscriptions_gross: Number(f.subscriptionsSpentGross ?? f.subscriptionsSpent ?? 0) || 0,
        ppv_gross: Number(f.ppvSpentGross ?? f.ppvSpent ?? 0) || 0,
        subscribed_at: f.subscribedAt ?? null, expires_at: f.expiresAt ?? null,
        is_active: typeof f.isActive === "boolean" ? f.isActive : null,
        subscription_length_days: f.subscriptionLengthDays ?? null,
      });
    }
  }
  return rows;
}

// fan-reports:model → retención por cohorte: md.fanReport.fanRetention[] (date, newFans, observedDays, afterDays[12]).
function transformRetention(models) {
  const rows = [];
  for (const md of (models || [])) {
    const modelId = md?.modelId;
    const name = String(md.creator?.username ?? md.creator?.name ?? md.aboutMe?.username ?? "").trim();
    if (modelId == null || !name) continue;
    for (const c of (md.fanReport?.fanRetention || [])) {
      const d = String(c?.date ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      rows.push({
        blu_model_id: modelId, blu_name: name, cohort_date: d,
        new_fans: Number(c.newFans) || 0, observed_days: Number(c.observedDays) || 0,
        after_days: Array.isArray(c.afterDays) ? c.afterDays : null,
      });
    }
  }
  return rows;
}

// ── Transformar a filas por creadora/día (gross) ──
function transform(results) {
  const rows = [];
  for (const { date, payload } of results) {
    for (const c of (payload.creators || [])) {
      const name = String(c.creator?.username ?? c.creator?.name ?? c.aboutMe?.username ?? "").trim();
      const m = c.metrics || {};
      const g = (k) => Number(m[k]?.grossAmount ?? m[k]?.amount ?? 0) || 0;
      const row = {
        blu_name: name, date,
        subscription: g("subscriptions"), tips: g("tips"), message: g("messages"),
        post: g("ppv"), referral: g("referrals"), stream: g("streaming"), total: g("total"),
        // Fase 1 (para Dashboard 2): métricas extra que BLU expone. g() devuelve 0 si falta.
        new_sub: g("newSubscriptions"), recurring_sub: g("recurringSubscriptions"),
        chargebacks: g("chargebacks"),
        contribution_pct: Number(m.contributionPercent ?? c.contributionPercent ?? 0) || 0,
      };
      if (name && /^\d{4}-\d{2}-\d{2}$/.test(date) && row.total > 0) rows.push(row);
    }
  }
  return rows;
}

async function ingest(rows) {
  if (!rows.length) return { rows: 0, note: "sin filas" };
  const { data, error } = await sb().rpc("import_blu_earnings", { p_rows: rows });
  if (error) throw new Error("import_blu_earnings: " + error.message);
  return data;
}

async function runOnce(acct, firstRun = false, quickDays = null) {
  requireEnv();
  let token = await getToken(acct.id, acct.seed);
  if (!token) { console.error(`[blu-bridge:${acct.account}] sin token (ni blu_session ni seed) → salto.`); return { rows: 0 }; }
  const expMs = jwtExpMs(token);
  if (expMs && Date.now() >= expMs) throw Object.assign(new Error(`token de sesión vencido (${acct.account})`), { expired: true });

  // DOS NIVELES (para correr seguido sin gastar): corrida LIVIANA = solo el mes en curso
  // (barata). RESYNC PESADO = los últimos RESYNC_DAYS, para que un reembolso/chargeback en un
  // día YA pasado se auto-corrija (el upsert idempotente sobreescribe). El pesado corre en el
  // PRIMER run y luego cada RESYNC_EVERY_HOURS; las corridas intermedias son livianas. En el
  // PRIMER run, si BACKFILL_DAYS>0, se extiende más atrás (histórico, 1 sola vez). Chunks de
  // 30 días → 1 conexión WS por chunk: resiliente (un chunk que falla no tumba el resto).
  // TERCER nivel (quickDays): sync ON-DEMAND ultra-liviano — solo hoy+ayer, disparado por
  // la cola blu_sync_requests (reportes que necesitan data fresca YA). No toca el
  // bookkeeping del resync pesado.
  const baseDays = Math.max(Number(LOOKBACK_DAYS), new Date().getUTCDate() + 1);   // mes en curso
  const doFull = quickDays == null && (firstRun || (Date.now() - (lastFullResyncMs[acct.id] || 0) >= (Number(RESYNC_EVERY_HOURS) || 12) * 3600000));
  if (doFull) lastFullResyncMs[acct.id] = Date.now();
  const rolling = doFull ? Math.max(baseDays, Number(RESYNC_DAYS) || 0) : baseDays;
  const backfill = firstRun && quickDays == null ? Number(BACKFILL_DAYS) || 0 : 0;
  const allDays = quickDays != null ? daysBack(quickDays) : daysBack(Math.max(rolling, backfill));
  const chunks = chunk(allDays, 30);
  console.log(`[blu-bridge:${acct.account}] conectando WS ${BLU_WS_URL}… ${quickDays != null ? "QUICK on-demand" : doFull ? "RESYNC pesado" : "liviano"}: ${allDays.length} días en ${chunks.length} chunk(s)${backfill ? ` (backfill ${backfill}d)` : ""}. (token exp ${expMs ? new Date(expMs).toISOString() : "?"})`);

  let totalRows = 0, sawCreators = false;
  const bluNamesSeen = new Set(); // nombres BLU vistos en ESTA cuenta → marcar kash_type (Massive/Plus)
  for (let ci = 0; ci < chunks.length; ci++) {
    const c = chunks[ci];
    try {
      const { results, freshToken } = await fetchEarningsWS(token, c);
      if (freshToken && freshToken !== token) { await saveToken(acct.id, freshToken); token = freshToken; }
      if (!sawCreators && results[0]) { console.log(`[blu-bridge] ≈${results[0].payload?.creators?.length ?? 0} creadoras/día.`); sawCreators = true; }
      const rows = transform(results);
      for (const r of rows) if (r.blu_name) bluNamesSeen.add(r.blu_name);
      if (rows.length) await ingest(rows);
      totalRows += rows.length;
      console.log(`[blu-bridge] chunk ${ci + 1}/${chunks.length} (${c[c.length - 1]}..${c[0]}): ${rows.length} filas.`);
    } catch (e) {
      if (e.expired) throw e;   // token vencido → abortar todo (re-seed)
      console.error(`[blu-bridge] chunk ${ci + 1}/${chunks.length} falló (sigo con los demás): ${e.message}`);
    }
  }
  console.log(`[blu-bridge] OK: ${totalRows} filas de ingresos ingestadas.`);

  // Marca la AGENCIA (kash_type) de las creadoras de ESTA cuenta: las que trajeron data
  // de la cuenta Massive → "Massive"; de la principal → "Plus". Llena sola la columna
  // "Agencia" del Listado. Best-effort: si falla, no tumba la corrida de ingresos.
  try {
    const tier = acct.account === "massive" ? "Massive" : "Plus";
    if (bluNamesSeen.size) {
      const { data: kn, error: kErr } = await sb().rpc("set_creator_kash_type_by_blu",
        { p_blu_names: [...bluNamesSeen], p_kash_type: tier });
      if (kErr) console.error(`[blu-bridge:${acct.account}] set_kash_type falló: ${kErr.message}`);
      else console.log(`[blu-bridge:${acct.account}] kash_type=${tier} marcado en ${kn} creadora(s).`);
    }
  } catch (e) { console.error(`[blu-bridge:${acct.account}] set_kash_type error: ${e.message}`); }

  // ── Fans (fan-reports:model): activeFans/newFans por creadora/día sobre TODO el rango.
  //    1 conexión WS, 1 call por modelo. Aislado: si falla, NO afecta los ingresos ya guardados.
  let fanRows = 0;
  try {
    const fanStart = allDays[0];                       // más viejo
    const fanEnd = allDays[allDays.length - 1];        // hoy
    const { results: fanModels, freshToken } = await fetchFanReportsWS(token, fanStart, fanEnd);
    if (freshToken && freshToken !== token) { await saveToken(acct.id, freshToken); token = freshToken; }
    const rows = transformFans(fanModels);
    for (const batch of chunk(rows, 2000)) {
      const { error } = await sb().rpc("import_blu_fans", { p_rows: batch });
      if (error) throw new Error("import_blu_fans: " + error.message);
    }
    fanRows = rows.length;
    console.log(`[blu-bridge] fans: ${fanModels.length} modelos → ${fanRows} filas (active_fans/new_fans).`);

    // ── Ballenas (top fans) — DOS períodos que conviven: MES EN CURSO e HISTÓRICO ──────
    // Antes se importaba UNA sola ventana: la del rango de esa corrida, y el RPC borraba lo
    // anterior. Como el sync on-demand ("quick") usa hoy+ayer, cualquier pedido de data
    // fresca dejaba a las creadoras con top-fans de 2 DÍAS (wanderslover: $19k facturados en
    // el mes, "top fan" $60). Ahora cada período se guarda con su period_kind y el borrado
    // va scopeado, así el mensual y el histórico no se pisan.
    //
    // En QUICK (on-demand) NO se tocan: un rango de 2 días no representa ni el mes ni el
    // histórico, y re-pedirlos a BLU en cada sync manual es caro al pedo.
    if (quickDays == null) {
      const hoy = allDays[allDays.length - 1];
      const inicioMes = `${hoy.slice(0, 7)}-01`;
      const periodos = [
        { kind: "month",   from: inicioMes,   to: hoy },
        { kind: "alltime", from: BLU_HISTORY_START, to: hoy },
      ];
      for (const p of periodos) {
        try {
          const { results: pm, freshToken: ft } = await fetchFanReportsWS(token, p.from, p.to);
          if (ft && ft !== token) { await saveToken(acct.id, ft); token = ft; }
          const rows2 = transformTopFans(pm);
          if (rows2.length) {
            const { error: e2 } = await sb().rpc("import_blu_top_fans",
              { p_rows: rows2, p_from: p.from, p_to: p.to, p_period_kind: p.kind });
            if (e2) throw new Error(e2.message);
          }
          console.log(`[blu-bridge] ballenas ${p.kind} (${p.from}..${p.to}): ${rows2.length} filas.`);
        } catch (e) {
          if (e.expired) throw e;
          // Un período que falla no debe tumbar al otro ni a la retención.
          console.error(`[blu-bridge] ballenas ${p.kind} falló: ${e.message}`);
        }
      }
    } else {
      console.log("[blu-bridge] ballenas: omitidas en sync QUICK (no representan mes ni histórico).");
    }
    // Retención por cohorte — misma respuesta. Ingesta POR MODELO (muchas cohortes; respeta delete-por-modelo).
    const retRows = transformRetention(fanModels);
    const byModel = {};
    for (const rr of retRows) (byModel[rr.blu_model_id] ||= []).push(rr);
    let retCount = 0;
    for (const modelRows of Object.values(byModel)) {
      const { error: rErr } = await sb().rpc("import_blu_fan_retention", { p_rows: modelRows, p_from: fanStart, p_to: fanEnd });
      if (rErr) throw new Error("import_blu_fan_retention: " + rErr.message);
      retCount += modelRows.length;
    }
    console.log(`[blu-bridge] retención: ${retCount} cohortes (${Object.keys(byModel).length} modelos).`);
  } catch (e) {
    if (e.expired) throw e;
    console.error(`[blu-bridge] fan-reports falló (no afecta ingresos): ${e.message}`);
  }

  // Chatters/chatter-daily SOLO en la cuenta principal (plus): employee-reports es a nivel AGENCIA
  // y import_blu_chatters es snapshot (delete+insert) → correrlo por 2 cuentas se pisaría.
  if (acct.account === "plus") {
  // Chatters (employee-reports): snapshot del MES EN CURSO. Aislado: si falla, no afecta el resto.
  try {
    const now2 = new Date();
    const chFrom = ymd(new Date(Date.UTC(now2.getUTCFullYear(), now2.getUTCMonth(), 1)));
    const chTo = ymd(now2);
    const { employees, freshToken } = await fetchEmployeeReports(token, chFrom, chTo);
    if (freshToken && freshToken !== token) { await saveToken(acct.id, freshToken); token = freshToken; }
    const chRows = transformChatters(employees);
    if (chRows.length) {
      const { error } = await sb().rpc("import_blu_chatters", { p_rows: chRows, p_from: chFrom, p_to: chTo });
      if (error) throw new Error("import_blu_chatters: " + error.message);
    }
    console.log(`[blu-bridge] chatters: ${chRows.length} ingestados (${chFrom}..${chTo}).`);
  } catch (e) {
    if (e.expired) throw e;
    console.error(`[blu-bridge] employee-reports falló (no afecta el resto): ${e.message}`);
  }

  // Chatters POR DÍA (employee-reports día a día) → chatter_daily_sales, para diarizar venta/ROI
  // del subtab Productividad por rango de fechas. 1 call WS por día (sin límite de 31 días).
  // Aislado: si falla, no afecta el snapshot mensual ni el resto.
  try {
    const chatterDays = daysBack(45);   // mes en curso + margen
    const { results, freshToken } = await fetchEmployeeReportsDaily(token, chatterDays);
    if (freshToken && freshToken !== token) { await saveToken(acct.id, freshToken); token = freshToken; }
    const dRows = transformChatterDaily(results);
    for (const batch of chunk(dRows, 2000)) {
      const { error } = await sb().rpc("import_blu_chatter_daily", { p_rows: batch });
      if (error) throw new Error("import_blu_chatter_daily: " + error.message);
    }
    console.log(`[blu-bridge] chatters/día: ${dRows.length} filas en ${chatterDays.length} días.`);
  } catch (e) {
    if (e.expired) throw e;
    console.error(`[blu-bridge] employee-reports diario falló (no afecta el resto): ${e.message}`);
  }

  } // fin chatters/chatter-daily (solo plus)

  // ── SOPHIE (AI de BLU) — en AMBAS cuentas (los modelos con Sophie viven en cada una).
  // Diario: 7 días atrás en corridas normales, hoy+ayer en QUICK. Aislado: si falla,
  // no afecta nada más. Upsert directo (PK date+account+blu_model_id).
  try {
    const sophieDays = quickDays != null ? daysBack(1) : daysBack(7);
    const { results: sr, freshToken: sft, partial } = await fetchSophieDailyWS(token, sophieDays);
    if (sft && sft !== token) { await saveToken(acct.id, sft); token = sft; }
    const { rows: sRows, diag } = transformSophieDaily(sr, acct.account);
    for (const batch of chunk(sRows, 500)) {
      const { error } = await sb().from("sophie_daily_stats")
        .upsert(batch, { onConflict: "date,account,blu_model_id" });
      if (error) throw new Error("sophie upsert: " + error.message);
    }
    console.log(`[blu-bridge:${acct.account}] sophie: ${sRows.length} filas en ${sr.length}/${sophieDays.length} días${partial ? " (parcial)" : ""}.`);
    // CERO FILAS NO ES UNA RESPUESTA: sin esto, "0 filas" tapaba por igual "Sophie no
    // vendió", "el filtro se los comió" y "el campo se llama distinto". El diagnóstico
    // solo se imprime cuando hace falta, así que no ensucia las corridas sanas.
    if (sRows.length === 0) {
      console.warn(
        `[blu-bridge:${acct.account}] sophie SIN FILAS — ` +
        `días con respuesta: ${diag.dias_con_respuesta}, con modelos: ${diag.dias_con_modelos}, ` +
        `modelos vistos: ${diag.modelos_vistos} (descartados: ${diag.descartados_sin_id} sin id, ` +
        `${diag.id_no_numerico} con id no numérico, ${diag.descartados_sin_actividad} sin actividad). ` +
        (diag.modelos_vistos === 0
          ? "BLU no devolvió ningún modelo: o Sophie no operó en esos días, o el rollup necesita otro parámetro."
          : `claves del modelo: [${diag.claves_del_modelo}] · muestra: ${diag.muestra}`),
      );
    }
  } catch (e) {
    if (e.expired) throw e;
    console.error(`[blu-bridge:${acct.account}] sophie falló (no afecta el resto): ${e.message}`);
  }

  return { rows: totalRows, fanRows };
}

function warnIfExpired(acct, e) {
  console.error(`[blu-bridge:${acct?.account ?? "?"}] error:`, e.message);
  if (e.expired) console.error(`[blu-bridge:${acct?.account ?? "?"}] ⚠ Renová el JWT (${acct?.account === "massive" ? "BLU_JWT_MASSIVE" : "BLU_JWT"}) desde BLU y re-seedeá el secreto en Dokploy.`);
}

// Cuentas a correr: plus SIEMPRE (seed BLU_JWT). Massive SOLO si hay seed BLU_JWT_MASSIVE
// → hasta que el owner lo setee en Dokploy, no se toca nada de Massive.
function buildAccounts() {
  const accts = [{ id: 1, account: "plus", seed: BLU_JWT }];
  if (BLU_JWT_MASSIVE) accts.push({ id: 2, account: "massive", seed: BLU_JWT_MASSIVE });
  return accts;
}
// Mutex simple: que un sync programado y uno on-demand no corran a la vez (dos WS
// simultáneos a BLU con el mismo token = comportamiento no probado; mejor secuencial).
let busy = false;
async function runAllAccounts(firstRun) {
  if (busy) { console.log("[blu-bridge] corrida programada saltada (hay un sync en curso)."); return; }
  busy = true;
  try {
    for (const acct of buildAccounts()) {
      try { await runOnce(acct, firstRun); }
      catch (e) { warnIfExpired(acct, e); }
    }
  } finally { busy = false; }
}

// ── Sync ON-DEMAND (cola blu_sync_requests) ──────────────────────────────────
// promolog-highlights (u otro caller service-role) inserta una fila 'pending' →
// acá la vemos (poll cada 20s), corremos una pasada QUICK (hoy+ayer, ~10-20s) y
// marcamos done/error. Pedidos viejos (>10 min) se marcan 'expired' (el caller ya
// no está esperando). Sin puertos HTTP: el micro solo habla con Supabase.
async function pollSyncRequests() {
  if (busy) return;
  let req = null;
  try {
    const tenMinAgo = new Date(Date.now() - 10 * 60000).toISOString();
    await sb().from("blu_sync_requests").update({ status: "expired", finished_at: new Date().toISOString() })
      .eq("status", "pending").lt("requested_at", tenMinAgo);
    const { data } = await sb().from("blu_sync_requests")
      .select("id").eq("status", "pending").gte("requested_at", tenMinAgo)
      .order("id", { ascending: true }).limit(1);
    req = data && data[0];
  } catch (e) { console.error("[blu-bridge] poll sync requests:", e.message); return; }
  if (!req) return;
  busy = true;
  console.log(`[blu-bridge] sync on-demand #${req.id} → QUICK (hoy+ayer)…`);
  try {
    await sb().from("blu_sync_requests").update({ status: "running", started_at: new Date().toISOString() }).eq("id", req.id);
    for (const acct of buildAccounts()) {
      try { await runOnce(acct, false, 1); }   // quickDays=1 → hoy + ayer
      catch (e) { warnIfExpired(acct, e); }
    }
    await sb().from("blu_sync_requests").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", req.id);
    console.log(`[blu-bridge] sync on-demand #${req.id} done.`);
  } catch (e) {
    await sb().from("blu_sync_requests").update({ status: "error", finished_at: new Date().toISOString(), note: String(e.message || e).slice(0, 200) }).eq("id", req.id)
      .then(() => {}, () => {});
    console.error(`[blu-bridge] sync on-demand #${req.id} error:`, e.message);
  } finally { busy = false; }
}

async function main() {
  if (RUN_ONCE) { await runAllAccounts(true); process.exit(0); return; }
  await runAllAccounts(true);   // primer run: pesado (90d) + backfill si BACKFILL_DAYS>0, por cuenta
  const hours = Math.max(1, Math.min(Number(RUN_EVERY_HOURS) || 3, 12));   // 1–12h; < 24h para refrescar el token
  console.log(`[blu-bridge] próxima corrida en ${hours}h (cuentas: ${buildAccounts().map((a) => a.account).join(", ")}) · cola on-demand cada 20s`);
  setInterval(() => runAllAccounts(false), hours * 3600000);
  setInterval(pollSyncRequests, 20000);
}

main();

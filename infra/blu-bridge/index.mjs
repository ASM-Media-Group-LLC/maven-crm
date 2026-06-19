// blu-bridge — micro en Dokploy. Cada día (o on-demand):
//   1) Conecta WS a BLU (wss://of.unlok.me/) y autentica con el JWT de sesión.
//   2) Pide el reporte de ingresos por modelo/día por el MISMO WS:
//        {type:"agency:analytics:creator-reports", startDate, endDate, groupBy:"day", earningsType:"gross"}
//   3) Recibe la respuesta (type:"agency:analytics:creator-reports" con 'range'), transforma e
//      ingesta en Maven vía RPC import_blu_earnings.
//
// BLU NO usa REST para esto: la data viaja por el WebSocket (protocolo de mensajes de la app).
// AUTH: BLU_JWT = sesión del owner (HS256, ~24h), SECRETO en Dokploy, rotación manual.
//   Vencido → la auth WS se rechaza / no llega respuesta → loguea "renová BLU_JWT".

import { createClient } from "@supabase/supabase-js";

const {
  BLU_JWT,
  BLU_WS_URL = "wss://of.unlok.me/",
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  LOOKBACK_DAYS = "8",
  RUN_EVERY_HOURS = "24",
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
function assertNotExpired() {
  const exp = jwtExpMs(BLU_JWT);
  if (exp && Date.now() >= exp) {
    throw Object.assign(new Error("BLU_JWT vencido. Renovalo a mano desde BLU y actualizá el secreto en Dokploy."), { expired: true });
  }
}

const ymd = (d) => d.toISOString().slice(0, 10);

// ── Traer el reporte de ingresos por el WebSocket ──
async function fetchEarningsWS() {
  const { default: WS } = await import("ws");
  const from = ymd(new Date(Date.now() - Number(LOOKBACK_DAYS) * 86400000));
  const end = ymd(new Date());
  return await new Promise((resolve, reject) => {
    const ws = new WS(BLU_WS_URL);
    const to = setTimeout(() => { try { ws.close(); } catch {} reject(new Error("WS: sin respuesta de creator-reports (timeout 45s)")); }, 45000);
    let queried = false, resolved = false;
    const done = (fn, arg) => { if (resolved) return; resolved = true; clearTimeout(to); try { ws.close(); } catch {} fn(arg); };
    ws.on("open", () => ws.send(JSON.stringify({ type: "auth:token", token: BLU_JWT })));
    ws.on("message", (data) => {
      let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
      const t = typeof msg.type === "string" ? msg.type : "";
      if (/unauthorized|auth:error|auth:fail|token.*(invalid|expired)|invalid.*token/i.test(t + " " + (msg.error || ""))) {
        return done(reject, Object.assign(new Error("WS auth rechazado (¿JWT vencido?): " + t), { expired: true }));
      }
      // El primer mensaje entrante confirma que la auth funcionó → pedimos el reporte.
      if (!queried) {
        queried = true;
        ws.send(JSON.stringify({ type: "agency:analytics:creator-reports", startDate: from, endDate: end, groupBy: "day", earningsType: "gross" }));
        console.log(`[blu-bridge] WS: pedido creator-reports ${from}..${end} (gross)`);
        return;
      }
      // La RESPUESTA a la query trae 'range' (la query saliente usa startDate/endDate).
      if (t === "agency:analytics:creator-reports" && msg.range) return done(resolve, msg);
    });
    ws.on("error", (e) => done(reject, new Error("WS error: " + e.message)));
    ws.on("close", () => { if (!resolved) done(reject, new Error("WS cerró antes de responder (¿auth?)")); });
  });
}

// ── Transformar la respuesta a las filas que espera import_blu_earnings ──
// Defensivo: maneja nested (creators→days) o flat. Ajustar a la forma real (se loguea en runOnce).
const num = (v) => Number(v) || 0;
function mapRow(name, d) {
  return {
    blu_name: name,
    date: String(d.date ?? d.day ?? "").slice(0, 10),
    subscription: num(d.subscriptions ?? d.subscription ?? d.subs),
    tips: num(d.tips),
    message: num(d.messages ?? d.message),
    post: num(d.posts ?? d.post),
    referral: num(d.referrals ?? d.referral),
    stream: num(d.streams ?? d.stream),
    total: num(d.total ?? d.gross ?? d.totalGross ?? d.earnings),
  };
}
function transform(payload) {
  const arr = payload.creators || payload.data || payload.rows || payload.report || payload.results || [];
  const out = [];
  for (const c of (Array.isArray(arr) ? arr : [])) {
    const name = String(c.creator ?? c.creatorName ?? c.name ?? c.username ?? c.modelUsername ?? c.modelLabel ?? "").trim();
    const days = c.days || c.daily || c.breakdown || c.dailyEarnings || c.earnings;
    if (Array.isArray(days)) { for (const d of days) out.push(mapRow(name, d)); }
    else if (c.date || c.day) { out.push(mapRow(name, c)); }
  }
  return out.filter((x) => x.blu_name && /^\d{4}-\d{2}-\d{2}$/.test(x.date));
}

async function ingest(rows) {
  if (!rows.length) return { rows: 0, note: "sin filas" };
  const { data, error } = await sb().rpc("import_blu_earnings", { p_rows: rows });
  if (error) throw new Error("import_blu_earnings: " + error.message);
  return data;
}

async function runOnce() {
  requireEnv();
  assertNotExpired();
  console.log(`[blu-bridge] conectando WS ${BLU_WS_URL}…`);
  const payload = await fetchEarningsWS();
  // Loguear la forma para poder afinar transform() con la estructura real.
  console.log(`[blu-bridge] respuesta keys:`, JSON.stringify(Object.keys(payload)));
  const arr = payload.creators || payload.data || payload.rows || payload.report || payload.results || [];
  console.log(`[blu-bridge] muestra 1er elemento:`, JSON.stringify(Array.isArray(arr) ? arr[0] : arr).slice(0, 700));
  const rows = transform(payload);
  console.log(`[blu-bridge] ${rows.length} filas parseadas → ingestando…`);
  const result = await ingest(rows);
  console.log(`[blu-bridge] OK:`, JSON.stringify(result));
  return result;
}

function warnIfExpired(e) {
  console.error("[blu-bridge] error:", e.message);
  if (e.expired) console.error("[blu-bridge] ⚠ Renová BLU_JWT desde BLU y actualizá el secreto en Dokploy.");
}

async function main() {
  if (RUN_ONCE) {
    try { await runOnce(); process.exit(0); }
    catch (e) { warnIfExpired(e); process.exit(e.expired ? 2 : 1); }
    return;
  }
  const tick = () => runOnce().catch(warnIfExpired);
  await tick();
  console.log(`[blu-bridge] próxima corrida en ${RUN_EVERY_HOURS}h`);
  setInterval(tick, Number(RUN_EVERY_HOURS) * 3600000);
}

main();

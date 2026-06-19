// blu-bridge — micro en Dokploy. Cada día (o on-demand):
//   1) Conecta WS a BLU (wss://of.unlok.me/) y autentica con el JWT de sesión (auth:token).
//   2) Por el MISMO WS, pide el reporte de ingresos UN DÍA A LA VEZ (para tener granularidad
//      diaria): {type:"agency:analytics:creator-reports", startDate:D, endDate:D+1, groupBy:"day", earningsType:"gross"}.
//   3) De cada creadora toma metrics.{subscriptions,tips,messages,ppv,referrals,streaming,total}.grossAmount
//      y arma 1 fila por creadora/día → ingesta en Maven vía RPC import_blu_earnings.
//
// BLU sirve esto por WebSocket (no REST). AUTH: BLU_JWT = sesión del owner (HS256, ~24h),
// SECRETO en Dokploy, rotación manual. Vencido → auth WS rechazada → loguea "renová BLU_JWT".

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

const DAY = 86400000;
const ymd = (d) => d.toISOString().slice(0, 10);
const addDay = (d) => ymd(new Date(new Date(d + "T00:00:00.000Z").getTime() + DAY));

// ── Pedir el reporte por el WS, UN DÍA A LA VEZ, reusando una sola conexión ──
async function fetchEarningsWS() {
  const { default: WS } = await import("ws");
  const days = [];
  for (let i = Number(LOOKBACK_DAYS); i >= 0; i--) days.push(ymd(new Date(Date.now() - i * DAY)));
  return await new Promise((resolve, reject) => {
    const ws = new WS(BLU_WS_URL);
    const results = [];           // [{ date, payload }]
    let idx = 0, authed = false, resolved = false;
    const to = setTimeout(() => done(reject, new Error("WS timeout (90s)")), 90000);
    function done(fn, arg) { if (resolved) return; resolved = true; clearTimeout(to); try { ws.close(); } catch {} fn(arg); }
    function queryNext() {
      if (idx >= days.length) return done(resolve, results);
      const d = days[idx];
      ws.send(JSON.stringify({ type: "agency:analytics:creator-reports", startDate: d, endDate: addDay(d), groupBy: "day", earningsType: "gross" }));
    }
    ws.on("open", () => ws.send(JSON.stringify({ type: "auth:token", token: BLU_JWT })));
    ws.on("message", (data) => {
      let m; try { m = JSON.parse(data.toString()); } catch { return; }
      const t = typeof m.type === "string" ? m.type : "";
      if (/unauthorized|auth:error|auth:fail|token.*(invalid|expired)|invalid.*token/i.test(t + " " + (m.error || ""))) {
        return done(reject, Object.assign(new Error("WS auth rechazado (¿JWT vencido?): " + t), { expired: true }));
      }
      if (!authed) { authed = true; queryNext(); return; }   // primer mensaje = auth OK
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

// ── Transformar a las filas que espera import_blu_earnings (1 por creadora/día) ──
function transform(results) {
  const rows = [];
  for (const { date, payload } of results) {
    for (const c of (payload.creators || [])) {
      const name = String(c.creator?.username ?? c.creator?.name ?? c.aboutMe?.username ?? "").trim();
      const m = c.metrics || {};
      const g = (k) => Number(m[k]?.grossAmount ?? m[k]?.amount ?? 0) || 0;
      const row = {
        blu_name: name, date,
        subscription: g("subscriptions"),
        tips: g("tips"),
        message: g("messages"),
        post: g("ppv"),            // PPV = posts pagos en OF
        referral: g("referrals"),
        stream: g("streaming"),
        total: g("total"),
      };
      // guardar solo días con algún ingreso (evita inundar de ceros; el upsert es idempotente)
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

async function runOnce() {
  requireEnv();
  assertNotExpired();
  console.log(`[blu-bridge] conectando WS ${BLU_WS_URL}…`);
  const results = await fetchEarningsWS();
  const creators0 = results[0]?.payload?.creators?.length ?? 0;
  console.log(`[blu-bridge] ${results.length} días traídos (≈${creators0} creadoras/día).`);
  const rows = transform(results);
  console.log(`[blu-bridge] ${rows.length} filas con ingreso → ingestando…`);
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

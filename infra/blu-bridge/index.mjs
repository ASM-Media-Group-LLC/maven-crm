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
  BLU_WS_URL = "wss://of.unlok.me/",
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  LOOKBACK_DAYS = "8",
  RUN_EVERY_HOURS = "12",
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

// ── token de sesión: blu_session (refrescado) → BLU_JWT (seed) ──
async function getToken() {
  try {
    const { data } = await sb().from("blu_session").select("token").eq("id", 1).maybeSingle();
    if (data?.token) return data.token;
  } catch (e) { console.error("[blu-bridge] getToken falló, uso BLU_JWT:", e.message); }
  return BLU_JWT;
}
async function saveToken(token) {
  const { error } = await sb().from("blu_session").upsert({ id: 1, token, refreshed_at: new Date().toISOString() });
  if (error) console.error("[blu-bridge] saveToken:", error.message);
}

const DAY = 86400000;
const ymd = (d) => d.toISOString().slice(0, 10);
const addDay = (d) => ymd(new Date(new Date(d + "T00:00:00.000Z").getTime() + DAY));

// ── WS: auth (captura el token fresco del auth:ok) + pedir reportes día a día ──
async function fetchEarningsWS(token) {
  const { default: WS } = await import("ws");
  const days = [];
  for (let i = Number(LOOKBACK_DAYS); i >= 0; i--) days.push(ymd(new Date(Date.now() - i * DAY)));
  return await new Promise((resolve, reject) => {
    const ws = new WS(BLU_WS_URL);
    const results = [];
    let idx = 0, authed = false, resolved = false, freshToken = null;
    const to = setTimeout(() => done(reject, new Error("WS timeout (120s)")), 120000);
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

async function runOnce() {
  requireEnv();
  const token = await getToken();
  const expMs = jwtExpMs(token);
  if (expMs && Date.now() >= expMs) throw Object.assign(new Error("token de sesión vencido"), { expired: true });
  console.log(`[blu-bridge] conectando WS ${BLU_WS_URL}… (token exp ${expMs ? new Date(expMs).toISOString() : "?"})`);
  const { results, freshToken } = await fetchEarningsWS(token);
  if (freshToken && freshToken !== token) {
    await saveToken(freshToken);
    const ne = jwtExpMs(freshToken);
    console.log(`[blu-bridge] 🔄 token refrescado por auth:ok (nuevo exp ${ne ? new Date(ne).toISOString() : "?"}).`);
  } else {
    console.log(`[blu-bridge] auth:ok refresh: ${freshToken ? "mismo token (no extiende)" : "sin token"}.`);
  }
  const creators0 = results[0]?.payload?.creators?.length ?? 0;
  console.log(`[blu-bridge] ${results.length} días (≈${creators0} creadoras/día).`);
  const rows = transform(results);
  console.log(`[blu-bridge] ${rows.length} filas con ingreso → ingestando…`);
  const result = await ingest(rows);
  console.log(`[blu-bridge] OK:`, JSON.stringify(result));
  return result;
}

function warnIfExpired(e) {
  console.error("[blu-bridge] error:", e.message);
  if (e.expired) console.error("[blu-bridge] ⚠ Renová BLU_JWT desde BLU y actualizá el secreto en Dokploy (re-seed).");
}

async function main() {
  if (RUN_ONCE) {
    try { await runOnce(); process.exit(0); }
    catch (e) { warnIfExpired(e); process.exit(e.expired ? 2 : 1); }
    return;
  }
  const tick = () => runOnce().catch(warnIfExpired);
  await tick();
  const hours = Math.min(Number(RUN_EVERY_HOURS) || 12, 12);   // < 24h de vida del token, para refrescar a tiempo
  console.log(`[blu-bridge] próxima corrida en ${hours}h`);
  setInterval(tick, hours * 3600000);
}

main();

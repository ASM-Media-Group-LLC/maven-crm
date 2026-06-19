// blu-bridge — micro en Dokploy. Cada día (o on-demand):
//   1) (opcional) handshake WS de auth con el JWT de sesión (si BLU_WS_URL está seteado).
//   2) GET del reporte de ingresos por modelo/día (REST, Authorization: Bearer <JWT>).
//   3) Transforma e ingesta en Maven vía RPC import_blu_earnings.
//
// AUTH: BLU_JWT es la SESIÓN del owner (HS256, ~24h). Lo provee el owner como SECRETO en
// Dokploy y lo ROTA A MANO cada 24h. El micro NO crea sesión ni bypassa el login biométrico:
// solo reusa el token vigente. Si venció → 401/403 → loguea claro y (en RUN_ONCE) sale != 0.
//
// Falta confirmar UNA vez con BLU_PROBE=1: el host/base + BLU_EARNINGS_PATH + la forma del JSON.

import { createClient } from "@supabase/supabase-js";

const {
  BLU_JWT,
  BLU_API_BASE = "https://of.unlok.me",
  BLU_EARNINGS_PATH = "/api/earnings",   // CONFIRMAR con BLU_PROBE
  BLU_WS_URL,                            // opcional: si está, hace el handshake de auth primero
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  LOOKBACK_DAYS = "8",
  RUN_EVERY_HOURS = "24",
  RUN_ONCE,
  BLU_PROBE,
} = process.env;

function requireEnv(keys = ["BLU_JWT", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) throw new Error("Faltan env vars: " + missing.join(", "));
}

const sb = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── JWT: chequear expiración (claim exp, público) sin verificar firma ──
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

// ── (opcional) handshake WS: { type:"auth:token", token } → primer mensaje = ack ──
async function wsAuth() {
  if (!BLU_WS_URL) return;
  const { default: WS } = await import("ws");
  await new Promise((resolve, reject) => {
    const ws = new WS(BLU_WS_URL);
    const to = setTimeout(() => { try { ws.close(); } catch {} reject(new Error("WS auth timeout")); }, 10000);
    ws.on("open", () => ws.send(JSON.stringify({ type: "auth:token", token: BLU_JWT })));
    ws.on("message", (data) => {
      const txt = data.toString();
      clearTimeout(to); try { ws.close(); } catch {}
      if (/error|unauthorized|401|403|expired|invalid/i.test(txt)) {
        return reject(Object.assign(new Error("WS auth rechazado (¿token vencido?): " + txt.slice(0, 200)), { expired: true }));
      }
      resolve();
    });
    ws.on("error", (e) => { clearTimeout(to); reject(new Error("WS error: " + e.message)); });
  });
}

async function getJson(base, path, params) {
  const url = new URL(base.replace(/\/$/, "") + path);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${BLU_JWT}`, Accept: "application/json" } });
  if (resp.status === 401 || resp.status === 403) {
    throw Object.assign(new Error(`BLU ${resp.status}: token inválido/vencido — rotá BLU_JWT`), { expired: true });
  }
  return { status: resp.status, text: await resp.text().catch(() => "") };
}

async function fetchEarnings() {
  const to = new Date(), from = new Date(Date.now() - Number(LOOKBACK_DAYS) * 86400000);
  const { status, text } = await getJson(BLU_API_BASE, BLU_EARNINGS_PATH, { from: ymd(from), to: ymd(to) });
  if (status >= 400) throw new Error(`BLU ${status} en ${BLU_EARNINGS_PATH}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// ── PROBE (BLU_PROBE=1): tantea host+endpoints con el JWT y loguea status + forma. No ingesta. ──
async function probe() {
  const bases = [...new Set([BLU_API_BASE.replace(/\/$/, ""), "https://of.unlok.me", "https://app.blu.luxe"])];
  const paths = [...new Set([BLU_EARNINGS_PATH, "/api/earnings", "/api/creator-earnings/daily", "/api/v1/earnings",
    "/api/gross-earnings", "/api/net-earnings", "/api/creator-reports", "/api/me", "/api/health"])];
  const to = new Date(), from = new Date(Date.now() - Number(LOOKBACK_DAYS) * 86400000);
  for (const base of bases) for (const path of paths) {
    try {
      const { status, text } = await getJson(base, path, { from: ymd(from), to: ymd(to) });
      let shape = "";
      try { const j = JSON.parse(text); shape = " claves:" + JSON.stringify(Object.keys(Array.isArray(j) ? (j[0] ?? {}) : j)); } catch {}
      console.log(`[probe] ${status} ${base}${path}${shape}\n   ${text.slice(0, 280)}`);
    } catch (e) { console.log(`[probe] ERR ${base}${path}: ${e.message}`); }
  }
}

// ── Transformar la respuesta de BLU a las filas que espera import_blu_earnings ──
// (defensivo con los nombres de campos — ajustar tras ver el PROBE real)
function transform(payload) {
  const raw = Array.isArray(payload) ? payload
    : Array.isArray(payload?.data) ? payload.data
    : Array.isArray(payload?.rows) ? payload.rows
    : Array.isArray(payload?.earnings) ? payload.earnings : [];
  return raw.map((r) => ({
    blu_name: String(r.creator ?? r.creator_name ?? r.model ?? r.name ?? "").trim(),
    date: String(r.date ?? r.day ?? "").slice(0, 10),
    subscription: Number(r.subscriptions_earnings ?? r.subscription_gross ?? r.subscription ?? 0) || 0,
    tips: Number(r.tips_earnings ?? r.tips_gross ?? r.tips ?? 0) || 0,
    message: Number(r.messages_earnings ?? r.message_gross ?? r.message ?? 0) || 0,
    post: Number(r.posts_earnings ?? r.post_gross ?? r.post ?? 0) || 0,
    referral: Number(r.referrals_earnings ?? r.referral_gross ?? r.referral ?? 0) || 0,
    stream: Number(r.stream_gross ?? r.stream ?? 0) || 0,
    total: Number(r.total_earnings ?? r.total_gross ?? r.total ?? 0) || 0,
  })).filter((x) => x.blu_name && /^\d{4}-\d{2}-\d{2}$/.test(x.date));
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
  await wsAuth();
  console.log(`[blu-bridge] fetch earnings (últimos ${LOOKBACK_DAYS}d)…`);
  const payload = await fetchEarnings();
  console.log(`[blu-bridge] forma:`, Array.isArray(payload) ? `array[${payload.length}]` : JSON.stringify(Object.keys(payload ?? {})));
  const rows = transform(payload);
  console.log(`[blu-bridge] ${rows.length} filas → ingestando…`);
  const result = await ingest(rows);
  console.log(`[blu-bridge] OK:`, JSON.stringify(result));
  return result;
}

function warnIfExpired(e) {
  console.error("[blu-bridge] error:", e.message);
  if (e.expired) console.error("[blu-bridge] ⚠ Renová BLU_JWT desde BLU y actualizá el secreto en Dokploy.");
}

async function main() {
  if (BLU_PROBE) {
    try { requireEnv(["BLU_JWT"]); assertNotExpired(); await wsAuth(); await probe(); console.log("[blu-bridge] PROBE listo. Seteá BLU_API_BASE/BLU_EARNINGS_PATH + ajustá transform() y quitá BLU_PROBE."); }
    catch (e) { warnIfExpired(e); }
    process.exit(0); return;
  }
  if (RUN_ONCE) {
    try { await runOnce(); process.exit(0); }
    catch (e) { warnIfExpired(e); process.exit(e.expired ? 2 : 1); }
    return;
  }
  // long-running (modo Application de Dokploy): corrida al arranque + cada RUN_EVERY_HOURS.
  // No crashea ante error/token vencido: loguea y espera al próximo tick (para entonces puede estar rotado).
  const tick = () => runOnce().catch(warnIfExpired);
  await tick();
  console.log(`[blu-bridge] próxima corrida en ${RUN_EVERY_HOURS}h`);
  setInterval(tick, Number(RUN_EVERY_HOURS) * 3600000);
}

main();

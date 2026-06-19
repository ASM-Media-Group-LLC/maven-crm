// blu-bridge — micro que corre en Dokploy. Cada día (o on-demand):
//   1) Autentica contra Cognito (SRP) con un USUARIO DE SERVICIO de BLU (email+pass por env).
//   2) Jala el reporte de ingresos diario de BLU (app.blu.luxe/api/...).
//   3) Lo transforma a filas e ingesta en Maven vía la RPC import_blu_earnings.
//
// NADA de credenciales en el código: todo por env (en Dokploy → Environment / Secrets).
// El owner provee: la config pública de Cognito (pool/client) + un usuario de servicio
// de BLU (email+pass) como secreto. Ver README.md.
//
// Estado: esqueleto funcional. Lo único por confirmar con un request real de BLU:
//   - BLU_EARNINGS_PATH (el endpoint exacto) y sus query params.
//   - La FORMA del JSON de respuesta → mapearla en transform() (hay un TODO marcado).

import { createClient } from "@supabase/supabase-js";
import { CognitoUserPool, CognitoUser, AuthenticationDetails } from "amazon-cognito-identity-js";

// ── Config (env) ──────────────────────────────────────────────────────────────
const {
  // Cognito (config PÚBLICA — del bundle de BLU)
  BLU_USER_POOL_ID,            // ej. us-east-1_AbCd1234   (la región sale del prefijo)
  BLU_CLIENT_ID,               // ej. 7xxxxxxxxxxxxxxxxxxxxxxxxx
  // Credenciales del usuario de servicio (SECRETOS)
  BLU_USERNAME,                // email del usuario dedicado de BLU
  BLU_PASSWORD,                // su password
  // API de BLU
  BLU_API_BASE = "https://app.blu.luxe",
  BLU_EARNINGS_PATH = "/api/of-creator-reports",   // TODO: confirmar con un request real
  // Maven (service_role → bypassa RLS; la RPC permite service_role)
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  // Operación
  LOOKBACK_DAYS = "8",         // cuántos días hacia atrás traer cada corrida
  RUN_EVERY_HOURS = "24",
  RUN_ONCE,
  BLU_PROBE,                   // si =1: solo autentica + tantea endpoints candidatos y sale (recon)
} = process.env;

function requireEnv(keys = ["BLU_USER_POOL_ID", "BLU_CLIENT_ID", "BLU_USERNAME", "BLU_PASSWORD", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) throw new Error("Faltan env vars: " + missing.join(", "));
}

const sb = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── 1) Login Cognito (SRP, no requiere habilitar USER_PASSWORD_AUTH) ──────────
function cognitoLogin() {
  const pool = new CognitoUserPool({ UserPoolId: BLU_USER_POOL_ID, ClientId: BLU_CLIENT_ID });
  const user = new CognitoUser({ Username: BLU_USERNAME, Pool: pool });
  const details = new AuthenticationDetails({ Username: BLU_USERNAME, Password: BLU_PASSWORD });
  return new Promise((resolve, reject) => {
    user.authenticateUser(details, {
      onSuccess: (session) => resolve({
        idToken: session.getIdToken().getJwtToken(),
        accessToken: session.getAccessToken().getJwtToken(),
      }),
      onFailure: (err) => reject(new Error("Cognito login falló: " + (err?.message ?? err))),
      newPasswordRequired: () => reject(new Error("El usuario de BLU requiere cambio de password; logueate una vez en BLU y poné una definitiva.")),
    });
  });
}

// ── 2) Traer el reporte de ingresos de BLU ────────────────────────────────────
function ymd(d) { return d.toISOString().slice(0, 10); }

async function fetchEarnings(idToken) {
  const to = new Date();
  const from = new Date(Date.now() - Number(LOOKBACK_DAYS) * 86400000);
  const url = new URL(BLU_API_BASE.replace(/\/$/, "") + BLU_EARNINGS_PATH);
  // TODO: confirmar los nombres de los params con un request real de BLU.
  url.searchParams.set("from", ymd(from));
  url.searchParams.set("to", ymd(to));
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}`, Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`BLU ${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 300)}`);
  return resp.json();
}

// ── Recon (BLU_PROBE=1): tantea endpoints candidatos y loguea status + forma ──
// No ingesta nada. Sirve para confirmar BLU_EARNINGS_PATH y la forma del JSON SIN
// pelear con el DevTools de BLU: lee los logs de Dokploy y ajustá transform().
async function probe(idToken) {
  const candidates = [
    BLU_EARNINGS_PATH,
    "/api/of-creator-reports", "/api/gross-earnings", "/api/net-earnings",
    "/api/of-statistics", "/api/of-mass-statistics", "/api/avg-earnings",
  ].filter((p, i, a) => a.indexOf(p) === i);
  const to = new Date();
  const from = new Date(Date.now() - Number(LOOKBACK_DAYS) * 86400000);
  for (const path of candidates) {
    const url = new URL(BLU_API_BASE.replace(/\/$/, "") + path);
    url.searchParams.set("from", ymd(from));
    url.searchParams.set("to", ymd(to));
    try {
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${idToken}`, Accept: "application/json" } });
      const text = await resp.text().catch(() => "");
      let shape = "";
      try { const j = JSON.parse(text); shape = " | claves: " + JSON.stringify(Object.keys(Array.isArray(j) ? (j[0] ?? {}) : j)); } catch {}
      console.log(`[probe] ${resp.status} ${path}${shape}\n   ${text.slice(0, 400)}`);
    } catch (e) {
      console.log(`[probe] ERR ${path}: ${e.message}`);
    }
  }
}

// ── 3) Transformar la respuesta de BLU a las filas que espera import_blu_earnings ──
// TODO: ajustar al JSON REAL de BLU (hoy es la forma esperada del export "Detail":
//   ingreso por modelo POR DÍA). Cada fila: { blu_name, date, subscription, tips,
//   message, post, referral, stream, total }.
function transform(payload) {
  // Heurística defensiva: aceptar payload.data | payload.rows | payload (array).
  const raw = Array.isArray(payload) ? payload
    : Array.isArray(payload?.data) ? payload.data
    : Array.isArray(payload?.rows) ? payload.rows
    : [];
  return raw.map((r) => ({
    blu_name: String(r.creator ?? r.creator_name ?? r.name ?? "").trim(),
    date: String(r.date ?? r.day ?? "").slice(0, 10),
    subscription: Number(r.subscription_gross ?? r.subscription ?? 0) || 0,
    tips: Number(r.tips_gross ?? r.tips ?? 0) || 0,
    message: Number(r.message_gross ?? r.message ?? 0) || 0,
    post: Number(r.post_gross ?? r.post ?? 0) || 0,
    referral: Number(r.referral_gross ?? r.referral ?? 0) || 0,
    stream: Number(r.stream_gross ?? r.stream ?? 0) || 0,
    total: Number(r.total_gross ?? r.total ?? 0) || 0,
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
  console.log(`[blu-bridge] login…`);
  const { idToken } = await cognitoLogin();
  console.log(`[blu-bridge] fetch earnings (últimos ${LOOKBACK_DAYS}d)…`);
  const payload = await fetchEarnings(idToken);
  console.log(`[blu-bridge] forma payload:`, Array.isArray(payload) ? `array[${payload.length}]` : JSON.stringify(Object.keys(payload ?? {})));
  const rows = transform(payload);
  console.log(`[blu-bridge] ${rows.length} filas parseadas → ingestando…`);
  const result = await ingest(rows);
  console.log(`[blu-bridge] ingesta OK:`, JSON.stringify(result));
  return result;
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
async function main() {
  if (BLU_PROBE) {
    try {
      requireEnv(["BLU_USER_POOL_ID", "BLU_CLIENT_ID", "BLU_USERNAME", "BLU_PASSWORD"]);
      console.log(`[blu-bridge] PROBE: login…`);
      const { idToken } = await cognitoLogin();
      await probe(idToken);
      console.log(`[blu-bridge] PROBE listo. Ajustá BLU_EARNINGS_PATH/transform() con lo de arriba y quitá BLU_PROBE.`);
    } catch (e) { console.error("[blu-bridge] PROBE error:", e.message); }
    process.exit(0);
    return;
  }
  try { await runOnce(); }
  catch (e) { console.error("[blu-bridge] error:", e.message); if (RUN_ONCE) process.exit(1); }
  if (RUN_ONCE) { process.exit(0); return; }
  const everyMs = Number(RUN_EVERY_HOURS) * 3600000;
  console.log(`[blu-bridge] próxima corrida en ${RUN_EVERY_HOURS}h`);
  setInterval(() => { runOnce().catch((e) => console.error("[blu-bridge] error:", e.message)); }, everyMs);
}

main();

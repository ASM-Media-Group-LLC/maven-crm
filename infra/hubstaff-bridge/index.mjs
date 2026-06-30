// hubstaff-bridge — micro en Dokploy. Cada corrida (cada ~6h):
//   1) Asegura un access_token válido. Auth = Personal Access Token (OAuth2/OIDC):
//      el PAT es un REFRESH TOKEN; se canjea en account.hubstaff.com/access_tokens por un
//      access_token (~24h). El refresh token ROTA en cada canje → se persiste en
//      hubstaff_secrets (la semilla inicial viene de HUBSTAFF_PAT_REFRESH_TOKEN).
//      ⚠ Persistir el refresh rotado es el fallo #1 de estas integraciones: si no, el
//      próximo refresh falla. Por eso vive en DB, no solo en env.
//   2) Auto-descubre las organizaciones que el token (owner) puede ver (GET /organizations).
//   3) Por cada org: sincroniza el DIRECTORIO de miembros (import_hubstaff_members) y la
//      ACTIVIDAD DIARIA agregada (activities/daily → import_hubstaff_data).
//   4) HUBSTAFF_PROBE=1 → NO sincroniza: imprime el shape crudo de la API para validar campos
//      antes de confiar en el parser (los nombres de campo se confirman con una llamada real).
//
// La service_role key bypassa RLS → puede escribir en las tablas admin-only de Hubstaff.

import { createClient } from "@supabase/supabase-js";

const {
  HUBSTAFF_PAT_REFRESH_TOKEN,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  LOOKBACK_DAYS = "8",
  STARTS_LOOKBACK_DAYS = "4",   // ventana (más corta) para jalar la hora de inicio (c1 puntualidad); la historia se acumula en DB
  RUN_EVERY_HOURS = "6",
  RUN_ONCE,
  HUBSTAFF_PROBE,
} = process.env;

const API = "https://api.hubstaff.com/v2";
const TOKEN_ENDPOINT = "https://account.hubstaff.com/access_tokens";

function requireEnv() {
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missing.length) throw new Error("Faltan env vars: " + missing.join(", "));
  // El refresh token puede venir de DB (rotado) o del env (semilla); se valida en loadTokens().
}

const sb = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DAY = 86400000;
const BOGOTA_OFFSET_MS = 5 * 3600 * 1000;   // Colombia = UTC-5 (sin DST) → fecha/hora de turno se calcula acá
const ymd = (d) => d.toISOString().slice(0, 10);
const bogotaDate = (iso) => ymd(new Date(Date.parse(iso) - BOGOTA_OFFSET_MS));   // fecha-Colombia de un instante UTC
const daysBack = (n) => { const out = []; for (let i = n; i >= 0; i--) out.push(ymd(new Date(Date.now() - i * DAY))); return out; };
const chunk = (arr, size) => { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Estado de tokens (en memoria durante la corrida; persistido en hubstaff_secrets) ──
let cache = { refresh: null, access: null, expMs: 0 };

async function loadTokens() {
  try {
    const { data } = await sb().from("hubstaff_secrets").select("refresh_token, access_token, access_expires_at").eq("id", 1).maybeSingle();
    cache.refresh = data?.refresh_token || HUBSTAFF_PAT_REFRESH_TOKEN || null;
    cache.access = data?.access_token || null;
    cache.expMs = data?.access_expires_at ? new Date(data.access_expires_at).getTime() : 0;
  } catch (e) {
    console.error("[hubstaff-bridge] loadTokens falló, uso la semilla del env:", e.message);
    cache.refresh = HUBSTAFF_PAT_REFRESH_TOKEN || null;
  }
  if (!cache.refresh) throw Object.assign(new Error("no hay refresh token (ni en hubstaff_secrets ni en HUBSTAFF_PAT_REFRESH_TOKEN)"), { expired: true });
}

async function saveTokens() {
  const { error } = await sb().from("hubstaff_secrets").upsert({
    id: 1, refresh_token: cache.refresh, access_token: cache.access,
    access_expires_at: cache.expMs ? new Date(cache.expMs).toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("[hubstaff-bridge] saveTokens:", error.message);
}

// Canjea el refresh token por un access token. El refresh ROTA → se reemplaza y persiste.
async function refreshAccessToken() {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: cache.refresh });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json.error || res.status;
    // refresh vencido/ revocado → re-seed manual; rate_limit → reintentar más tarde.
    throw Object.assign(new Error("refresh falló: " + err), { expired: /invalid|expired|unauthorized/i.test(String(err)) });
  }
  cache.access = json.access_token;
  cache.expMs = Date.now() + (Number(json.expires_in || 86400) * 1000);
  if (json.refresh_token) cache.refresh = json.refresh_token;   // ROTACIÓN: persistir el nuevo
  await saveTokens();
  return cache.access;
}

async function ensureAccessToken() {
  if (cache.access && cache.expMs - 60000 > Date.now()) return cache.access;   // cache válido
  return await refreshAccessToken();
}

// GET a la API v2 con Bearer; en 401 refresca una vez y reintenta. Pagina por page_start_id.
async function hsGet(path, params = {}) {
  let access = await ensureAccessToken();
  const doFetch = async () => {
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
    return fetch(url, { headers: { Authorization: "Bearer " + access, Accept: "application/json" } });
  };
  let res = await doFetch();
  if (res.status === 401) { access = await refreshAccessToken(); res = await doFetch(); }
  if (res.status === 429) { await sleep(2000); res = await doFetch(); }   // throttle suave
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return res.json();
}

// Trae TODAS las páginas de un recurso (cursor page_start_id) y concatena la key indicada.
async function hsGetAll(path, key, params = {}) {
  const out = [];
  let start = undefined, guard = 0;
  do {
    const page = await hsGet(path, { page_limit: 500, ...(start ? { page_start_id: start } : {}), ...params });
    const arr = page?.[key];
    if (Array.isArray(arr)) out.push(...arr);
    start = page?.pagination?.next_page_start_id;
    guard++;
  } while (start && guard < 50);
  return out;
}

// ── Sincronización ──
async function discoverOrgs() {
  const orgs = await hsGetAll("/organizations", "organizations");
  return orgs.map((o) => ({ id: String(o.id), name: o.name })).filter((o) => o.id);
}

// members + (si viene) la sidecar users[] para name/email. Defensivo ante variaciones de shape.
async function syncMembers(org) {
  const page = await hsGet(`/organizations/${org.id}/members`, { page_limit: 500, include: "users" });
  const members = page.members || [];
  const usersById = {};
  for (const u of (page.users || [])) usersById[String(u.id)] = u;
  const rows = [];
  for (const m of members) {
    const uid = String(m.user_id ?? m.id ?? "");
    if (!uid) continue;
    const u = usersById[uid] || {};
    rows.push({
      hubstaff_user_id: uid, hubstaff_org_id: org.id,
      name: u.name ?? m.name ?? null, email: u.email ?? m.email ?? null,
      hubstaff_role: m.membership_role ?? m.role ?? null,
    });
  }
  if (rows.length) {
    const { error } = await sb().rpc("import_hubstaff_members", { p_rows: rows });
    if (error) throw new Error("import_hubstaff_members: " + error.message);
  }
  return rows.length;
}

// c1: primer time_slot por (usuario, fecha-Colombia) desde las actividades granulares.
// Agrupar por fecha-Colombia (no UTC) es clave: el turno de madrugada (12-8) y el de 4-12 cruzan
// medianoche UTC, pero caen dentro de UN día en hora Colombia.
async function fetchActivityStarts(org, startDayExclLeft, stopDayExcl) {
  const items = await hsGetAll(`/organizations/${org.id}/activities`, "activities", {
    "time_slot[start]": startDayExclLeft + "T00:00:00Z",
    "time_slot[stop]": stopDayExcl + "T00:00:00Z",
  });
  const firstByKey = new Map();
  for (const a of items) {
    const uid = String(a.user_id ?? "");
    const ts = a.time_slot || a.starts_at || null;
    if (!uid || !ts) continue;
    const key = uid + "|" + bogotaDate(ts);
    const cur = firstByKey.get(key);
    if (!cur || ts < cur) firstByKey.set(key, ts);   // ISO UTC ordena lexicográficamente
  }
  return firstByKey;
}

async function syncDaily(org, days) {
  // activities/daily soporta rango date[start]/date[stop] (inclusive). Paginado por cursor.
  const items = await hsGetAll(`/organizations/${org.id}/activities/daily`, "daily_activities", {
    "date[start]": days[0], "date[stop]": days[days.length - 1],
  });
  // Hora de inicio (c1): solo los últimos STARTS_LOOKBACK_DAYS (granular = pesado); ±1 día por TZ.
  const sLook = Math.max(1, Number(STARTS_LOOKBACK_DAYS) || 4);
  const startsDays = days.slice(-sLook);
  let starts = new Map();
  try {
    const left = ymd(new Date(Date.parse(startsDays[0] + "T00:00:00Z") - DAY));
    const right = ymd(new Date(Date.parse(startsDays[startsDays.length - 1] + "T00:00:00Z") + 2 * DAY));
    starts = await fetchActivityStarts(org, left, right);
  } catch (e) {
    console.error(`[hubstaff-bridge] starts (c1) de ${org.name} fallaron, sigo sin ellos: ${e.message}`);
  }
  const rows = [];
  for (const a of items) {
    const uid = String(a.user_id ?? "");
    const date = String(a.date ?? "").slice(0, 10);
    if (!uid || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    // OJO: en activities/daily, `overall` (igual que keyboard/mouse) son SEGUNDOS de actividad,
    // NO un porcentaje. El % de productividad = overall_segundos / tracked_segundos * 100.
    // (Verificado en vivo: overall crudo daba ~11k, /tracked da ~50% que es lo realista.)
    const tracked = Number(a.tracked) || 0;
    const overallPct = (tracked > 0 && a.overall != null)
      ? Math.min(100, Math.round((Number(a.overall) / tracked) * 100))
      : null;
    rows.push({
      hubstaff_user_id: uid, hubstaff_org_id: org.id, date,
      tracked_seconds: tracked,
      overall_activity: overallPct,
      project_name: a.project?.name ?? null,
      first_activity_at: starts.get(uid + "|" + date) ?? null,   // null → el RPC conserva el valor previo
    });
  }
  for (const batch of chunk(rows, 1000)) {
    const { error } = await sb().rpc("import_hubstaff_data", { p_rows: batch });
    if (error) throw new Error("import_hubstaff_data: " + error.message);
  }
  return rows.length;
}

// PROBE: imprime el shape crudo para validar nombres de campo ANTES de confiar en el parser.
async function probe() {
  await loadTokens();
  await ensureAccessToken();
  const trunc = (o) => JSON.stringify(o, null, 2).slice(0, 1800);
  const orgs = await hsGet("/organizations", { page_limit: 5 });
  console.log("=== /organizations ===\n" + trunc(orgs));
  const first = (orgs.organizations || [])[0];
  if (!first) { console.log("[probe] sin organizaciones visibles para este token."); return; }
  const oid = String(first.id);
  const members = await hsGet(`/organizations/${oid}/members`, { page_limit: 3, include: "users" });
  console.log(`\n=== /organizations/${oid}/members?include=users (primeros 3) ===\n` + trunc(members));
  const y = ymd(new Date(Date.now() - DAY));
  const daily = await hsGet(`/organizations/${oid}/activities/daily`, { "date[start]": y, "date[stop]": y, page_limit: 3 });
  console.log(`\n=== /organizations/${oid}/activities/daily (${y}, primeros 3) ===\n` + trunc(daily));
  console.log("\n[probe] OK. Validá los nombres de campo (user_id, tracked, overall, date, email) contra el parser.");
}

async function runOnce() {
  requireEnv();
  await loadTokens();
  const days = daysBack(Math.max(1, Number(LOOKBACK_DAYS) || 8));
  const orgs = await discoverOrgs();
  console.log(`[hubstaff-bridge] ${orgs.length} org(s): ${orgs.map((o) => o.name).join(", ")}. Ventana ${days[0]}..${days[days.length - 1]}.`);
  let totMembers = 0, totDaily = 0;
  for (const org of orgs) {
    try {
      totMembers += await syncMembers(org);
      totDaily += await syncDaily(org, days);
      console.log(`[hubstaff-bridge] org ${org.name}: miembros + actividad OK.`);
    } catch (e) {
      if (e.expired) throw e;
      console.error(`[hubstaff-bridge] org ${org.name} falló (sigo con las demás): ${e.message}`);
    }
  }
  console.log(`[hubstaff-bridge] OK: ${totMembers} miembros, ${totDaily} filas de actividad diaria.`);

  // Recalcular c4 (Productividad) del scorecard del mes en curso desde la actividad recién ingestada.
  // El RPC matchea por blu_employee_id+period y solo toca c4 (rubric actividad%→0-5). Aislado: si falla, no afecta la sync.
  try {
    const now = new Date();
    const period = ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
    const { data, error } = await sb().rpc("recalc_chatter_scorecard_hubstaff", { p_period: period });
    if (error) throw new Error(error.message);
    console.log(`[hubstaff-bridge] scorecard c4 recalculado (${period}): ${JSON.stringify(data)}`);
    // c1 Puntualidad: deduce turno + puntúa (guarda de mínimo de días adentro del RPC → no puntúa con muestra chica).
    const { data: d1, error: e1 } = await sb().rpc("recalc_chatter_c1_puntualidad", { p_period: period });
    if (e1) throw new Error(e1.message);
    console.log(`[hubstaff-bridge] scorecard c1 recalculado (${period}): ${JSON.stringify(d1)}`);
  } catch (e) {
    console.error(`[hubstaff-bridge] recalc scorecard falló (no afecta la sync): ${e.message}`);
  }

  return { totMembers, totDaily };
}

function warnIfExpired(e) {
  console.error("[hubstaff-bridge] error:", e.message);
  if (e.expired) console.error("[hubstaff-bridge] ⚠ El refresh token venció/revocó. Generá un PAT nuevo en Hubstaff y actualizá HUBSTAFF_PAT_REFRESH_TOKEN en Dokploy (re-seed).");
}

async function main() {
  if (HUBSTAFF_PROBE) { try { await probe(); process.exit(0); } catch (e) { warnIfExpired(e); process.exit(1); } return; }
  if (RUN_ONCE) { try { await runOnce(); process.exit(0); } catch (e) { warnIfExpired(e); process.exit(e.expired ? 2 : 1); } return; }
  await runOnce().catch(warnIfExpired);
  const hours = Math.max(1, Math.min(Number(RUN_EVERY_HOURS) || 6, 24));
  console.log(`[hubstaff-bridge] próxima corrida en ${hours}h.`);
  setInterval(() => runOnce().catch(warnIfExpired), hours * 3600000);
}

main();

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
  LOOKBACK_DAYS = "45",         // ventana de actividad DIARIA (agregada, liviana) → cubre el mes completo + backfillea historia (idempotente). El granular pesado va aparte (STARTS_LOOKBACK_DAYS).
  STARTS_LOOKBACK_DAYS = "4",   // ventana (más corta) para jalar la hora de inicio (c1 puntualidad); la historia se acumula en DB
  RUN_EVERY_HOURS = "6",
  LIVE_EVERY_MIN = "5",         // poll de actividad granular EN VIVO (Monitoreo HR) — cada N min
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

// ── PROYECTOS ────────────────────────────────────────────────────────────────
// ⚠️ POR QUÉ EXISTE: el código guardaba `a.project?.name`, pero /activities NO manda
// el objeto `project` — solo `project_id`. Resultado: `project_name` quedó NULL en
// el 100% de las filas (1.915 horas de 47 personas) y nadie se enteró, porque un
// null no falla. Se pedía "las horas de los chatters" y salía todo el mundo.
//
// El proyecto es EL discriminador que hace falta: 24 de 63 miembros activos de
// Hubstaff no tienen cuenta en Maven, así que filtrar por rol de Maven borraría al
// 38% de la gente —incluidos chatters reales—. En Hubstaff, en cambio, está todo el
// que ficha.
//
// Se resuelve por id contra la lista de proyectos en vez de confiar en un `include`:
// si el nombre del parámetro cambia, un include mal puesto vuelve a fallar EN SILENCIO.
async function fetchProjectMap(org) {
  const m = new Map();
  try {
    const projs = await hsGetAll(`/organizations/${org.id}/projects`, "projects", { status: "all" });
    for (const p of projs) if (p?.id != null) m.set(String(p.id), p.name ?? null);
  } catch (e) {
    console.error(`[hubstaff-bridge] no pude leer proyectos de ${org.name}: ${e.message}`);
  }
  return m;
}

// Nombre del proyecto de una actividad. `a.project?.name` queda como respaldo por si
// algún endpoint sí lo embebe.
const nombreProyecto = (a, mapa) =>
  a?.project?.name ?? (a?.project_id != null ? (mapa.get(String(a.project_id)) ?? null) : null);

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
  // activities/daily soporta rango date[start]/date[stop] (inclusive) pero RECHAZA rangos
  // de más de 31 días (400 invalid_params). Troceamos en ventanas de 30 días para poder
  // backfillear meses completos. Paginado por cursor adentro de cada trozo.
  const items = [];
  const WINDOW = 30;
  for (let i = 0; i < days.length; i += WINDOW) {
    const slice = days.slice(i, i + WINDOW);
    const part = await hsGetAll(`/organizations/${org.id}/activities/daily`, "daily_activities", {
      "date[start]": slice[0], "date[stop]": slice[slice.length - 1],
    });
    items.push(...part);
  }
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
  const projMap = await fetchProjectMap(org);   // ver fetchProjectMap: /activities solo manda project_id
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
      project_name: nombreProyecto(a, projMap),
      first_activity_at: starts.get(uid + "|" + date) ?? null,   // null → el RPC conserva el valor previo
    });
  }
  for (const batch of chunk(rows, 1000)) {
    const { error } = await sb().rpc("import_hubstaff_data", { p_rows: batch });
    if (error) throw new Error("import_hubstaff_data: " + error.message);
  }
  return rows.length;
}

// ── EN VIVO (Monitoreo HR) ──
// Pollea la actividad GRANULAR (time_slots) de la última hora y la upsertea en hubstaff_activities
// (la tabla que lee la pantalla Monitoreo HR). Cadencia ~5 min → presencia casi al minuto sin webhook.
// Idempotente por (member_id, starts_at). member_id = uuid de hubstaff_members (mapeado desde user_id).
async function loadMemberMap() {
  const { data, error } = await sb().from("hubstaff_members").select("id, hubstaff_user_id");
  if (error) throw new Error("loadMemberMap: " + error.message);
  const m = new Map();
  for (const r of (data || [])) m.set(String(r.hubstaff_user_id), r.id);
  return m;
}


async function syncLiveActivities() {
  await loadTokens();                       // por si el intervalo en vivo arranca antes del 1er full sync
  const orgs = await discoverOrgs();
  const memberMap = await loadMemberMap();
  // Ventana = HOY en hora Colombia (00:00 Bogotá = 05:00 UTC) → ahora. Así Monitoreo HR ve la
  // jornada COMPLETA (horas de hoy correctas), no solo la última hora, y se backfillea en cada poll.
  const now = Date.now();
  const start = bogotaDate(new Date(now).toISOString()) + "T05:00:00Z";
  const stop = new Date(now + 10 * 60 * 1000).toISOString();
  // AGREGAR por (miembro, time_slot): /activities devuelve una fila por proyecto/tarea, así que
  // un mismo slot puede venir repetido → sumamos los segundos y recomputamos %. Sin esto, el upsert
  // falla con "ON CONFLICT DO UPDATE command cannot affect row a second time" (claves dup en el batch).
  const byKey = new Map();
  let conProyecto = 0, totalItems = 0;
  for (const org of orgs) {
    let items = [];
    try {
      items = await hsGetAll(`/organizations/${org.id}/activities`, "activities", {
        "time_slot[start]": start, "time_slot[stop]": stop,
      });
    } catch (e) {
      console.error(`[hubstaff-bridge] live activities de ${org.name} falló: ${e.message}`);
      continue;
    }
    const projMap = await fetchProjectMap(org);
    for (const a of items) {
      const member_id = memberMap.get(String(a.user_id ?? ""));
      const ts = a.time_slot || a.starts_at || null;
      if (!member_id || !ts) continue;
      totalItems++;
      const proyecto = nombreProyecto(a, projMap);
      if (proyecto) conProyecto++;
      const key = member_id + "|" + ts;
      const cur = byKey.get(key) || { member_id, starts_at: ts, tracked: 0, overall: 0, mouse: 0, keyboard: 0, project_name: null, task_name: null };
      cur.tracked += Number(a.tracked) || 0;
      cur.overall += Number(a.overall) || 0;
      cur.mouse += Number(a.mouse) || 0;
      cur.keyboard += Number(a.keyboard) || 0;
      cur.project_name = cur.project_name || proyecto;
      cur.task_name = cur.task_name || a.task?.name || null;
      byKey.set(key, cur);
    }
  }
  // ⚠️ Que el proyecto venga vacío tiene que ser RUIDOSO. Justamente por ser silencioso
  // este campo estuvo en null durante toda la vida del bridge sin que nadie lo notara.
  if (totalItems > 0 && conProyecto === 0) {
    console.error(`[hubstaff-bridge] ⚠️ ${totalItems} actividades y NINGUNA con proyecto — revisar /projects o el shape de project_id`);
  } else if (totalItems > 0) {
    console.log(`[hubstaff-bridge] proyecto resuelto en ${conProyecto}/${totalItems} actividades`);
  }
  const rows = [...byKey.values()].map((c) => {
    const pct = (v) => (c.tracked > 0) ? Math.min(100, Math.round((v / c.tracked) * 100)) : null;
    return {
      member_id: c.member_id, starts_at: c.starts_at, tracked_seconds: c.tracked,
      overall_activity: pct(c.overall), mouse_activity: pct(c.mouse), keyboard_activity: pct(c.keyboard),
      mouse_events: c.mouse || null, keyboard_events: c.keyboard || null,
      project_name: c.project_name, task_name: c.task_name,
    };
  });
  for (const batch of chunk(rows, 500)) {
    const { error } = await sb().from("hubstaff_activities").upsert(batch, { onConflict: "member_id,starts_at" });
    if (error) throw new Error("upsert hubstaff_activities: " + error.message);
  }
  // Marcar el config como sincronizado (Monitoreo HR muestra el estado del sync).
  await sb().from("hubstaff_config").update({
    sync_enabled: true, last_sync_at: new Date().toISOString(), api_token_set: true,
  }).not("id", "is", null);
  console.log(`[hubstaff-bridge] live: ${rows.length} time_slots upserteados (Monitoreo HR).`);
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
  // Piso de 45 días para la actividad DIARIA (agregada, liviana): los agregados
  // mensuales necesitan el mes COMPLETO, así que ignoramos un LOOKBACK_DAYS más chico
  // (en Dokploy estaba en 8 → el mes salía truncado/sin backfill). El fetch granular
  // pesado (hora de inicio / c1) va aparte y sigue acotado a STARTS_LOOKBACK_DAYS.
  const days = daysBack(Math.max(45, Number(LOOKBACK_DAYS) || 45));
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

  // Costo/ROI: FX en vivo + % efectivo del mes (lo consume el subtab Hubstaff + la tool de Clari).
  try {
    await refreshCostConfig();
  } catch (e) {
    console.error(`[hubstaff-bridge] refresh costo/ROI falló (no afecta la sync): ${e.message}`);
  }

  return { totMembers, totDaily };
}

// Refresca el costo/ROI por chatter: trae el FX COP→USD en vivo (open.er-api.com, sin key) y
// recalcula el % efectivo de la agencia (agency_percentage ponderado por ingreso del mes) vía RPC.
// El subtab Hubstaff y la tool de Clari leen chatter_cost_config. Aislado: si falla, no afecta la sync.
async function refreshCostConfig() {
  let fx = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: ctrl.signal });
    clearTimeout(t);
    const j = await res.json();
    const cop = Number(j?.rates?.COP);
    if (Number.isFinite(cop) && cop > 0) fx = cop;
  } catch (e) {
    console.error(`[hubstaff-bridge] FX fetch falló (conservo el valor previo): ${e.message}`);
  }
  // p_fx=null → el RPC solo recalcula la tasa efectiva y conserva el FX guardado.
  const { data, error } = await sb().rpc("refresh_chatter_cost_config", { p_fx: fx });
  if (error) throw new Error(error.message);
  console.log(`[hubstaff-bridge] costo/ROI: FX=${data?.fx_cop_per_usd} COP/USD, % efectivo agencia=${data?.effective_agency_rate}`);
}

function warnIfExpired(e) {
  console.error("[hubstaff-bridge] error:", e.message);
  if (e.expired) console.error("[hubstaff-bridge] ⚠ El refresh token venció/revocó. Generá un PAT nuevo en Hubstaff y actualizá HUBSTAFF_PAT_REFRESH_TOKEN en Dokploy (re-seed).");
}

// ── Sync ON-DEMAND (cola hubstaff_sync_requests) ─────────────────────────────
// Réplica del patrón blu_sync_requests del blu-bridge: la tool
// get_hubstaff_activity del bot inserta una fila 'pending' y espera ≤12s, acá
// la vemos y corremos un syncLiveActivities() extra, marcando done al terminar.
// El poll es cada 5s (no 20 como BLU) porque la ventana de espera del bot es de
// solo 12s — con 20s de poll casi nunca llegaría a tiempo. Es un SELECT sobre
// una tabla mínima con índice parcial: costo despreciable. Pedidos >10 min se
// expiran (el caller ya no espera). Sin puertos HTTP: solo Supabase.
let onDemandBusy = false;
async function pollHubstaffSyncRequests() {
  if (onDemandBusy) return;
  let req = null;
  try {
    const tenMinAgo = new Date(Date.now() - 10 * 60000).toISOString();
    await sb().from("hubstaff_sync_requests").update({ status: "expired", finished_at: new Date().toISOString() })
      .eq("status", "pending").lt("requested_at", tenMinAgo);
    const { data } = await sb().from("hubstaff_sync_requests")
      .select("id").eq("status", "pending").gte("requested_at", tenMinAgo)
      .order("id", { ascending: true }).limit(1);
    req = data && data[0];
  } catch (e) { console.error("[hubstaff-bridge] poll sync requests:", e.message); return; }
  if (!req) return;
  onDemandBusy = true;
  console.log(`[hubstaff-bridge] sync on-demand #${req.id} → live activities…`);
  try {
    const startedAt = new Date().toISOString();
    await sb().from("hubstaff_sync_requests").update({ status: "running", started_at: startedAt }).eq("id", req.id);
    await syncLiveActivities();
    // El live sync que acaba de correr satisface también los pending que se
    // encolaron ANTES de arrancar — cerrarlos evita correr una pasada por pedido.
    await sb().from("hubstaff_sync_requests")
      .update({ status: "done", finished_at: new Date().toISOString() })
      .in("status", ["running", "pending"]).lte("requested_at", startedAt);
    console.log(`[hubstaff-bridge] sync on-demand #${req.id} done.`);
  } catch (e) {
    console.error(`[hubstaff-bridge] sync on-demand #${req.id} falló: ${e.message}`);
    await sb().from("hubstaff_sync_requests")
      .update({ status: "error", finished_at: new Date().toISOString(), note: String(e.message || e).slice(0, 200) })
      .eq("id", req.id).then(() => {}, () => {});
  } finally {
    onDemandBusy = false;
  }
}

async function main() {
  if (HUBSTAFF_PROBE) { try { await probe(); process.exit(0); } catch (e) { warnIfExpired(e); process.exit(1); } return; }
  if (RUN_ONCE) { try { await runOnce(); process.exit(0); } catch (e) { warnIfExpired(e); process.exit(e.expired ? 2 : 1); } return; }
  await runOnce().catch(warnIfExpired);
  const hours = Math.max(1, Math.min(Number(RUN_EVERY_HOURS) || 6, 24));
  console.log(`[hubstaff-bridge] próxima corrida en ${hours}h.`);
  setInterval(() => runOnce().catch(warnIfExpired), hours * 3600000);

  // Poll EN VIVO de actividad (Monitoreo HR) — cadencia corta, aislado del full sync.
  const liveMin = Math.max(2, Math.min(Number(LIVE_EVERY_MIN) || 5, 60));
  const runLive = () => syncLiveActivities().catch((e) => console.error(`[hubstaff-bridge] live poll falló: ${e.message}`));
  console.log(`[hubstaff-bridge] poll en vivo cada ${liveMin} min.`);
  runLive();
  setInterval(runLive, liveMin * 60000);

  // Cola de refresh on-demand del bot (ver pollHubstaffSyncRequests).
  console.log("[hubstaff-bridge] poll de sync on-demand cada 5s.");
  setInterval(() => pollHubstaffSyncRequests().catch((e) => console.error(`[hubstaff-bridge] on-demand falló: ${e.message}`)), 5000);
}

main();

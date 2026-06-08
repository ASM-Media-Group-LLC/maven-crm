// cloudphone-gateway — wrapper de la CLOUD API de Multilogin para cloud phones.
//
// Los cloud phones (= GeeLark por debajo) se manejan 100% por `api.multilogin.com/mobile_profiles/phone/*`
// (body {ids:[...]}, Bearer token). El `start` devuelve una URL web del teléfono
// (https://phone.geelark.com/...&token=) que es IFRAME-EMBEBIBLE → Maven la mete en un <iframe>.
// No hace falta ADB/scrcpy/WebRTC, ni el agente MLX (que además hijackeaba la API).
//
// AUTH (lección aprendida 2026-06-06): el bloqueo nunca fue el agente — era un TOKEN VENCIDO.
// Síntoma: GET .../phone/list con token malo → 401 "Wrong JWT token"; el MISMO token malo en un POST
// → 501 "Unsupported method (POST)" (espejismo). Por eso este micro se auto-gestiona el token:
//   1) POST /user/signin {email, password: md5(password)} → data.token (regular, ~30 min)
//   2) GET  /workspace/automation_token?expiration_period=8760h → data.token (largo, ~1 año)
//   3) cachea en memoria; si una llamada da 401/403/501, re-mintea una vez y reintenta.
// Si no hay email+password pero sí MLX_TOKEN, usa ese (modo manual; vos lo mantenés).
//
// Endpoints que consume Maven:
//   GET  /health                 → vivo + modo de auth (sin filtrar secretos)
//   GET  /diag                    → (guard) hace un GET real y devuelve el status → verificación
//   GET  /folders                 → (guard) folders mobile (asignación folder-por-closer)
//   GET  /phones                  → (guard) lista de teléfonos (paginada)
//   POST /phones/status  {ids}    → (guard) estado de teléfonos
//   POST /phones/:id/start        → (guard) arranca, registra sesión, devuelve { url, secondsLeft }
//   POST /phones/:id/stop         → (guard) apaga + cierra sesión
//   POST /phones/:id/heartbeat    → (guard) latido (mantiene viva la sesión) → { secondsLeft }
//   POST /phones/:id/extend       → (guard) resetea el reloj de la sesión
//   GET  /sessions                → (guard) sesiones activas + recién terminadas (log + vista admin)
//   POST /phones/adb-info {ids}   → (guard) info ADB (alternativa; no se usa para el iframe)
//
// Auth del micro hacia Maven: por ahora SPIKE_TOKEN (header x-spike-token). Slice 3 = JWT de Supabase.

const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 8090;
const SPIKE_TOKEN = process.env.SPIKE_TOKEN || "";
const CLOUD = process.env.MLX_CLOUD_URL || "https://api.multilogin.com";

const MLX_EMAIL = process.env.MLX_EMAIL || "";
const MLX_PASSWORD = process.env.MLX_PASSWORD || ""; // plano; se md5'ea en el signin
const MLX_TOKEN_OVERRIDE = process.env.MLX_TOKEN || ""; // token manual opcional (sin email/pass)
const TOKEN_TTL = process.env.MLX_TOKEN_TTL || "8760h"; // expiración del automation token

const HAS_CREDS = !!(MLX_EMAIL && MLX_PASSWORD);
// User-Agent tipo browser: no es necesario (probado), pero no molesta y nos camufla.
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");

// fetch con timeout (AbortController). CLAVE: en Node un fetch sin timeout NO corta NUNCA, así que
// si Multilogin se pone lento o deja de responder, el request quedaba colgado para siempre y el micro
// terminaba zombie (caída permanente hasta reinicio manual — incidente 2026-06-07). Con timeout, un
// hipo de MLX falla rápido y el micro se auto-recupera (la próxima llamada reintenta).
const MLX_TIMEOUT_MS = Number(process.env.MLX_TIMEOUT_MS) || 12000;
async function fetchT(url, opts = {}, ms = MLX_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

let tokenCache = { token: null, mintedAt: 0, mode: HAS_CREDS ? "signin" : MLX_TOKEN_OVERRIDE ? "override" : "none" };

// signin → (intenta) automation token largo. Si el automation falla, cae al token regular del signin
// (que igual sirve para la API; el auto-refresh on-401 cubre su vencimiento a los ~30 min).
async function signinAndMint() {
  const si = await fetchT(CLOUD + "/user/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, Accept: "application/json" },
    body: JSON.stringify({ email: MLX_EMAIL, password: md5(MLX_PASSWORD) }),
  });
  const sj = await si.json().catch(() => ({}));
  const regular = sj?.data?.token;
  if (!regular) {
    throw new Error("signin falló: " + si.status + " " + JSON.stringify(sj).slice(0, 200));
  }
  try {
    const at = await fetchT(CLOUD + "/workspace/automation_token?expiration_period=" + encodeURIComponent(TOKEN_TTL), {
      headers: { Authorization: "Bearer " + regular, "User-Agent": UA, Accept: "application/json" },
    });
    const aj = await at.json().catch(() => ({}));
    if (aj?.data?.token) return { token: aj.data.token, mode: "signin-automation" };
  } catch (_) {
    /* cae al regular */
  }
  return { token: regular, mode: "signin-regular" };
}

async function getToken(force = false) {
  if (!force && tokenCache.token) return tokenCache.token;
  if (HAS_CREDS) {
    const r = await signinAndMint();
    tokenCache = { token: r.token, mintedAt: Date.now(), mode: r.mode };
    console.log("[auth] token refrescado vía", r.mode);
    return r.token;
  }
  if (MLX_TOKEN_OVERRIDE) {
    tokenCache = { token: MLX_TOKEN_OVERRIDE, mintedAt: Date.now(), mode: "override" };
    return MLX_TOKEN_OVERRIDE;
  }
  throw new Error("sin credenciales: seteá MLX_EMAIL+MLX_PASSWORD (recomendado) o MLX_TOKEN");
}

// Llama la cloud API con el token cacheado. Si da 401/403/501 y podemos re-mintear, lo hace una vez.
async function mlx(path, { method = "GET", body, _retry = false } = {}) {
  const token = await getToken();
  const res = await fetchT(CLOUD + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "User-Agent": UA,
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if ((res.status === 401 || res.status === 403 || res.status === 501) && !_retry && HAS_CREDS) {
    console.log("[auth]", res.status, "en", path, "→ re-minteo token y reintento");
    await getToken(true);
    return mlx(path, { method, body, _retry: true });
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json };
}

function guard(req, res) {
  if (!SPIKE_TOKEN || req.get("x-spike-token") !== SPIKE_TOKEN) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return false;
  }
  return true;
}

// ───────────────── Sesiones + reaper (control de tiempo) ─────────────────
// Las sesiones viven EN MEMORIA (no en Supabase) → cero cron facturable; el laburo vive en este VPS.
// El reaper apaga teléfonos olvidados/colgados. Maven manda un "latido" mientras el iframe está abierto.
const SESSION_MAX_MS = (Number(process.env.CLOUDPHONE_MAX_MIN) || 20) * 60 * 1000; // tope duro por sesión
const SESSION_STALE_MS = (Number(process.env.CLOUDPHONE_STALE_SEC) || 150) * 1000; // sin latido → muerto
const REAP_INTERVAL_MS = 30 * 1000;
const sessions = new Map(); // profileId -> { userId, startedAt, lastBeat }
const recentlyEnded = []; // {profileId,userId,startedAt,endedAt,reason} (cap 100, para el log del edge)

function noteEnded(profileId, s, reason) {
  recentlyEnded.push({ profileId, userId: s?.userId || null, startedAt: s?.startedAt || null, endedAt: Date.now(), reason });
  if (recentlyEnded.length > 100) recentlyEnded.shift();
}

async function stopPhone(id) {
  return mlx("/mobile_profiles/phone/stop", { method: "POST", body: { ids: [id] } });
}

// Reaper: corre cada 30s pero es NO-OP si no hay sesiones (idle = costo ~0).
async function reapTick() {
  if (sessions.size === 0) return;
  const now = Date.now();
  for (const [id, s] of [...sessions]) {
    const expired = now - s.startedAt > SESSION_MAX_MS;
    const stale = now - s.lastBeat > SESSION_STALE_MS;
    if (expired || stale) {
      await stopPhone(id).catch(() => {});
      noteEnded(id, s, expired ? "timeout" : "stale");
      sessions.delete(id);
      console.log(`[reaper] apagado ${id} (${expired ? "max" : "sin latido"})`);
    }
  }
}

// Boot reconcile (+90s): apaga teléfonos PRENDIDOS sin sesión (huérfanos/leaks de antes de un redeploy).
// A los 90s los usuarios activos ya re-registraron su sesión vía latido → se respetan.
async function bootReconcile() {
  try {
    const r = await mlx("/mobile_profiles/phone/list?page=1&page_size=100&sort=desc&order_by=created_at");
    const items = Array.isArray(r.json?.data?.items) ? r.json.data.items : [];
    let stopped = 0;
    for (const p of items) {
      if (!p?.id || sessions.has(p.id)) continue; // sesión activa → no tocar
      await stopPhone(p.id).catch(() => {});
      stopped++;
    }
    console.log(`[boot] reconcile: apagados ${stopped} teléfono(s) sin sesión`);
  } catch (e) {
    console.log("[boot] reconcile err:", e.message);
  }
}

app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    service: "cloudphone-gateway",
    authMode: HAS_CREDS ? "signin" : MLX_TOKEN_OVERRIDE ? "override" : "none",
    tokenCached: !!tokenCache.token,
    tokenAgeSec: tokenCache.mintedAt ? Math.round((Date.now() - tokenCache.mintedAt) / 1000) : null,
    ts: new Date().toISOString(),
  }),
);

// Verificación end-to-end: hace un GET real y reporta el status (200 = auth + cloud API OK).
app.get("/diag", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const r = await mlx("/mobile_profiles/phone/list?page=1&page_size=10&sort=desc&order_by=created_at");
    const phones = r.json?.data?.phones || r.json?.data || [];
    res.status(r.status === 200 ? 200 : 502).json({
      ok: r.status === 200,
      status: r.status,
      authMode: tokenCache.mode,
      phoneCount: Array.isArray(phones) ? phones.length : null,
      body: r.status === 200 ? undefined : r.json,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Folders mobile (cada folder = un closer en el modelo folder-por-closer).
app.get("/folders", async (req, res) => {
  if (!guard(req, res)) return;
  const r = await mlx("/workspace/folders?folder_type=mobile");
  res.status(r.status).json(r.json);
});

// Solo estos campos del teléfono salen hacia Maven. NUNCA exponer `proxy` (trae credenciales del
// proxy) ni `equipment_info` (IMEI/MAC/teléfono real = fingerprint). Maven solo necesita pintar tarjetas.
const SAFE_PHONE_FIELDS = [
  "id",
  "serial_name",
  "serial_no",
  "folder_id",
  "status",
  "remark",
  "usecase_name",
  "last_launched_at",
];
function sanitizePhone(p) {
  const o = {};
  for (const k of SAFE_PHONE_FIELDS) if (p && k in p) o[k] = p[k];
  return o;
}

// Caché EN MEMORIA de la lista de teléfonos: el /phones del tab se sirve desde acá (instantáneo) y un
// refresco en background la mantiene fresca. Así un Multilogin lento NO bloquea el tab — se sirve la
// última lista conocida (los campos del teléfono cambian poco; unos segundos de staleness es
// irrelevante para pintar tarjetas). Es la otra mitad del fix del incidente 2026-06-07.
const PHONES_REFRESH_MS = (Number(process.env.CLOUDPHONE_LIST_REFRESH_SEC) || 60) * 1000;
let phonesCache = { items: [], at: 0, ok: false };
async function refreshPhones() {
  const r = await mlx("/mobile_profiles/phone/list?page=1&page_size=100&sort=desc&order_by=created_at");
  if (r.status === 200 && Array.isArray(r.json?.data?.items)) {
    phonesCache = { items: r.json.data.items.map(sanitizePhone), at: Date.now(), ok: true };
  }
  return r;
}

// Lista de teléfonos (saneada). Sirve desde caché si la tenemos (instantáneo, sobrevive a MLX lento);
// si la caché está fría (recién arrancó y aún no refrescó), intenta UN fetch en vivo con timeout.
app.get("/phones", async (req, res) => {
  if (!guard(req, res)) return;
  if (phonesCache.ok) {
    return res.json({ data: { items: phonesCache.items }, cached: true, cacheAgeMs: Date.now() - phonesCache.at });
  }
  try {
    const r = await refreshPhones();
    if (phonesCache.ok) return res.json({ data: { items: phonesCache.items } });
    return res.status(r.status).json(r.json);
  } catch (e) {
    return res.status(504).json({ ok: false, error: "mlx_timeout: " + (e?.message || e) });
  }
});

// Estado de teléfonos. Body: { ids: ["<profileId>", ...] }
app.post("/phones/status", async (req, res) => {
  if (!guard(req, res)) return;
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const r = await mlx("/mobile_profiles/phone/statuses", { method: "POST", body: { ids } });
  res.status(r.status).json(r.json);
});

// Arranca un teléfono y devuelve la URL web (geelark) para el <iframe>. Registra la sesión.
app.post("/phones/:id/start", async (req, res) => {
  if (!guard(req, res)) return;
  const id = req.params.id;
  const userId = req.body?.userId || null;
  // LOCK 1-sesión-por-teléfono: si OTRO usuario lo tiene activo (con latido reciente, no stale),
  // bloqueamos SIN gastar minutos. Varios pueden estar ASIGNADOS al teléfono, pero solo uno
  // logueado a la vez. (Mismo usuario re-abriendo, o sesión stale/abandonada → se permite tomar.)
  const cur = sessions.get(id);
  if (cur && cur.userId && cur.userId !== userId && Date.now() - cur.lastBeat <= SESSION_STALE_MS) {
    return res.status(409).json({ ok: false, inUse: true, inUseByUserId: cur.userId, secondsLeft: 0 });
  }
  // un-teléfono-a-la-vez: si el mismo usuario tiene otro abierto, apagarlo primero.
  if (userId) {
    for (const [pid, s] of [...sessions]) {
      if (pid !== id && s.userId === userId) {
        await stopPhone(pid).catch(() => {});
        noteEnded(pid, s, "replaced");
        sessions.delete(pid);
      }
    }
  }
  const r = await mlx("/mobile_profiles/phone/start", { method: "POST", body: { ids: [id] } });
  const detail = r.json?.data?.success_details?.[0];
  const ok = r.status === 200 && !!detail?.url;
  if (ok) sessions.set(id, { userId, startedAt: Date.now(), lastBeat: Date.now() });
  res.status(r.status).json({
    ok,
    url: detail?.url || null,
    secondsLeft: ok ? Math.round(SESSION_MAX_MS / 1000) : 0,
    raw: r.json,
  });
});

// Apaga un teléfono (gasta minutos → siempre cerrar al salir). Cierra la sesión.
app.post("/phones/:id/stop", async (req, res) => {
  if (!guard(req, res)) return;
  const id = req.params.id;
  const s = sessions.get(id);
  const r = await stopPhone(id);
  if (s) {
    noteEnded(id, s, "manual");
    sessions.delete(id);
  }
  res.status(r.status).json(r.json);
});

// Latido: Maven lo manda cada ~60s mientras el iframe está abierto. Mantiene viva la sesión.
// Si llega un latido para una sesión desconocida (p.ej. tras un redeploy), la re-registra.
app.post("/phones/:id/heartbeat", (req, res) => {
  if (!guard(req, res)) return;
  const id = req.params.id;
  let s = sessions.get(id);
  if (!s) {
    s = { userId: req.body?.userId || null, startedAt: Date.now(), lastBeat: Date.now() };
    sessions.set(id, s);
  } else {
    s.lastBeat = Date.now();
  }
  res.json({ ok: true, secondsLeft: Math.max(0, Math.round((SESSION_MAX_MS - (Date.now() - s.startedAt)) / 1000)) });
});

// Extender: resetea el reloj de la sesión (botón "Extender" en Maven).
app.post("/phones/:id/extend", (req, res) => {
  if (!guard(req, res)) return;
  const s = sessions.get(req.params.id);
  if (s) {
    s.startedAt = Date.now();
    s.lastBeat = Date.now();
  }
  res.json({ ok: !!s, secondsLeft: s ? Math.round(SESSION_MAX_MS / 1000) : 0 });
});

// Sesiones activas + recién terminadas (el edge reconcilia el log + vista admin "en uso").
app.get("/sessions", (req, res) => {
  if (!guard(req, res)) return;
  const now = Date.now();
  const active = [...sessions.entries()].map(([profileId, s]) => ({
    profileId,
    userId: s.userId,
    startedAt: new Date(s.startedAt).toISOString(),
    secondsLeft: Math.max(0, Math.round((SESSION_MAX_MS - (now - s.startedAt)) / 1000)),
  }));
  const ended = recentlyEnded.map((e) => ({
    profileId: e.profileId,
    userId: e.userId,
    startedAt: e.startedAt ? new Date(e.startedAt).toISOString() : null,
    endedAt: new Date(e.endedAt).toISOString(),
    reason: e.reason,
  }));
  res.json({ ok: true, active, ended });
});

// Info de ADB (control programático alternativo; NO se usa para el iframe). Body: { ids: [...] }
app.post("/phones/adb-info", async (req, res) => {
  if (!guard(req, res)) return;
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const r = await mlx("/mobile_profiles/phone/adb/info", { method: "POST", body: { ids } });
  res.status(r.status).json(r.json);
});

// Arranca el reaper (no-op si no hay sesiones) + el boot-reconcile (apaga huérfanos tras un redeploy).
setInterval(() => reapTick().catch(() => {}), REAP_INTERVAL_MS);
setTimeout(() => bootReconcile().catch(() => {}), 90 * 1000);

// Mantener caliente la caché de teléfonos: refresco en background + uno inicial al arrancar (para no
// esperar el primer intervalo). Si MLX falla, se loguea y se reintenta al próximo tick — nunca cuelga.
setInterval(() => refreshPhones().catch((e) => console.log("[phones] refresh err:", e?.message || e)), PHONES_REFRESH_MS);
refreshPhones().catch((e) => console.log("[phones] initial refresh err:", e?.message || e));

app.listen(PORT, () =>
  console.log(`cloudphone-gateway escuchando en :${PORT} (cloud-phone API, auth=${HAS_CREDS ? "signin" : MLX_TOKEN_OVERRIDE ? "override" : "none"})`),
);

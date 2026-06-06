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
//   POST /phones/:id/start        → (guard) arranca y devuelve { url } (geelark, para el iframe)
//   POST /phones/:id/stop         → (guard) apaga (importante: gasta minutos de cloud)
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

let tokenCache = { token: null, mintedAt: 0, mode: HAS_CREDS ? "signin" : MLX_TOKEN_OVERRIDE ? "override" : "none" };

// signin → (intenta) automation token largo. Si el automation falla, cae al token regular del signin
// (que igual sirve para la API; el auto-refresh on-401 cubre su vencimiento a los ~30 min).
async function signinAndMint() {
  const si = await fetch(CLOUD + "/user/signin", {
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
    const at = await fetch(CLOUD + "/workspace/automation_token?expiration_period=" + encodeURIComponent(TOKEN_TTL), {
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
  const res = await fetch(CLOUD + path, {
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

// Lista de teléfonos (paginada). Maven la usa para pintar las tarjetas.
app.get("/phones", async (req, res) => {
  if (!guard(req, res)) return;
  const qs = new URLSearchParams({
    page: String(req.query.page || "1"),
    page_size: String(req.query.page_size || "50"),
    sort: "desc",
    order_by: "created_at",
  });
  const r = await mlx("/mobile_profiles/phone/list?" + qs.toString());
  res.status(r.status).json(r.json);
});

// Estado de teléfonos. Body: { ids: ["<profileId>", ...] }
app.post("/phones/status", async (req, res) => {
  if (!guard(req, res)) return;
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const r = await mlx("/mobile_profiles/phone/statuses", { method: "POST", body: { ids } });
  res.status(r.status).json(r.json);
});

// Arranca un teléfono y devuelve la URL web (geelark) para embeber en el <iframe> de Maven.
app.post("/phones/:id/start", async (req, res) => {
  if (!guard(req, res)) return;
  const r = await mlx("/mobile_profiles/phone/start", { method: "POST", body: { ids: [req.params.id] } });
  const detail = r.json?.data?.success_details?.[0];
  res.status(r.status).json({ ok: r.status === 200 && !!detail?.url, url: detail?.url || null, raw: r.json });
});

// Apaga un teléfono (gasta minutos de cloud → siempre cerrar al salir).
app.post("/phones/:id/stop", async (req, res) => {
  if (!guard(req, res)) return;
  const r = await mlx("/mobile_profiles/phone/stop", { method: "POST", body: { ids: [req.params.id] } });
  res.status(r.status).json(r.json);
});

// Info de ADB (control programático alternativo; NO se usa para el iframe). Body: { ids: [...] }
app.post("/phones/adb-info", async (req, res) => {
  if (!guard(req, res)) return;
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const r = await mlx("/mobile_profiles/phone/adb/info", { method: "POST", body: { ids } });
  res.status(r.status).json(r.json);
});

// TODO(slice3): mover teléfono a folder (asignación) + auth real con JWT de Supabase aplicando
//   folder-por-closer + (opcional) proxear la URL geelark para ocultar también esa marca.
app.listen(PORT, () =>
  console.log(`cloudphone-gateway escuchando en :${PORT} (cloud-phone API, auth=${HAS_CREDS ? "signin" : MLX_TOKEN_OVERRIDE ? "override" : "none"})`),
);

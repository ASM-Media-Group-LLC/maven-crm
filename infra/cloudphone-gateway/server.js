// cloudphone-gateway — Slice 2: wrapper de la CLOUD API de Multilogin para cloud phones.
//
// Hallazgo del de-risk (2026-06-06): los cloud phones NO van por el launcher local (:45001, eso es
// para browser) sino por la cloud API `api.multilogin.com/mobile_profiles/phone/*` (body {ids:[...]},
// Bearer token). El `start` devuelve una URL web del teléfono (https://phone.geelark.com/...&token=)
// que es IFRAME-EMBEBIBLE → Maven la mete en un <iframe>. No hace falta ADB/scrcpy/WebRTC.
//
// Endpoints que expone este micro (los consume Maven):
//   GET  /health
//   GET  /folders                  → folders mobile (asignación folder-por-closer)
//   POST /phones/status  {ids}     → estado de teléfonos
//   POST /phones/:id/start         → arranca y devuelve { url } (geelark, para el iframe)
//   POST /phones/:id/stop          → apaga
//   POST /phones/adb-info {ids}    → info ADB (alternativa; no se usa para el iframe)
//
// Auth: por ahora gated por SPIKE_TOKEN (header x-spike-token). Slice 3 = JWT de Supabase + folder-por-closer.

const express = require("express");
const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 8090;
const SPIKE_TOKEN = process.env.SPIKE_TOKEN || "";
// MLX_TOKEN: idealmente un AUTOMATION token largo (expiration_period=8760h) para no vencerse.
// Ver README (se mintea con signin -> GET /workspace/automation_token, campo data.token).
const MLX_TOKEN = process.env.MLX_TOKEN || "";
const CLOUD = process.env.MLX_CLOUD_URL || "https://api.multilogin.com";

async function mlx(path, { method = "GET", body } = {}) {
  const res = await fetch(CLOUD + path, {
    method,
    headers: { Authorization: `Bearer ${MLX_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }
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
  res.json({ ok: true, service: "cloudphone-gateway", slice: 2, hasToken: !!MLX_TOKEN, ts: new Date().toISOString() }),
);

// Folders mobile (cada folder = un closer, en el modelo folder-por-closer).
app.get("/folders", async (req, res) => {
  if (!guard(req, res)) return;
  const r = await mlx("/workspace/folders?folder_type=mobile");
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

// Apaga un teléfono (importante para no quemar minutos de cloud).
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

// TODO(slice3): GET /phones?folder=<id> (listar perfiles de un folder — confirmar endpoint exacto vía
//   network capture) + auth real con JWT de Supabase aplicando folder-por-closer + endpoint de "mover
//   teléfono a folder" (asignación). + (opcional) proxear la URL geelark para ocultar también esa marca.
app.listen(PORT, () => console.log(`cloudphone-gateway escuchando en :${PORT} (slice 2, cloud-phone API)`));

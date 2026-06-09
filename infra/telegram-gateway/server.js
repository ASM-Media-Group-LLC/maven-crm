// telegram-gateway — lee canales de Telegram vía MTProto (GramJS) para Promolog.
//
// Mismo patrón que el baileys-gateway (gateway con sesión persistente a una
// plataforma de mensajería):
//   · AUTH de las APIs: header `apikey: <API_KEY>` (igual que baileys).
//   · Sesión persistida en un VOLUMEN /data (no env var): sobrevive reinicios.
//   · Login POR WEB en /manager (teléfono → código → 2FA), como el QR de WhatsApp:
//     no hay que correr scripts locales ni pegar session strings.
//   · /manager protegido por MANAGER_PASSWORD (cookie HMAC), idéntico a baileys.
//
// Leer canales públicos como un usuario es benigno (no es granja de cuentas ni
// evasión).
//
// SECRETOS (env, en Dokploy — NUNCA en repo/chat):
//   API_KEY            → auth de las APIs (/diag, /channel) hacia Maven
//   MANAGER_PASSWORD   → login del dashboard /manager
//   TELEGRAM_API_ID    → de https://my.telegram.org
//   TELEGRAM_API_HASH  → idem
//   AUTH_DIR=/data     → volumen donde se guarda la sesión (telegram.session)

const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { computeCheck } = require("telegram/Password");

const PORT = parseInt(process.env.PORT || "8091", 10);
const API_KEY = process.env.API_KEY || "";
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD || "";
const API_ID = Number(process.env.TELEGRAM_API_ID || 0);
const API_HASH = process.env.TELEGRAM_API_HASH || "";
const AUTH_DIR = process.env.AUTH_DIR || "/data";
const SESSION_FILE = `${AUTH_DIR}/telegram.session`;

if (!API_KEY) console.error("[telegram-gateway] WARN: falta API_KEY (las APIs quedan inaccesibles)");
try { fs.mkdirSync(AUTH_DIR, { recursive: true }); } catch (_) { /* noop */ }

const app = express();
app.use(express.json({ limit: "1mb" }));

// ── Auth del dashboard (idéntico a baileys: HMAC de la pass con API_KEY) ──────
const managerToken = () => crypto.createHmac("sha256", API_KEY).update("mgr:" + MANAGER_PASSWORD).digest("hex");
function safeEq(a, b) {
  const ba = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ba, bb); } catch (_) { return false; }
}
function hasManagerSession(req) {
  if (!MANAGER_PASSWORD) return true; // sin pass → dashboard abierto (hasta configurarla)
  const cookie = String((req.headers && req.headers.cookie) || "");
  const hit = cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith("mgr_session="));
  return !!hit && safeEq(hit.slice("mgr_session=".length), managerToken());
}
// Guard de las APIs hacia Maven (edge functions): header apikey.
function apiGuard(req, res, next) {
  if (!API_KEY || req.get("apikey") !== API_KEY) return res.status(401).json({ error: "unauthorized" });
  next();
}

// ── Cliente GramJS + sesión persistida en /data ──────────────────────────────
let mainClient = null;
let connecting = null;
function readSession() { try { return fs.readFileSync(SESSION_FILE, "utf8").trim(); } catch (_) { return ""; } }
function writeSession(s) { fs.writeFileSync(SESSION_FILE, s); }

async function getClient() {
  if (mainClient && mainClient.connected) return mainClient;
  const saved = readSession();
  if (!saved) throw new Error("no logueado — entrá a /manager y logueá la cuenta de Telegram");
  if (!API_ID || !API_HASH) throw new Error("faltan TELEGRAM_API_ID / TELEGRAM_API_HASH");
  if (!connecting) {
    connecting = (async () => {
      const c = new TelegramClient(new StringSession(saved), API_ID, API_HASH, { connectionRetries: 5 });
      await c.connect();
      if (!(await c.isUserAuthorized())) throw new Error("sesión inválida/expirada — re-logueá en /manager");
      mainClient = c;
      return c;
    })().catch((e) => { connecting = null; throw e; });
  }
  return connecting;
}

// Flujo de login web (en memoria; una cuenta a la vez).
let loginFlow = null; // { client, phone, phoneCodeHash }

// ── APIs (apikey) ─────────────────────────────────────────────────────────────
app.get("/diag", apiGuard, async (req, res) => {
  try {
    const c = await getClient();
    const me = await c.getMe();
    res.json({ ok: true, account: me?.username || me?.firstName || String(me?.id) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

const URL_RE = /https?:\/\/[^\s)]+/gi;
function buildPermalink(handle, id) {
  const h = String(handle).replace(/^@/, "").replace(/^https?:\/\/t\.me\//i, "").replace(/\/.*$/, "");
  return `https://t.me/${h}/${id}`;
}

// Posts recientes (últimas `hours`) de un canal por @handle.
// SPIKE: `mediaDownloadable` baja la miniatura para confirmar si se puede (en
// canales protegidos/DRM suele fallar; el texto+links siempre llegan).
app.get("/channel/:handle/recent", apiGuard, async (req, res) => {
  const handle = req.params.handle;
  const hours = Number(req.query.hours) || 24;
  const sinceSec = Math.floor(Date.now() / 1000) - hours * 3600;
  try {
    const c = await getClient();
    const entity = await c.getEntity(handle);
    const isProtected = !!(entity && entity.noforwards);
    const msgs = await c.getMessages(entity, { limit: 50 });
    const posts = [];
    for (const m of msgs) {
      if (!m || !m.date || m.date < sinceSec) continue;
      const text = m.message || "";
      let hasMedia = !!m.media;
      let mediaDownloadable = false;
      if (hasMedia) {
        try {
          const buf = await c.downloadMedia(m, { thumb: -1 });
          mediaDownloadable = !!buf && buf.length > 0;
        } catch (_) { mediaDownloadable = false; }
      }
      posts.push({
        id: m.id, date: m.date, text,
        links: text.match(URL_RE) || [],
        hasMedia, mediaDownloadable,
        permalink: buildPermalink(handle, m.id),
      });
    }
    res.json({ ok: true, channel: handle, protected: isProtected, count: posts.length, posts });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

// ── Dashboard /manager ────────────────────────────────────────────────────────
const MANAGER_HTML = fs.readFileSync(__dirname + "/manager.html", "utf8");
const LOGIN_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Telegram Gateway — Acceso</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-slate-900 min-h-screen flex items-center justify-center p-4">
  <form id="f" class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
    <h1 class="text-xl font-bold mb-1">Telegram Gateway</h1>
    <p class="text-sm text-slate-500 mb-4">Ingresá la contraseña para administrar la cuenta de Telegram.</p>
    <input id="pw" type="password" autofocus placeholder="Contraseña" class="w-full px-3 py-2 rounded border border-slate-300 mb-3">
    <div id="err" class="text-sm text-red-600 mb-2 hidden">Contraseña incorrecta.</div>
    <button class="w-full py-2 rounded bg-sky-600 hover:bg-sky-700 text-white font-semibold">Entrar</button>
  </form>
  <script>
    document.getElementById('f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('err'); err.classList.add('hidden');
      try {
        const r = await fetch('/manager/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: document.getElementById('pw').value }) });
        if (r.ok) { const j = await r.json(); if (j.apikey) localStorage.setItem('apikey', j.apikey); location.replace('/manager'); }
        else err.classList.remove('hidden');
      } catch (_e) { err.classList.remove('hidden'); }
    });
  </script>
</body></html>`;

// Gate de /manager/* (excepto /manager y /manager/login) por cookie de sesión.
app.use((req, res, next) => {
  if (req.path === "/manager" || req.path === "/manager/login") return next();
  if (req.path.startsWith("/manager/")) {
    if (!hasManagerSession(req)) return res.status(401).json({ error: "no auth" });
  }
  next();
});

app.post("/manager/login", (req, res) => {
  const pw = (req.body && req.body.password) || "";
  if (!MANAGER_PASSWORD || !safeEq(pw, MANAGER_PASSWORD)) return res.status(401).json({ ok: false });
  res.cookie("mgr_session", managerToken(), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 1000 * 60 * 60 * 24 * 30 });
  res.json({ ok: true, apikey: API_KEY });
});

app.get("/manager", (req, res) => {
  if (!hasManagerSession(req)) return res.type("html").send(LOGIN_HTML);
  res.type("html").send(MANAGER_HTML);
});

// Estado del login de Telegram (para el dashboard).
app.get("/manager/status", async (req, res) => {
  try {
    if (!readSession()) return res.json({ loggedIn: false });
    const c = await getClient();
    const me = await c.getMe();
    res.json({ loggedIn: true, account: me?.username || me?.firstName || String(me?.id) });
  } catch (e) {
    res.json({ loggedIn: false, error: String((e && e.message) || e) });
  }
});

// Paso 1 del login: mandar el código al teléfono.
app.post("/manager/telegram/start", async (req, res) => {
  const phone = ((req.body && req.body.phone) || "").trim();
  if (!phone) return res.status(400).json({ ok: false, error: "falta teléfono" });
  if (!API_ID || !API_HASH) return res.status(400).json({ ok: false, error: "faltan TELEGRAM_API_ID/HASH" });
  try {
    const client = new TelegramClient(new StringSession(""), API_ID, API_HASH, { connectionRetries: 5 });
    await client.connect();
    const result = await client.sendCode({ apiId: API_ID, apiHash: API_HASH }, phone);
    loginFlow = { client, phone, phoneCodeHash: result.phoneCodeHash };
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

// Paso 2: verificar el código (+ 2FA si hace falta) y persistir la sesión.
app.post("/manager/telegram/verify", async (req, res) => {
  const code = ((req.body && req.body.code) || "").trim();
  const password = (req.body && req.body.password) || "";
  if (!loginFlow) return res.status(400).json({ ok: false, error: "no hay login en curso — empezá de nuevo" });
  const { client, phone, phoneCodeHash } = loginFlow;
  try {
    try {
      await client.invoke(new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode: code }));
    } catch (e) {
      if (String((e && e.errorMessage) || e).includes("SESSION_PASSWORD_NEEDED")) {
        if (!password) return res.status(401).json({ ok: false, need2fa: true });
        const pwdInfo = await client.invoke(new Api.account.GetPassword());
        const check = await computeCheck(pwdInfo, password);
        await client.invoke(new Api.auth.CheckPassword({ password: check }));
      } else { throw e; }
    }
    writeSession(client.session.save());
    mainClient = client;
    loginFlow = null;
    const me = await client.getMe();
    res.json({ ok: true, account: me?.username || me?.firstName || String(me?.id) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

// Cerrar sesión (borra la sesión persistida).
app.post("/manager/telegram/logout", async (req, res) => {
  try { if (mainClient) await mainClient.disconnect(); } catch (_) { /* noop */ }
  mainClient = null;
  try { fs.unlinkSync(SESSION_FILE); } catch (_) { /* noop */ }
  res.json({ ok: true });
});

app.get("/", (req, res) => res.json({ service: "telegram-gateway", ok: true }));

app.listen(PORT, () => console.log(`[telegram-gateway] escuchando en :${PORT}`));

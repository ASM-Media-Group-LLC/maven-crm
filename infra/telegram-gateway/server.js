// telegram-gateway — cuentas de Telegram vía MTProto (GramJS).
//
// S1 (canal de contacto): MULTI-CUENTA + ENVÍO, sobre el gateway original que solo
// leía canales para Promolog. Mismo patrón que baileys-gateway (multi-sesión):
//   · Cada cuenta = una sesión persistida en un VOLUMEN: /data/accounts/<id>.session
//     (+ <id>.json con metadata). Sobrevive reinicios.
//   · Login POR WEB en /manager (teléfono → código → 2FA), como el QR de WhatsApp.
//   · AUTH de las APIs hacia Maven: header `apikey: <API_KEY>` (igual que baileys).
//   · /manager protegido por MANAGER_PASSWORD (cookie HMAC).
//
// COMPATIBILIDAD HACIA ATRÁS (no romper Promolog):
//   · La sesión vieja en /data/telegram.session se MIGRA (copia, no mueve) a
//     accounts/main.session en el boot. Nunca se borra la vieja.
//   · Los endpoints de lectura de canales (/channel/join, /channel/:h/recent, /diag)
//     que Promolog llama SIN especificar cuenta usan la cuenta por defecto.
//
// SECRETOS (env, en Dokploy — NUNCA en repo/chat):
//   API_KEY, MANAGER_PASSWORD, TELEGRAM_API_ID, TELEGRAM_API_HASH, AUTH_DIR=/data

const express = require("express");
const fs = require("fs");
const crypto = require("crypto");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { computeCheck } = require("telegram/Password");
const { NewMessage } = require("telegram/events");

const PORT = parseInt(process.env.PORT || "8091", 10);
const API_KEY = process.env.API_KEY || "";
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD || "";
const API_ID = Number(process.env.TELEGRAM_API_ID || 0);
const API_HASH = process.env.TELEGRAM_API_HASH || "";
const AUTH_DIR = process.env.AUTH_DIR || "/data";
const INGEST_URL = process.env.INGEST_URL || "";       // edge telegram-ingest (bandeja); vacío = no-op
const INGEST_TOKEN = process.env.INGEST_TOKEN || "";   // token compartido con telegram-ingest
const LEGACY_SESSION_FILE = `${AUTH_DIR}/telegram.session`; // sesión mono-cuenta original
const ACCOUNTS_DIR = `${AUTH_DIR}/accounts`;

if (!API_KEY) console.error("[telegram-gateway] WARN: falta API_KEY (las APIs quedan inaccesibles)");
try { fs.mkdirSync(ACCOUNTS_DIR, { recursive: true }); } catch (_) { /* noop */ }

// Migración: la sesión vieja (mono-cuenta) pasa a ser la cuenta "main". COPIA, no
// mueve — la vieja queda intacta como respaldo. Solo si no existe ya main.session.
(function migrateLegacy() {
  try {
    const mainPath = `${ACCOUNTS_DIR}/main.session`;
    if (fs.existsSync(LEGACY_SESSION_FILE) && !fs.existsSync(mainPath)) {
      const s = fs.readFileSync(LEGACY_SESSION_FILE, "utf8").trim();
      if (s) {
        fs.writeFileSync(mainPath, s);
        if (!fs.existsSync(`${ACCOUNTS_DIR}/main.json`)) {
          fs.writeFileSync(`${ACCOUNTS_DIR}/main.json`, JSON.stringify({ id: "main", label: "Principal", createdAt: new Date().toISOString() }));
        }
        console.log("[telegram-gateway] migrada sesión legacy → accounts/main.session");
      }
    }
  } catch (e) { console.error("[telegram-gateway] migrateLegacy falló:", e.message); }
})();

const app = express();
app.use(express.json({ limit: "1mb" }));

// ── Auth del dashboard (HMAC de la pass con API_KEY) ──────────────────────────
const managerToken = () => crypto.createHmac("sha256", API_KEY).update("mgr:" + MANAGER_PASSWORD).digest("hex");
function safeEq(a, b) {
  const ba = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ba, bb); } catch (_) { return false; }
}
function hasManagerSession(req) {
  if (!MANAGER_PASSWORD) return true;
  const cookie = String((req.headers && req.headers.cookie) || "");
  const hit = cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith("mgr_session="));
  return !!hit && safeEq(hit.slice("mgr_session=".length), managerToken());
}
function apiGuard(req, res, next) {
  if (!API_KEY || req.get("apikey") !== API_KEY) return res.status(401).json({ error: "unauthorized" });
  next();
}

// ── Cuentas: sesiones persistidas en /data/accounts/<id>.session ──────────────
const ID_RE = /^[a-zA-Z0-9_-]{1,48}$/;
const sessionPath = (id) => `${ACCOUNTS_DIR}/${id}.session`;
const metaPath = (id) => `${ACCOUNTS_DIR}/${id}.json`;
function readSession(id) { try { return fs.readFileSync(sessionPath(id), "utf8").trim(); } catch (_) { return ""; } }
function writeSession(id, s) { fs.writeFileSync(sessionPath(id), s); }
function readMeta(id) { try { return JSON.parse(fs.readFileSync(metaPath(id), "utf8")); } catch (_) { return { id }; } }
function writeMeta(id, m) { fs.writeFileSync(metaPath(id), JSON.stringify({ id, ...m })); }
function listAccountIds() {
  try { return fs.readdirSync(ACCOUNTS_DIR).filter((f) => f.endsWith(".session")).map((f) => f.slice(0, -".session".length)); }
  catch (_) { return []; }
}
function defaultAccountId() {
  const ids = listAccountIds();
  return ids.includes("main") ? "main" : (ids[0] || null);
}

const clients = new Map(); // id → TelegramClient conectado
const connecting = new Map(); // id → promise en vuelo

async function getClient(id) {
  if (!id) throw new Error("no hay cuentas de Telegram vinculadas — agregá una en /manager");
  const cached = clients.get(id);
  if (cached && cached.connected) return cached;
  const saved = readSession(id);
  if (!saved) throw new Error(`cuenta '${id}' sin sesión — re-logueá en /manager`);
  if (!API_ID || !API_HASH) throw new Error("faltan TELEGRAM_API_ID / TELEGRAM_API_HASH");
  if (!connecting.has(id)) {
    connecting.set(id, (async () => {
      const c = new TelegramClient(new StringSession(saved), API_ID, API_HASH, { connectionRetries: 5 });
      await c.connect();
      if (!(await c.isUserAuthorized())) throw new Error(`sesión de '${id}' inválida/expirada — re-logueá`);
      clients.set(id, c);
      attachIngestListener(id, c);
      return c;
    })().finally(() => connecting.delete(id)));
  }
  return connecting.get(id);
}
// Cuenta por defecto (Promolog y endpoints sin :id).
async function getDefaultClient() { return getClient(defaultAccountId()); }

// ── Ingest de entrantes → edge telegram-ingest (bandeja) ──────────────────────
async function postIngest(accountId, peer, message) {
  if (!INGEST_URL || !INGEST_TOKEN) return; // sin configurar → no-op (no rompe Promolog)
  try {
    await fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-telegram-ingest-token": INGEST_TOKEN },
      body: JSON.stringify({ accountId, peer, message }),
    });
  } catch (e) { console.error(`[telegram-gateway] ingest POST falló (${accountId}):`, e.message); }
}

// Adjunta un handler de mensajes ENTRANTES (solo DMs de usuarios; canales/grupos los
// sigue manejando Promolog aparte) que postea a la bandeja. Idempotente por cliente.
function attachIngestListener(id, client) {
  if (!client || client.__ingestAttached) return;
  client.__ingestAttached = true;
  client.addEventHandler(async (event) => {
    try {
      const msg = event && event.message;
      if (!msg || msg.out) return;    // solo entrantes (no lo que enviamos nosotros)
      if (!event.isPrivate) return;   // solo chats privados (DMs)
      const sender = await msg.getSender().catch(() => null);
      const peerId = msg.senderId != null ? String(msg.senderId)
        : (sender && sender.id != null ? String(sender.id) : null);
      if (!peerId) return;
      const name = sender ? ([sender.firstName, sender.lastName].filter(Boolean).join(" ") || null) : null;
      const type = msg.media ? (msg.photo ? "photo" : (msg.voice ? "voice" : (msg.document ? "document" : "media"))) : "text";
      await postIngest(id, {
        id: peerId,
        username: (sender && sender.username) || null,
        name,
        phone: (sender && sender.phone) || null,
      }, {
        id: msg.id,
        direction: "in",
        text: msg.message || null,
        type,
        senderId: peerId,
        date: msg.date,
      });
    } catch (e) { console.error(`[telegram-gateway] handler ingest (${id}):`, e.message); }
  }, new NewMessage({}));
  console.log(`[telegram-gateway] listener de bandeja adjunto a '${id}'`);
}

// Login web en curso, keyed por id de cuenta (una cuenta se loguea a la vez, pero
// soportamos varios flows por si acaso). { client, phone, phoneCodeHash, label }
const loginFlows = new Map();

// ── APIs (apikey) — lectura de canales (Promolog) ─────────────────────────────
app.get("/diag", apiGuard, async (req, res) => {
  try {
    const c = await getDefaultClient();
    const me = await c.getMe();
    res.json({ ok: true, account: me?.username || me?.firstName || String(me?.id) });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

const URL_RE = /https?:\/\/[^\s)]+/gi;

function permalinkFor(entity, id) {
  const uname = entity && entity.username;
  if (uname) return `https://t.me/${uname}/${id}`;
  const cid = entity && entity.id != null ? String(entity.id) : "0";
  return `https://t.me/c/${cid}/${id}`;
}
function channelMeta(entity) {
  if (!entity) return null;
  return { id: entity.id != null ? String(entity.id) : null, title: entity.title || null, username: entity.username || null, protected: !!entity.noforwards };
}
async function recentPosts(c, entity, hours) {
  const sinceSec = Math.floor(Date.now() / 1000) - hours * 3600;
  const msgs = await c.getMessages(entity, { limit: 50 });
  const posts = [];
  for (const m of msgs) {
    if (!m || !m.date || m.date < sinceSec) continue;
    const text = m.message || "";
    const hasMedia = !!m.media;
    let mediaDownloadable = false;
    if (hasMedia) {
      try { const buf = await c.downloadMedia(m, { thumb: -1 }); mediaDownloadable = !!buf && buf.length > 0; } catch (_) { mediaDownloadable = false; }
    }
    posts.push({ id: m.id, date: m.date, text, links: text.match(URL_RE) || [], hasMedia, mediaDownloadable, permalink: permalinkFor(entity, m.id) });
  }
  return posts;
}
function parseChannelInput(input) {
  let s = String(input || "").trim();
  s = s.replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "").replace(/^@/, "");
  const inv = s.match(/^\+([\w-]+)/) || s.match(/^joinchat\/([\w-]+)/i);
  if (inv) return { kind: "invite", hash: inv[1] };
  return { kind: "public", username: s.replace(/[?/].*$/, "") };
}
async function joinAndResolve(c, input) {
  const p = parseChannelInput(input);
  let joined = false, alreadyMember = false, pending = false, entity = null;
  if (p.kind === "invite") {
    let info = null;
    try { info = await c.invoke(new Api.messages.CheckChatInvite({ hash: p.hash })); } catch (_) { /* aflora abajo */ }
    if (info && info.chat) { entity = info.chat; alreadyMember = true; }
    else {
      try { const upd = await c.invoke(new Api.messages.ImportChatInvite({ hash: p.hash })); entity = (upd.chats && upd.chats[0]) || null; joined = true; }
      catch (e) {
        const msg = String((e && e.errorMessage) || (e && e.message) || e);
        if (msg.includes("USER_ALREADY_PARTICIPANT")) alreadyMember = true;
        else if (msg.includes("INVITE_REQUEST_SENT")) pending = true;
        else throw e;
      }
    }
  } else {
    entity = await c.getEntity(p.username);
    try { await c.invoke(new Api.channels.JoinChannel({ channel: entity })); joined = true; }
    catch (e) { const msg = String((e && e.errorMessage) || (e && e.message) || e); if (msg.includes("USER_ALREADY_PARTICIPANT")) alreadyMember = true; else throw e; }
  }
  return { entity, joined, alreadyMember, pending };
}

app.get("/channel/:handle/recent", apiGuard, async (req, res) => {
  try {
    const c = await getDefaultClient();
    const entity = await c.getEntity(req.params.handle);
    const posts = await recentPosts(c, entity, Number(req.query.hours) || 24);
    res.json({ ok: true, channel: req.params.handle, protected: !!entity.noforwards, count: posts.length, posts });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

app.post("/channel/join", apiGuard, async (req, res) => {
  const link = ((req.body && (req.body.link || req.body.handle)) || "").trim();
  const hours = Number(req.body && req.body.hours) || 24;
  if (!link) return res.status(400).json({ ok: false, error: "falta link" });
  try {
    const c = await getDefaultClient();
    const { entity, joined, alreadyMember, pending } = await joinAndResolve(c, link);
    if (pending) return res.json({ ok: true, pending: true, note: "solicitud de unión enviada — esperá aprobación del admin del canal" });
    if (!entity) return res.status(404).json({ ok: false, error: "no se pudo resolver el canal (link inválido/expirado)" });
    const posts = await recentPosts(c, entity, hours);
    res.json({ ok: true, joined, alreadyMember, channel: channelMeta(entity), protected: !!entity.noforwards, count: posts.length, posts });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

// ── APIs (apikey) — ENVÍO (S1) ────────────────────────────────────────────────
// POST /message/sendText/:id  body { to, text }  → manda un DM/mensaje desde la
// cuenta :id. `to` = @username, t.me/user, o id numérico de chat. (Enviar a un
// teléfono suelto que no está en contactos no está soportado todavía.)
app.post("/message/sendText/:id", apiGuard, async (req, res) => {
  const id = req.params.id;
  const to = ((req.body && req.body.to) || "").toString().trim();
  const text = (req.body && req.body.text) || "";
  if (!ID_RE.test(id)) return res.status(400).json({ ok: false, error: "id de cuenta inválido" });
  if (!to || !text) return res.status(400).json({ ok: false, error: "faltan 'to' y/o 'text'" });
  try {
    const c = await getClient(id);
    let peer = to.replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "").replace(/^@/, "");
    const entity = await c.getEntity(/^\d+$/.test(peer) ? Number(peer) : peer);
    const sent = await c.sendMessage(entity, { message: String(text) });
    res.json({ ok: true, id: sent?.id ?? null });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

// Resuelve un username / t.me link / id numérico → peer (para ABRIR una conversación
// desde Maven, ya que la bandeja necesita el peer_id nativo). Usa la cuenta DEFAULT y
// devuelve qué account_id usó (así la conversación queda ligada a esa línea). Telegram
// NO resuelve teléfono→usuario en frío → esto solo funciona con username/link/id.
app.post("/resolve", apiGuard, async (req, res) => {
  const to = ((req.body && req.body.to) || "").toString().trim();
  if (!to) return res.status(400).json({ ok: false, error: "falta 'to'" });
  try {
    const accountId = defaultAccountId();
    if (!accountId) return res.status(400).json({ ok: false, error: "no hay cuentas vinculadas" });
    const c = await getClient(accountId);
    const handle = to.replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "").replace(/^@/, "");
    const entity = await c.getEntity(/^\d+$/.test(handle) ? Number(handle) : handle);
    const name = [entity && entity.firstName, entity && entity.lastName].filter(Boolean).join(" ").trim()
      || (entity && entity.title) || null;
    res.json({
      ok: true,
      account_id: accountId,
      peer_id: entity && entity.id != null ? String(entity.id) : null,
      username: (entity && entity.username) || null,
      name,
      phone: (entity && entity.phone) || null,
    });
  } catch (e) { res.status(404).json({ ok: false, error: String((e && e.message) || e) }); }
});

// ── Dashboard /manager ────────────────────────────────────────────────────────
const MANAGER_HTML = fs.readFileSync(__dirname + "/manager.html", "utf8");
const LOGIN_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Telegram Gateway — Acceso</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-slate-900 min-h-screen flex items-center justify-center p-4">
  <form id="f" class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
    <h1 class="text-xl font-bold mb-1">Telegram Gateway</h1>
    <p class="text-sm text-slate-500 mb-4">Ingresá la contraseña para administrar las cuentas de Telegram.</p>
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

app.use((req, res, next) => {
  if (req.path === "/manager" || req.path === "/manager/login") return next();
  if (req.path.startsWith("/manager/")) { if (!hasManagerSession(req)) return res.status(401).json({ error: "no auth" }); }
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

// Lista de cuentas + estado (para el dashboard multi-cuenta).
app.get("/manager/accounts", async (req, res) => {
  const ids = listAccountIds();
  const out = [];
  for (const id of ids) {
    const meta = readMeta(id);
    let loggedIn = false, account = null, error = null;
    try { const c = await getClient(id); const me = await c.getMe(); loggedIn = true; account = me?.username || me?.firstName || String(me?.id); }
    catch (e) { error = String((e && e.message) || e); }
    out.push({ id, label: meta.label || id, isDefault: id === defaultAccountId(), loggedIn, account, error });
  }
  res.json({ ok: true, accounts: out });
});

// Compat: el estado mono-cuenta viejo (por si algo lo llama). Mira la default.
app.get("/manager/status", async (req, res) => {
  try {
    const id = defaultAccountId();
    if (!id) return res.json({ loggedIn: false });
    const c = await getClient(id);
    const me = await c.getMe();
    res.json({ loggedIn: true, account: me?.username || me?.firstName || String(me?.id) });
  } catch (e) { res.json({ loggedIn: false, error: String((e && e.message) || e) }); }
});

// Paso 1 del login: mandar el código. Body { phone, label? }. Genera un id de cuenta.
app.post("/manager/telegram/start", async (req, res) => {
  const phone = ((req.body && req.body.phone) || "").trim();
  const label = ((req.body && req.body.label) || "").trim();
  if (!phone) return res.status(400).json({ ok: false, error: "falta teléfono" });
  if (!API_ID || !API_HASH) return res.status(400).json({ ok: false, error: "faltan TELEGRAM_API_ID/HASH" });
  // id: primer login sin cuentas → "main" (compat); si no, uno nuevo derivado del tiempo.
  const id = listAccountIds().length === 0 ? "main" : `acct_${Date.now().toString(36)}`;
  try {
    const client = new TelegramClient(new StringSession(""), API_ID, API_HASH, { connectionRetries: 5 });
    await client.connect();
    const result = await client.sendCode({ apiId: API_ID, apiHash: API_HASH }, phone);
    loginFlows.set(id, { client, phone, phoneCodeHash: result.phoneCodeHash, label: label || phone });
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

// Paso 2: verificar código (+2FA) y persistir la sesión de la cuenta :id.
app.post("/manager/telegram/verify", async (req, res) => {
  const id = ((req.body && req.body.id) || "").trim();
  const code = ((req.body && req.body.code) || "").trim();
  const password = (req.body && req.body.password) || "";
  const flow = loginFlows.get(id);
  if (!flow) return res.status(400).json({ ok: false, error: "no hay login en curso para esa cuenta — empezá de nuevo" });
  const { client, phone, phoneCodeHash, label } = flow;
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
    writeSession(id, client.session.save());
    writeMeta(id, { label: label || id, createdAt: new Date().toISOString() });
    clients.set(id, client);
    attachIngestListener(id, client);
    loginFlows.delete(id);
    const me = await client.getMe();
    res.json({ ok: true, id, account: me?.username || me?.firstName || String(me?.id) });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

// Cerrar sesión de una cuenta (borra su sesión persistida). Sin :id → la default (compat).
async function logoutAccount(id) {
  if (!id) return;
  try { const c = clients.get(id); if (c) await c.disconnect(); } catch (_) { /* noop */ }
  clients.delete(id);
  try { fs.unlinkSync(sessionPath(id)); } catch (_) { /* noop */ }
  try { fs.unlinkSync(metaPath(id)); } catch (_) { /* noop */ }
}
app.post("/manager/telegram/logout/:id", async (req, res) => { await logoutAccount(req.params.id); res.json({ ok: true }); });
app.post("/manager/telegram/logout", async (req, res) => { await logoutAccount(defaultAccountId()); res.json({ ok: true }); });

app.get("/", (req, res) => res.json({ service: "telegram-gateway", ok: true, accounts: listAccountIds().length }));

app.listen(PORT, () => console.log(`[telegram-gateway] escuchando en :${PORT} — cuentas: ${listAccountIds().join(", ") || "(ninguna)"}`));

// Boot: conectar todas las cuentas y dejar el listener de bandeja activo para
// recibir entrantes en tiempo real (si no, la conexión es lazy = offline = no llegan
// eventos). Cada cuenta falla de forma aislada; no rompe el arranque.
if (INGEST_URL && INGEST_TOKEN) {
  (async () => {
    for (const id of listAccountIds()) {
      try { const c = await getClient(id); attachIngestListener(id, c); }
      catch (e) { console.error(`[telegram-gateway] boot connect '${id}' falló:`, e.message); }
    }
  })();
}

// Maven Baileys Gateway -- HTTP wrapper sobre Baileys para Maven Bot.
//
// Implementa un subset MINIMO del contract de Evolution API que usan
// nuestras edge functions:
//
//   POST /message/sendText/:instance
//        Body: { number, text }  o  { number, options, textMessage: { text } }
//        Response: { key: { id } }
//
//   GET  /                      -- healthcheck
//   GET  /instance/connect/:instance  -- devuelve QR (data URL PNG) si esta
//                                       disconnected, o status si conectado
//   GET  /instance/connectionState/:instance -- estado actual
//
// Forwardea TODOS los messages.upsert al WEBHOOK_URL con el mismo shape
// que Evolution para que whatsapp-ingest no requiera cambios:
//
//   POST WEBHOOK_URL
//   {
//     event: "messages.upsert",
//     instance: "<instance-name>",
//     data: { key, pushName, message, messageTimestamp, participant }
//   }
//
// AUTH: header `apikey: <API_KEY>` requerido en todos los endpoints
// excepto `/`.
//
// LID HANDLING: Baileys 7.0.0-rc.9 ya tiene mejor soporte de LID que las
// versiones de v1.8.x. Si igual aparece el "SessionError: No sessions"
// para algun @lid silencioso, el catch interno absorbe el error y deja
// que el sender key se distribuya lazy (proximo decrypt del miembro).
// Esta es la misma idea que el fix de Evolution v2.4.0-rc2.
//
// Estado de la session se persiste en /data/auth (volumen Docker). Sin
// ese volumen, cada restart pide QR de cero.

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, downloadContentFromMessage } = require('baileys');
const express = require('express');
const pino = require('pino');
const QRCode = require('qrcode');
const { spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '8080', 10);
const API_KEY = process.env.API_KEY || '';
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'maven-bot';
const AUTH_DIR = process.env.AUTH_DIR || '/data/auth';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const logger = pino({ level: LOG_LEVEL });

if (!API_KEY) {
  logger.error('API_KEY env var is required');
  process.exit(1);
}

// Manager UI HTML -- single page dashboard. Inspirado en Evolution Manager,
// codigo nuestro. Vanilla JS + Tailwind CDN. La apikey se guarda en
// sessionStorage del browser para acciones que la requieren.
const MANAGER_HTML = fs.readFileSync(__dirname + '/manager.html', 'utf8');

// ── Login del dashboard (NO hardcodeado, server-side) ────────────────────────
// La password vive en la env var MANAGER_PASSWORD (se setea en Dokploy, nunca en
// el código). Si no está seteada, el login queda DESHABILITADO (dashboard público
// como antes) para no bloquear hasta configurarla. El token de sesión es un HMAC
// de la password con la API_KEY como secret: determinístico (sobrevive reinicios)
// y NO revela la password. Se valida server-side; el cliente solo guarda el token
// en una cookie HttpOnly (no legible por JS).
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD || '';
const managerToken = () => crypto.createHmac('sha256', API_KEY).update('mgr:' + MANAGER_PASSWORD).digest('hex');
function safeEq(a, b) {
  const ba = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ba, bb); } catch (e) { return false; }
}
function hasManagerSession(req) {
  if (!MANAGER_PASSWORD) return true; // login deshabilitado hasta configurar la env var
  const cookie = String((req.headers && req.headers.cookie) || '');
  const hit = cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('mgr_session='));
  if (!hit) return false;
  return safeEq(hit.slice('mgr_session='.length), managerToken());
}
const LOGIN_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Maven · Gateway — Acceso</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-slate-900 min-h-screen flex items-center justify-center p-4">
  <form id="f" class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
    <h1 class="text-xl font-bold mb-1">Maven · Gateway</h1>
    <p class="text-sm text-slate-500 mb-4">Ingresá la contraseña para administrar las líneas de WhatsApp.</p>
    <input id="pw" type="password" autofocus placeholder="Contraseña" class="w-full px-3 py-2 rounded border border-slate-300 mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500">
    <label class="flex items-center gap-2 text-sm text-slate-600 mb-3 select-none cursor-pointer"><input id="rm" type="checkbox" checked class="rounded border-slate-300"> Recordarme en este dispositivo</label>
    <div id="err" class="text-sm text-red-600 mb-2 hidden">Contraseña incorrecta.</div>
    <button class="w-full py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">Entrar</button>
  </form>
  <script>
    document.getElementById('f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('err'); err.classList.add('hidden');
      try {
        const r = await fetch('/manager/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: document.getElementById('pw').value, remember: document.getElementById('rm').checked }) });
        if (r.ok) { const j = await r.json(); if (j.apikey) localStorage.setItem('apikey', j.apikey); location.replace('/manager'); }
        else { err.classList.remove('hidden'); }
      } catch (_e) { err.classList.remove('hidden'); }
    });
  </script>
</body></html>`;

// Sesiones multi-número (Fase 2). Cada número/instancia tiene su propia sesión
// (sock, conexión, QR, métricas). `sessions` mapea instanceName -> sessionState.
// RETROCOMPAT: `state` apunta a la sesión default (INSTANCE_NAME) para que las
// ~71 referencias existentes sigan funcionando mientras migramos los handlers
// a multi-sesión, sin romper el bot que ya corre.
const sessions = new Map();

function createSession(instanceName) {
  return {
    instanceName,
    sock: null,
    connection: 'disconnected', // 'disconnected' | 'connecting' | 'open' | 'close'
    qrRaw: null,                // raw QR string del evento connection.update
    qrDataUrl: null,            // PNG data URL precomputado
    lastError: null,
    // Metrics
    bootedAt: Date.now(),
    connectedAt: null,          // timestamp del ultimo 'open'
    reconnectCount: 0,          // cuántas veces reconectó (salud)
    lastDisconnectAt: null,     // timestamp de la última caída
    baileysVersion: null,       // versión de WhatsApp Web que negoció Baileys
    msgsIn: 0,
    msgsOut: 0,
    msgsInToday: 0,
    msgsOutToday: 0,
    todayDate: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
    // Profile info (lo cargamos al conectar)
    profileName: null,
    profileNumber: null,
    profilePicUrl: null,
    // Buffer circular de actividad reciente (last 30).
    recentEvents: [],
    // Config por línea (settings + webhook). Persistida en AUTH_DIR/<inst>/manager-config.json.
    config: { webhookUrl: null, rejectCalls: false, markRead: false, alwaysOnline: true, syncFullHistory: false },
    // Tráfico por bucket de tiempo: hourly["YYYY-MM-DDTHH"]={in,out}, daily["YYYY-MM-DD"]={in,out}.
    traffic: { hourly: {}, daily: {} },
    sseClients: [], // suscriptores del monitor en vivo (SSE)
  };
}

function getSession(instanceName) {
  let s = sessions.get(instanceName);
  if (!s) { s = createSession(instanceName); sessions.set(instanceName, s); }
  return s;
}

// Config por línea — persistida en el volumen para sobrevivir reinicios.
function instanceDir(instanceName) {
  return instanceName === INSTANCE_NAME ? AUTH_DIR : `${AUTH_DIR}/${instanceName}`;
}
function loadConfig(s) {
  try {
    const raw = fs.readFileSync(`${instanceDir(s.instanceName)}/manager-config.json`, 'utf8');
    s.config = { ...s.config, ...JSON.parse(raw) };
  } catch (e) { /* sin config previa → defaults */ }
}
function saveConfig(s) {
  try {
    const dir = instanceDir(s.instanceName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/manager-config.json`, JSON.stringify(s.config));
  } catch (e) { logger.warn({ err: e.message }, 'saveConfig failed'); }
}

// Métricas de tráfico (por hora y por día) — persistidas en el volumen.
function bumpTraffic(s, dir) {
  const now = new Date();
  const hKey = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const dKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const t = s.traffic || (s.traffic = { hourly: {}, daily: {} });
  (t.hourly[hKey] || (t.hourly[hKey] = { in: 0, out: 0 }))[dir] += 1;
  (t.daily[dKey] || (t.daily[dKey] = { in: 0, out: 0 }))[dir] += 1;
  const cutH = new Date(now.getTime() - 48 * 3600 * 1000).toISOString().slice(0, 13);
  for (const k of Object.keys(t.hourly)) if (k < cutH) delete t.hourly[k];
  const cutD = new Date(now.getTime() - 60 * 86400 * 1000).toISOString().slice(0, 10);
  for (const k of Object.keys(t.daily)) if (k < cutD) delete t.daily[k];
}
function loadMetrics(s) {
  try {
    const m = JSON.parse(fs.readFileSync(`${instanceDir(s.instanceName)}/metrics.json`, 'utf8'));
    if (m && m.hourly && m.daily) s.traffic = m;
  } catch (e) { /* sin métricas previas */ }
}
function saveMetrics(s) {
  try {
    const dir = instanceDir(s.instanceName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/metrics.json`, JSON.stringify(s.traffic));
  } catch (e) { /* best-effort */ }
}

// Sesión default (el número histórico, INSTANCE_NAME). Las referencias `state.`
// del código actual operan sobre ésta hasta migrar cada handler a multi-sesión.
const state = getSession(INSTANCE_NAME);

// Resuelve la sesión de una request por :instance. RETROCOMPAT: si la instancia
// pedida aún no existe (modo single-bot, o el nombre que Maven manda hoy), cae en
// la sesión default → comportamiento idéntico al actual hasta que arranque un 2º
// número. El ruteo solo diverge cuando una segunda sesión existe de verdad.
function sessionFromReq(req) {
  const name = req.params && req.params.instance;
  return name && sessions.has(name) ? sessions.get(name) : state;
}

const RECENT_MAX = 30;

function pushRecent(event, s = state) {
  const item = { ...event, at: new Date().toISOString() };
  s.recentEvents.unshift(item);
  if (s.recentEvents.length > RECENT_MAX) s.recentEvents.length = RECENT_MAX;
  if (event.kind === 'in' || event.kind === 'out') bumpTraffic(s, event.kind);
  // Monitor en vivo (SSE): empujar el evento a los suscriptores de esta línea.
  if (s.sseClients && s.sseClients.length) {
    const data = 'data: ' + JSON.stringify(item) + '\n\n';
    for (const c of s.sseClients) { try { c.write(data); } catch (e) { /* cliente caído */ } }
  }
}

function rolloverDayIfNeeded(s = state) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== s.todayDate) {
    s.todayDate = today;
    s.msgsInToday = 0;
    s.msgsOutToday = 0;
  }
}

// ---------------------------------------------------------------------------
// Baileys boot + reconnect loop
// ---------------------------------------------------------------------------

async function startSocket(instanceName = INSTANCE_NAME) {
  const s = getSession(instanceName);
  loadConfig(s);
  loadMetrics(s);
  s.connection = 'connecting';
  s.qrRaw = null;
  s.qrDataUrl = null;

  // El número default conserva su AUTH_DIR histórico (no romper credenciales en
  // prod); los números nuevos usan un subdirectorio propio por instancia.
  const authPath = instanceName === INSTANCE_NAME ? AUTH_DIR : `${AUTH_DIR}/${instanceName}`;
  const { state: authState, saveCreds } = await useMultiFileAuthState(authPath);
  let version;
  try {
    const fetched = await fetchLatestBaileysVersion();
    version = fetched.version;
    s.baileysVersion = Array.isArray(version) ? version.join('.') : String(version);
    logger.info({ version }, 'Using Baileys version');
  } catch (e) {
    logger.warn({ err: e.message }, 'fetchLatestBaileysVersion failed, using default');
  }

  s.sock = makeWASocket({
    version,
    auth: authState,
    logger: pino({ level: 'warn' }),
    browser: Browsers.macOS('Maven Asistente'),
    // No imprime QR en stdout -- lo servimos por HTTP.
    printQRInTerminal: false,
    // generateHighQualityLinkPreview: false,
    syncFullHistory: s.config.syncFullHistory === true,
    markOnlineOnConnect: s.config.alwaysOnline !== false,
  });

  s.sock.ev.on('creds.update', saveCreds);

  // Rechazar llamadas entrantes si la línea lo tiene activado (settings).
  s.sock.ev.on('call', async (calls) => {
    if (!s.config.rejectCalls) return;
    for (const c of (Array.isArray(calls) ? calls : [])) {
      if (c && c.status === 'offer') {
        try { await s.sock.rejectCall(c.id, c.from); } catch (e) { logger.warn({ err: e.message }, 'rejectCall failed'); }
      }
    }
  });

  s.sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      s.qrRaw = qr;
      try {
        s.qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 1 });
        logger.info({ instance: instanceName }, 'QR refreshed (data URL ready)');
      } catch (e) {
        logger.error({ err: e.message }, 'QR encode failed');
      }
    }

    if (connection === 'open') {
      s.connection = 'open';
      s.qrRaw = null;
      s.qrDataUrl = null;
      s.lastError = null;
      s.connectedAt = Date.now();
      // Carga profile info en background -- no bloqueante.
      loadProfileInfo(s).catch((e) => logger.warn({ err: e.message }, 'profile load failed'));
      pushRecent({ kind: 'connection', state: 'open' }, s);
      logger.info({ instance: instanceName }, 'Connected to WhatsApp');
    } else if (connection === 'close') {
      s.connection = 'close';
      s.lastDisconnectAt = Date.now();
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      s.lastError = lastDisconnect?.error?.message || 'unknown';
      logger.warn({ instance: instanceName, statusCode, err: s.lastError }, 'Connection closed');

      const loggedOut = statusCode === DisconnectReason.loggedOut;
      if (loggedOut) {
        logger.error({ instance: instanceName }, 'Logged out by WhatsApp -- clear AUTH_DIR and re-scan QR');
        // No auto-reconnect on logout: necesita rescanear.
      } else {
        // Reconnect con backoff.
        s.reconnectCount += 1;
        const delay = 3000;
        logger.info({ instance: instanceName, delay }, 'Reconnecting');
        setTimeout(() => startSocket(instanceName).catch((e) => logger.error({ err: e.message }, 'reconnect failed')), delay);
      }
    } else if (connection === 'connecting') {
      s.connection = 'connecting';
    }
  });

  s.sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      // Tracking: contamos solo mensajes externos (no echo de nuestros sends).
      if (!m.key?.fromMe) {
        rolloverDayIfNeeded(s);
        s.msgsIn += 1;
        s.msgsInToday += 1;
        pushRecent({
          kind: 'in',
          jid: m.key?.remoteJid,
          from: m.pushName || m.key?.participant || m.key?.remoteJid,
          body: extractMsgPreview(m.message),
        }, s);
        // Marcar como leído si la línea lo tiene activado (settings).
        if (s.config.markRead && m.key) {
          try { await s.sock.readMessages([m.key]); } catch (e) { /* best-effort */ }
        }
      }
      const webhook = s.config.webhookUrl || WEBHOOK_URL;
      if (webhook) {
        try {
          await forwardMessage(m, s, webhook);
        } catch (e) {
          logger.error({ err: e.message }, 'forwardMessage failed');
        }
      }
    }
  });

  // ACK / recibos de entrega → palomitas de WhatsApp. Baileys emite
  // 'messages.update' con update.status (2 server, 3 entregado, 4 leído).
  // Solo nos interesan NUESTROS salientes (key.fromMe); los reenviamos al
  // webhook para que Maven avance wa_conversation_messages.status.
  s.sock.ev.on('messages.update', async (updates) => {
    const webhook = s.config.webhookUrl || WEBHOOK_URL;
    if (!webhook || !Array.isArray(updates)) return;
    const items = [];
    for (const u of updates) {
      if (!u?.key?.fromMe || !u.key?.id) continue;
      const mapped = mapBaileysStatus(u.update?.status);
      if (mapped) items.push({ id: u.key.id, status: mapped });
    }
    if (!items.length) return;
    try { await forwardStatus(items, s, webhook); }
    catch (e) { logger.error({ err: e.message }, 'forwardStatus failed'); }
  });
}

// Carga el perfil del bot tras conectar. Le pedimos a Baileys el numero
// + profile pic URL para mostrar en el dashboard.
async function loadProfileInfo(s = state) {
  if (!s.sock) return;
  try {
    const me = s.sock.user;
    if (me) {
      s.profileName = me.name || null;
      s.profileNumber = me.id ? me.id.split('@')[0].split(':')[0] : null;
    }
    if (me?.id) {
      try {
        s.profilePicUrl = await s.sock.profilePictureUrl(me.id, 'image');
      } catch {
        s.profilePicUrl = null;
      }
    }
  } catch (e) {
    logger.warn({ err: e.message }, 'loadProfileInfo error');
  }
}

// Extract preview safe del shape de mensaje de Baileys.
function extractMsgPreview(message) {
  if (!message) return '';
  if (typeof message.conversation === 'string') return message.conversation.slice(0, 120);
  if (message.extendedTextMessage?.text) return String(message.extendedTextMessage.text).slice(0, 120);
  if (message.imageMessage) return '[imagen]' + (message.imageMessage.caption ? ' ' + message.imageMessage.caption.slice(0, 80) : '');
  if (message.audioMessage) return '[audio ' + (message.audioMessage.seconds || '?') + 's]';
  if (message.videoMessage) return '[video]';
  if (message.documentMessage) return '[doc: ' + (message.documentMessage.fileName || '?') + ']';
  if (message.stickerMessage) return '[sticker]';
  if (message.reactionMessage) return '[reaction ' + (message.reactionMessage.text || '') + ']';
  return '[' + Object.keys(message).slice(0, 2).join(',') + ']';
}

async function forwardMessage(m, s = state, webhookUrl = WEBHOOK_URL) {
  // Shape compatible con parseEvolutionApiMessage en _shared/whatsapp.ts:
  //   { event, instance, data: { key, pushName, message, messageTimestamp, participant } }
  // `instance` reporta QUÉ número recibió el msg → el ingest enruta al bot correcto.
  const payload = {
    event: 'messages.upsert',
    instance: s.instanceName,
    data: {
      key: m.key,
      pushName: m.pushName,
      message: m.message,
      messageTimestamp: m.messageTimestamp,
      participant: m.key?.participant ?? null,
    },
  };

  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    logger.warn({ status: resp.status, body: txt.slice(0, 200) }, 'webhook returned non-2xx');
  }
}

// Mapea el status numérico de Baileys (proto.WebMessageInfo.Status) al estado
// de la bandeja: 0 ERROR, 1 PENDING, 2 SERVER_ACK, 3 DELIVERY_ACK, 4 READ, 5 PLAYED.
function mapBaileysStatus(st) {
  if (st == null) return null;
  const n = typeof st === 'number'
    ? st
    : ({ ERROR: 0, PENDING: 1, SERVER_ACK: 2, DELIVERY_ACK: 3, READ: 4, PLAYED: 5 })[String(st).toUpperCase()];
  if (n === 0) return 'failed';
  if (n === 1 || n === 2) return 'sent';
  if (n === 3) return 'delivered';
  if (n === 4 || n === 5) return 'read';
  return null;
}

// Reenvía los ACK (palomitas) al MISMO webhook que los mensajes. El ingest
// detecta `statusUpdates` y hace UPDATE del saliente por external_id (key.id).
async function forwardStatus(items, s = state, webhookUrl = WEBHOOK_URL) {
  const payload = { event: 'messages.update', instance: s.instanceName, statusUpdates: items };
  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    logger.warn({ status: resp.status, body: txt.slice(0, 200) }, 'status webhook non-2xx');
  }
}

// ---------------------------------------------------------------------------
// JID resolution
// ---------------------------------------------------------------------------
// Aceptamos varios formatos en el campo `number`:
//   "120363xxx@g.us"   -> grupo, se usa tal cual
//   "120363xxx-12345"  -> grupo legacy (sin sufijo), lo completamos
//   "57322xxx@s.whatsapp.net" -> DM phone, tal cual
//   "57322xxx@lid"     -> DM LID anonimizado, tal cual
//   "57322xxx"         -> phone sin sufijo, asumimos @s.whatsapp.net

function resolveJid(numberOrJid) {
  const s = String(numberOrJid ?? '').trim();
  if (!s) return null;
  if (s.includes('@')) return s; // ya viene con sufijo
  // Heuristica: grupos legacy tienen guion (creator-timestamp), DMs solo digitos.
  if (s.includes('-')) return `${s}@g.us`;
  return `${s}@s.whatsapp.net`;
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '5mb' }));

// Gate del dashboard: las APIs de lectura /manager/* requieren sesión (login con
// MANAGER_PASSWORD). Se eximen GET /manager (sirve login o dashboard) y POST
// /manager/login. NO afecta las acciones (/instance, /profile, /message), que
// siguen con su apikey (middleware de más abajo, intacto para las edge functions).
app.use((req, res, next) => {
  if (!req.path.startsWith('/manager')) return next();
  if (req.path === '/manager' || req.path === '/manager/login') return next();
  if (hasManagerSession(req)) return next();
  return res.status(401).json({ error: 'login_required' });
});

// Healthcheck publico. Para browsers (Accept: text/html) redirige al
// dashboard; para clientes API (curl, fetch, etc) devuelve JSON.
app.get('/', (req, res) => {
  const accept = String(req.headers['accept'] || '');
  if (accept.includes('text/html')) {
    return res.redirect(302, '/manager');
  }
  res.json({
    status: 200,
    message: 'Maven Baileys Gateway is running.',
    version: '0.1.0',
    instance: INSTANCE_NAME,
    connection: state.connection,
  });
});

// HTML render del QR -- publico para que se pueda ver en el browser sin
// tooling. (Esta ARRIBA del auth middleware a proposito.) El QR vive solo
// ~30s y rota; no es secret material.
app.get('/instance/qr.html', (_req, res) => {
  if (state.connection === 'open') {
    res.set('Content-Type', 'text/html').send(`
      <html><body style="font-family:sans-serif;padding:32px;background:#f4f4f4">
        <h2>Maven Bot</h2>
        <p>Status: <b style="color:#080">connected</b></p>
      </body></html>
    `);
    return;
  }
  const qrHtml = state.qrDataUrl
    ? `<img src="${state.qrDataUrl}" alt="QR" style="image-rendering:pixelated;width:320px;height:320px" />
       <p>Scan with the bot phone -- Linked devices -> Link a device</p>
       <p>Status: <b>${state.connection}</b></p>
       <script>setTimeout(()=>location.reload(), 5000)</script>`
    : `<p>QR not ready yet, status: <b>${state.connection}</b>. Refreshing in 3s...</p>
       <script>setTimeout(()=>location.reload(), 3000)</script>`;
  res.set('Content-Type', 'text/html').send(`
    <html><body style="font-family:sans-serif;padding:32px;background:#f4f4f4">
      <h2>Maven Bot -- Pairing</h2>
      ${qrHtml}
    </body></html>
  `);
});

// Public status endpoint para la UI (sin apikey, solo info no sensible).
app.get('/manager/status', (_req, res) => {
  res.json({
    instance: INSTANCE_NAME,
    connection: state.connection,
    qrDataUrl: state.qrDataUrl,
    lastError: state.lastError,
    version: '0.1.0',
  });
});

// Stats publicas para el dashboard (no leakea data sensible -- solo
// contadores agregados, uptime, profile name/number/pic).
app.get('/manager/stats', (_req, res) => {
  rolloverDayIfNeeded();
  const mem = process.memoryUsage();
  res.json({
    bootedAt: state.bootedAt,
    connectedAt: state.connectedAt,
    uptimeSec: Math.floor((Date.now() - state.bootedAt) / 1000),
    connectedSec: state.connectedAt ? Math.floor((Date.now() - state.connectedAt) / 1000) : null,
    msgsIn: state.msgsIn,
    msgsOut: state.msgsOut,
    msgsInToday: state.msgsInToday,
    msgsOutToday: state.msgsOutToday,
    profile: {
      name: state.profileName,
      number: state.profileNumber,
      pic: state.profilePicUrl,
    },
    memoryRssMb: Math.round(mem.rss / 1024 / 1024),
    memoryHeapMb: Math.round(mem.heapUsed / 1024 / 1024),
    todayDate: state.todayDate,
  });
});

// Recent events feed publico (sin contenido del mensaje cuando es
// privado para no leakearlo en el dashboard publico). Solo metadatos +
// preview limitado.
app.get('/manager/recent', (_req, res) => {
  res.json({ events: state.recentEvents });
});

// Lista PÚBLICA de líneas (instancias) para el dashboard — solo metadatos no
// sensibles (estado, perfil, contadores, uptime). SIN apikey: el dashboard se ve
// sin pedir nada; la apikey solo hace falta para acciones (crear/conectar/logout).
app.get('/manager/lines', (_req, res) => {
  const now = Date.now();
  const lines = [...sessions.values()].map((s) => ({
    instance: s.instanceName,
    connection: s.connection,
    profile: { name: s.profileName, number: s.profileNumber, pic: s.profilePicUrl },
    msgsInToday: s.msgsInToday,
    msgsOutToday: s.msgsOutToday,
    msgsIn: s.msgsIn,
    msgsOut: s.msgsOut,
    connectedAt: s.connectedAt,
    uptimeSec: s.connectedAt ? Math.floor((now - s.connectedAt) / 1000) : null,
    lastError: s.lastError,
    reconnectCount: s.reconnectCount,
    lastDisconnectAt: s.lastDisconnectAt,
    baileysVersion: s.baileysVersion,
  }));
  res.json({ lines });
});

// Actividad reciente de UNA línea (pública, mismo criterio que /manager/recent
// del default). Si la instancia no existe, lista vacía.
app.get('/manager/recent/:instance', (req, res) => {
  const s = sessions.get(req.params.instance);
  res.json({ events: s ? s.recentEvents : [] });
});

// Lista de grupos donde esta el bot. Cacheado 30s para no llamar a
// groupFetchAllParticipating en cada request.
let groupsCache = { at: 0, data: [] };
app.get('/manager/groups', async (_req, res) => {
  if (!state.sock || state.connection !== 'open') {
    return res.json({ groups: [], error: 'not_connected' });
  }
  const now = Date.now();
  if (now - groupsCache.at < 30_000 && groupsCache.data.length > 0) {
    return res.json({ groups: groupsCache.data, cached: true });
  }
  try {
    const raw = await state.sock.groupFetchAllParticipating();
    const groups = Object.values(raw || {}).map((g) => ({
      jid: g.id,
      name: g.subject || '(sin nombre)',
      memberCount: Array.isArray(g.participants) ? g.participants.length : 0,
      isAnnounce: !!g.announce,
      desc: g.desc ? String(g.desc).slice(0, 200) : null,
    }));
    groups.sort((a, b) => b.memberCount - a.memberCount);
    groupsCache = { at: now, data: groups };
    res.json({ groups, cached: false });
  } catch (e) {
    logger.warn({ err: e.message }, 'groupFetchAllParticipating failed');
    res.status(500).json({ error: e.message });
  }
});

// Grupos de UNA línea específica (para el drill-in del dashboard).
app.get('/manager/groups/:instance', async (req, res) => {
  const s = sessionFromReq(req);
  if (!s.sock || s.connection !== 'open') return res.json({ groups: [], error: 'not_connected' });
  try {
    const raw = await s.sock.groupFetchAllParticipating();
    const groups = Object.values(raw || {}).map((g) => ({
      jid: g.id,
      name: g.subject || '(sin nombre)',
      memberCount: Array.isArray(g.participants) ? g.participants.length : 0,
    }));
    groups.sort((a, b) => b.memberCount - a.memberCount);
    res.json({ groups });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Settings por línea (rechazar llamadas / leído / online / sync) + webhook propio.
app.get('/manager/settings/:instance', (req, res) => {
  const s = sessionFromReq(req);
  res.json({ config: s.config });
});
app.post('/manager/settings/:instance', (req, res) => {
  const s = sessionFromReq(req);
  const b = req.body || {};
  const next = { ...s.config };
  if (typeof b.webhookUrl === 'string') next.webhookUrl = b.webhookUrl.trim() || null;
  if (typeof b.rejectCalls === 'boolean') next.rejectCalls = b.rejectCalls;
  if (typeof b.markRead === 'boolean') next.markRead = b.markRead;
  if (typeof b.alwaysOnline === 'boolean') next.alwaysOnline = b.alwaysOnline;
  if (typeof b.syncFullHistory === 'boolean') next.syncFullHistory = b.syncFullHistory;
  s.config = next;
  saveConfig(s);
  // rejectCalls / markRead / webhook aplican en caliente; alwaysOnline y syncFullHistory, al reconectar.
  res.json({ ok: true, config: s.config, needsReconnect: ['alwaysOnline', 'syncFullHistory'] });
});

// Métricas de tráfico para los gráficos: últimas 24h (por hora) y 30d (por día).
app.get('/manager/metrics/:instance', (req, res) => {
  const s = sessionFromReq(req);
  const t = s.traffic || { hourly: {}, daily: {} };
  const now = Date.now();
  const hourly = [];
  for (let i = 23; i >= 0; i--) {
    const k = new Date(now - i * 3600 * 1000).toISOString().slice(0, 13);
    const b = t.hourly[k] || {};
    hourly.push({ label: k.slice(11) + 'h', in: b.in || 0, out: b.out || 0 });
  }
  const daily = [];
  for (let i = 29; i >= 0; i--) {
    const k = new Date(now - i * 86400 * 1000).toISOString().slice(0, 10);
    const b = t.daily[k] || {};
    daily.push({ label: k.slice(5), in: b.in || 0, out: b.out || 0 });
  }
  res.json({ hourly, daily });
});

// Monitor en vivo (SSE): stream de eventos (in/out/connection) de una línea en
// tiempo real. El dashboard se suscribe con EventSource (manda la cookie de sesión).
app.get('/manager/stream/:instance', (req, res) => {
  const s = sessionFromReq(req);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  if (res.flushHeaders) res.flushHeaders();
  res.write(': ok\n\n');
  s.sseClients = s.sseClients || [];
  s.sseClients.push(res);
  const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch (e) { /* */ } }, 25000);
  req.on('close', () => { clearInterval(hb); s.sseClients = (s.sseClients || []).filter((c) => c !== res); });
});

// Login del dashboard: valida la password contra MANAGER_PASSWORD (env) server-side
// y setea la cookie de sesión (HMAC). Devuelve la apikey para que el dashboard haga
// acciones sin pedirla aparte (la password ya autenticó al humano).
app.post('/manager/login', (req, res) => {
  if (!MANAGER_PASSWORD) return res.status(503).json({ ok: false, error: 'login no configurado: falta la env var MANAGER_PASSWORD' });
  const pw = (req.body && req.body.password) || '';
  if (!safeEq(pw, MANAGER_PASSWORD)) return res.status(401).json({ ok: false });
  const remember = !!(req.body && req.body.remember);
  const secure = req.headers['x-forwarded-proto'] === 'https' || !!req.secure;
  const opts = { httpOnly: true, sameSite: 'lax', secure, path: '/' };
  if (remember) opts.maxAge = 30 * 24 * 3600 * 1000; // persistente; sin esto = cookie de sesión (hasta cerrar el navegador)
  res.cookie('mgr_session', managerToken(), opts);
  res.json({ ok: true, apikey: API_KEY });
});

// Manager UI -- dashboard. Con MANAGER_PASSWORD configurada y sin sesión válida,
// sirve la pantalla de login; con sesión (o sin password configurada), el dashboard.
app.get('/manager', (req, res) => {
  if (!hasManagerSession(req)) {
    return res.set('Content-Type', 'text/html').send(LOGIN_HTML);
  }
  res.set('Content-Type', 'text/html').send(MANAGER_HTML);
});

// Auth middleware para todo lo demas.
app.use((req, res, next) => {
  const key = req.headers['apikey'] || '';
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

app.get('/instance/connectionState/:instance', (req, res) => {
  const s = sessionFromReq(req);
  res.json({ instance: req.params.instance, state: s.connection, lastError: s.lastError });
});

// QR endpoint -- devuelve el QR actual como data URL si esta esperando scan.
app.get('/instance/connect/:instance', (req, res) => {
  const s = sessionFromReq(req);
  if (s.connection === 'open') {
    return res.json({ instance: req.params.instance, status: 'connected' });
  }
  if (s.qrDataUrl) {
    return res.json({
      instance: req.params.instance,
      status: 'awaiting_qr_scan',
      qrcode: { base64: s.qrDataUrl, code: s.qrRaw },
    });
  }
  res.json({ instance: req.params.instance, status: s.connection, qrcode: null });
});

// Crear/arrancar una sesión nueva (número adicional). Bajo apikey. Idempotente:
// si ya está conectada/conectando no reinicia; si no, arranca el socket → su QR
// queda disponible en GET /instance/connect/:instance. La persistencia entre
// reboots la da el escaneo de AUTH_DIR en el boot (ver más abajo).
app.post('/instance/create/:instance', async (req, res) => {
  const name = req.params.instance;
  if (!name || !/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
    return res.status(400).json({ error: 'invalid_instance_name', hint: 'use [a-zA-Z0-9_-], 1-64 chars' });
  }
  const existing = sessions.get(name);
  if (existing && (existing.connection === 'open' || existing.connection === 'connecting')) {
    return res.json({ instance: name, status: existing.connection, message: 'already_running' });
  }
  startSocket(name).catch((e) => logger.error({ err: e.message, instance: name }, 'startSocket(create) failed'));
  return res.json({ instance: name, status: 'starting', connectUrl: `/instance/connect/${name}` });
});

// Lista todas las sesiones (números) que el gateway maneja — para que Maven
// pinte el panel de líneas. Solo metadatos no sensibles.
app.get('/instance/list', (_req, res) => {
  const instances = [...sessions.values()].map((s) => ({
    instance: s.instanceName,
    connection: s.connection,
    profile: { name: s.profileName, number: s.profileNumber, pic: s.profilePicUrl },
    msgsInToday: s.msgsInToday,
    msgsOutToday: s.msgsOutToday,
    connectedAt: s.connectedAt,
  }));
  res.json({ instances });
});

// ¿El número está registrado en WhatsApp? Solo aplica a teléfonos
// (@s.whatsapp.net); @lid y grupos (@g.us) no se pueden chequear. Cachea 1h
// por sesión para no repegarle a onWhatsApp en cada envío. Devuelve true/false,
// o null si no se pudo determinar (en ese caso NO bloqueamos el envío).
async function checkOnWhatsApp(s, jid) {
  if (!jid || !jid.endsWith('@s.whatsapp.net') || !s.sock) return null;
  const phone = jid.split('@')[0];
  if (!phone) return null;
  if (!s.onWaCache) s.onWaCache = new Map();
  const hit = s.onWaCache.get(phone);
  if (hit && (Date.now() - hit.ts) < 3600000) return hit.exists;
  try {
    const r = await s.sock.onWhatsApp(phone);
    if (!Array.isArray(r)) return null;
    const item = r.find((x) => x && String(x.jid || '').split('@')[0] === phone) || r[0];
    const exists = item ? item.exists === true : false;
    s.onWaCache.set(phone, { exists, ts: Date.now() });
    return exists;
  } catch (e) {
    logger.warn({ err: e.message }, 'onWhatsApp check failed');
    return null;
  }
}

// Send text -- compatible con payload Evolution v1 o v2.
// Soporta `mentions: ["123456@s.whatsapp.net", "456@lid"]` opcional —
// si se manda, Baileys lo incluye en el contextInfo del mensaje y
// WhatsApp renderiza esos números como menciones reales (ping al user).
app.post('/message/sendText/:instance', async (req, res) => {
  const s = sessionFromReq(req);
  if (s.connection !== 'open' || !s.sock) {
    return res.status(503).json({ error: 'not_connected', state: s.connection });
  }

  const body = req.body || {};
  const number = body.number;
  const text = body.text ?? body.textMessage?.text;
  // mentions opcionales: array de JIDs/LIDs completos
  // ("123@s.whatsapp.net" o "456@lid"). El texto debe contener
  // "@<phone_o_lid_sin_sufijo>" para que WhatsApp matchee y
  // renderice el ping.
  const mentions = Array.isArray(body.mentions) ? body.mentions : null;
  // Responder/citar: { id, fromMe, text } del mensaje original. Armamos un quoted
  // mínimo (key + conversation) — suficiente para que WhatsApp lo pinte como cita.
  const quoted = body.quoted && body.quoted.id ? body.quoted : null;

  if (!number || !text) {
    return res.status(400).json({ error: 'missing_number_or_text' });
  }

  const jid = resolveJid(number);
  if (!jid) return res.status(400).json({ error: 'invalid_jid' });

  // ¿El número está en WhatsApp? Si NO, no enviamos y avisamos (el edge lo
  // registra como fallido → queda en rojo en el chat).
  const onWa = await checkOnWhatsApp(s, jid);
  if (onWa === false) return res.status(422).json({ error: 'not_on_whatsapp', jid });

  try {
    const payload = { text: String(text) };
    if (mentions && mentions.length > 0) {
      payload.mentions = mentions;
    }
    const options = {};
    if (quoted) {
      // Baileys: el mensaje citado va en el 3er arg (options.quoted), con un
      // WAMessage mínimo (key + message.conversation).
      options.quoted = {
        key: { remoteJid: jid, fromMe: quoted.fromMe === true, id: String(quoted.id) },
        message: { conversation: String(quoted.text || '') },
      };
    }
    const result = await s.sock.sendMessage(jid, payload, options);
    rolloverDayIfNeeded(s);
    s.msgsOut += 1;
    s.msgsOutToday += 1;
    pushRecent({ kind: 'out', jid, body: String(text).slice(0, 120) }, s);
    return res.json({
      key: {
        id: result.key.id,
        remoteJid: result.key.remoteJid,
        fromMe: result.key.fromMe,
      },
      message: 'sent',
      mentions: mentions ?? undefined,
    });
  } catch (e) {
    logger.error({ err: e.message, jid }, 'sendMessage failed');
    return res.status(500).json({ error: 'send_failed', detail: e.message });
  }
});

// Mide la duración (segundos) de un OGG/Opus con ffprobe. WhatsApp necesita
// `seconds` en la nota de voz; sin eso el teléfono la marca "audio ya no está
// disponible" (WhatsApp Web la tolera, pero la app del celu no). Las
// grabaciones webm del navegador no traen duración → hay que medirla del OGG
// ya transcodeado (escrito a /tmp para que ffprobe pueda hacer seek). Devuelve
// null si no se pudo medir (ahí omitimos seconds, sin romper el envío).
function probeAudioSeconds(oggBuffer) {
  return new Promise((resolve) => {
    const tmp = `/tmp/wa-ptt-${crypto.randomUUID()}.ogg`;
    try { fs.writeFileSync(tmp, oggBuffer); } catch (_) { return resolve(null); }
    let ff;
    try {
      ff = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', tmp]);
    } catch (_) { try { fs.unlinkSync(tmp); } catch (_) { /* */ } return resolve(null); }
    const out = [];
    ff.stdout.on('data', (d) => out.push(d));
    ff.on('error', () => { try { fs.unlinkSync(tmp); } catch (_) { /* */ } resolve(null); });
    ff.on('close', () => {
      try { fs.unlinkSync(tmp); } catch (_) { /* */ }
      const s = parseFloat(Buffer.concat(out).toString().trim());
      resolve(Number.isFinite(s) && s > 0 ? Math.round(s) : null);
    });
  });
}

// Genera la forma de onda (64 barras, 0-100) que WhatsApp muestra en la nota de
// voz. Extrae PCM mono con ffmpeg y calcula el RMS por segmento. Algunas
// versiones de WhatsApp Android NO reproducen la nota si falta el waveform.
// Devuelve un Uint8Array(64) o null si no se pudo generar (ahí lo omitimos).
function generateWaveform(oggBuffer) {
  return new Promise((resolve) => {
    const tmp = `/tmp/wa-wf-${crypto.randomUUID()}.ogg`;
    try { fs.writeFileSync(tmp, oggBuffer); } catch (_) { return resolve(null); }
    let ff;
    try {
      ff = spawn('ffmpeg', ['-v', 'error', '-i', tmp, '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1']);
    } catch (_) { try { fs.unlinkSync(tmp); } catch (_) { /* */ } return resolve(null); }
    const chunks = [];
    ff.stdout.on('data', (d) => chunks.push(d));
    ff.on('error', () => { try { fs.unlinkSync(tmp); } catch (_) { /* */ } resolve(null); });
    ff.on('close', () => {
      try { fs.unlinkSync(tmp); } catch (_) { /* */ }
      const pcm = Buffer.concat(chunks);
      if (pcm.length < 128) return resolve(null);
      const bars = 64;
      const total = Math.floor(pcm.length / 2);
      const per = Math.max(1, Math.floor(total / bars));
      const raw = new Array(bars).fill(0);
      let max = 1;
      for (let i = 0; i < bars; i++) {
        let sum = 0, n = 0;
        for (let j = 0; j < per; j++) {
          const idx = (i * per + j) * 2;
          if (idx + 1 >= pcm.length) break;
          const v = pcm.readInt16LE(idx);
          sum += v * v; n++;
        }
        const rms = n ? Math.sqrt(sum / n) : 0;
        raw[i] = rms; if (rms > max) max = rms;
      }
      const wf = new Uint8Array(bars);
      for (let i = 0; i < bars; i++) wf[i] = Math.min(100, Math.round((raw[i] / max) * 100));
      resolve(wf);
    });
  });
}

// Transcodea audio (cualquier contenedor) a OGG/Opus para nota de voz de WhatsApp.
// El navegador graba webm/opus; WhatsApp solo reproduce ogg/opus como PTT. Usa el
// ffmpeg nativo del contenedor (apk). Rechaza si ffmpeg no está o falla → fallback.
function transcodeToOggOpus(inputBuffer) {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
      // Perfil de voz de WhatsApp: Opus mono 16kHz en modo `voip`. Android es
      // estricto y NO reproduce notas de voz fuera de este perfil (Web/iPhone sí).
      '-c:a', 'libopus', '-b:a', '32k', '-ar', '16000', '-ac', '1', '-application', 'voip', '-f', 'ogg', 'pipe:1'];
    let ff;
    try { ff = spawn('ffmpeg', args); } catch (e) { return reject(e); }
    const out = []; const err = [];
    ff.stdout.on('data', (d) => out.push(d));
    ff.stderr.on('data', (d) => err.push(d));
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code === 0 && out.length) resolve(Buffer.concat(out));
      else reject(new Error('ffmpeg exit ' + code + ': ' + Buffer.concat(err).toString().slice(0, 200)));
    });
    ff.stdin.on('error', () => {}); // ignora EPIPE si ffmpeg corta antes
    ff.stdin.end(inputBuffer);
  });
}

// Convierte un GIF a webp ANIMADO (formato de sticker animado de WhatsApp) con
// ffmpeg — escala a 512px máx y loop infinito. Rechaza si ffmpeg falla → fallback.
function gifToAnimatedWebp(inputBuffer) {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-loglevel', 'error', '-f', 'gif', '-i', 'pipe:0',
      '-vcodec', 'libwebp', '-lossless', '0', '-q:v', '70', '-loop', '0', '-an', '-vsync', '0',
      '-filter:v', 'scale=512:512:force_original_aspect_ratio=decrease', '-f', 'webp', 'pipe:1'];
    let ff;
    try { ff = spawn('ffmpeg', args); } catch (e) { return reject(e); }
    const out = []; const err = [];
    ff.stdout.on('data', (d) => out.push(d));
    ff.stderr.on('data', (d) => err.push(d));
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code === 0 && out.length) resolve(Buffer.concat(out));
      else reject(new Error('ffmpeg webp exit ' + code + ': ' + Buffer.concat(err).toString().slice(0, 200)));
    });
    ff.stdin.on('error', () => {});
    ff.stdin.end(inputBuffer);
  });
}

// Enviar media (imagen/audio/video/documento) por URL. El caller (edge function
// wa-inbox-send-media) sube el archivo a Storage y nos pasa una URL firmada;
// Baileys la descarga y la manda. Para notas de voz: mediatype=audio + ptt=true.
app.post('/message/sendMedia/:instance', async (req, res) => {
  const s = sessionFromReq(req);
  if (s.connection !== 'open' || !s.sock) {
    return res.status(503).json({ error: 'not_connected', state: s.connection });
  }

  const body = req.body || {};
  const number = body.number;
  const mediatype = String(body.mediatype || '').toLowerCase();
  const url = body.url;
  const caption = body.caption ? String(body.caption) : undefined;
  const fileName = body.filename ? String(body.filename) : undefined;
  const mimetype = body.mimetype ? String(body.mimetype) : undefined;
  const ptt = body.ptt === true; // nota de voz (push-to-talk)

  const validTypes = ['image', 'audio', 'video', 'document', 'gif', 'sticker'];
  if (!number || !url || !validTypes.includes(mediatype)) {
    return res.status(400).json({ error: 'missing_or_invalid', valid: validTypes });
  }
  const jid = resolveJid(number);
  if (!jid) return res.status(400).json({ error: 'invalid_jid' });

  // ¿El número está en WhatsApp? Si NO, no enviamos y avisamos (el edge lo
  // registra como fallido → queda en rojo en el chat).
  const onWa = await checkOnWhatsApp(s, jid);
  if (onWa === false) return res.status(422).json({ error: 'not_on_whatsapp', jid });

  try {
    let content;
    if (mediatype === 'image') content = { image: { url }, caption };
    else if (mediatype === 'video') content = { video: { url }, caption };
    else if (mediatype === 'audio') {
      if (ptt) {
        // Nota de voz: WhatsApp solo reproduce OGG/Opus. Bajamos la URL (webm/opus
        // del navegador) y la transcodeamos con ffmpeg; si algo falla, fallback a la URL.
        try {
          const resp = await fetch(url);
          if (!resp.ok) throw new Error('fetch ' + resp.status);
          const inBuf = Buffer.from(await resp.arrayBuffer());
          const ogg = await transcodeToOggOpus(inBuf);
          // Metadata para que la nota de voz se reproduzca en ANDROID (no solo
          // en Web/iPhone): duración (seconds) + forma de onda (waveform). Sin
          // esto Android la marca "no disponible".
          const seconds = await probeAudioSeconds(ogg);
          const waveform = await generateWaveform(ogg);
          content = { audio: ogg, ptt: true, mimetype: 'audio/ogg; codecs=opus' };
          if (seconds) content.seconds = seconds;
          if (waveform) content.waveform = waveform;
        } catch (e) {
          logger.error({ err: e.message }, 'ptt transcode failed, fallback a url directa');
          content = { audio: { url }, ptt: true, mimetype: 'audio/ogg; codecs=opus' };
        }
      } else {
        content = { audio: { url }, ptt: false, mimetype: mimetype || 'audio/mp4' };
      }
    }
    else if (mediatype === 'gif') content = { video: { url }, gifPlayback: true, caption };
    else if (mediatype === 'sticker') {
      // WhatsApp solo acepta WEBP como sticker. Si llega un GIF, lo convertimos a
      // webp ANIMADO con ffmpeg; si ya es webp/imagen, lo mandamos por URL.
      if (/\.gif(\?|$)/i.test(url) || (mimetype && mimetype.includes('gif'))) {
        try {
          const resp = await fetch(url);
          if (!resp.ok) throw new Error('fetch ' + resp.status);
          const webp = await gifToAnimatedWebp(Buffer.from(await resp.arrayBuffer()));
          content = { sticker: webp };
        } catch (e) { logger.error({ err: e.message }, 'gif->webp sticker failed'); content = { sticker: { url } }; }
      } else {
        content = { sticker: { url } };
      }
    }
    else content = { document: { url }, fileName: fileName || 'archivo', mimetype: mimetype || 'application/octet-stream', caption };

    const result = await s.sock.sendMessage(jid, content);
    rolloverDayIfNeeded(s);
    s.msgsOut += 1;
    s.msgsOutToday += 1;
    pushRecent({ kind: 'out', jid, body: '[' + mediatype + ']' + (caption ? ' ' + caption.slice(0, 80) : '') }, s);
    return res.json({
      key: { id: result.key.id, remoteJid: result.key.remoteJid, fromMe: result.key.fromMe },
      message: 'sent',
    });
  } catch (e) {
    logger.error({ err: e.message, jid, mediatype }, 'sendMedia failed');
    return res.status(500).json({ error: 'send_failed', detail: e.message });
  }
});

// Reaccionar a un mensaje (emoji) — Baileys sendMessage({ react: {text, key} }).
// emoji "" quita la reacción. key identifica el mensaje target.
app.post('/message/react/:instance', async (req, res) => {
  const s = sessionFromReq(req);
  if (s.connection !== 'open' || !s.sock) {
    return res.status(503).json({ error: 'not_connected', state: s.connection });
  }
  const body = req.body || {};
  const number = body.number;
  const messageId = body.messageId;
  const fromMe = body.fromMe === true;
  const emoji = typeof body.emoji === 'string' ? body.emoji : '';
  if (!number || !messageId) return res.status(400).json({ error: 'missing_number_or_messageId' });
  const jid = resolveJid(number);
  if (!jid) return res.status(400).json({ error: 'invalid_jid' });

  // ¿El número está en WhatsApp? Si NO, no enviamos y avisamos (el edge lo
  // registra como fallido → queda en rojo en el chat).
  const onWa = await checkOnWhatsApp(s, jid);
  if (onWa === false) return res.status(422).json({ error: 'not_on_whatsapp', jid });
  try {
    const result = await s.sock.sendMessage(jid, {
      react: { text: emoji, key: { remoteJid: jid, fromMe, id: messageId } },
    });
    return res.json({ key: { id: result?.key?.id }, message: 'reacted' });
  } catch (e) {
    logger.error({ err: e.message, jid }, 'react failed');
    return res.status(500).json({ error: 'react_failed', detail: e.message });
  }
});

// Eliminar un mensaje PARA TODOS — Baileys sendMessage({ delete: key }). Solo
// sobre mensajes propios (fromMe) y dentro de la ventana que permite WhatsApp.
app.post('/message/delete/:instance', async (req, res) => {
  const s = sessionFromReq(req);
  if (s.connection !== 'open' || !s.sock) {
    return res.status(503).json({ error: 'not_connected', state: s.connection });
  }
  const body = req.body || {};
  const number = body.number;
  const messageId = body.messageId;
  const fromMe = body.fromMe !== false; // default true (borrar propios)
  if (!number || !messageId) return res.status(400).json({ error: 'missing_number_or_messageId' });
  const jid = resolveJid(number);
  if (!jid) return res.status(400).json({ error: 'invalid_jid' });

  // ¿El número está en WhatsApp? Si NO, no enviamos y avisamos (el edge lo
  // registra como fallido → queda en rojo en el chat).
  const onWa = await checkOnWhatsApp(s, jid);
  if (onWa === false) return res.status(422).json({ error: 'not_on_whatsapp', jid });
  try {
    await s.sock.sendMessage(jid, { delete: { remoteJid: jid, fromMe, id: messageId } });
    return res.json({ message: 'deleted' });
  } catch (e) {
    logger.error({ err: e.message, jid }, 'delete failed');
    return res.status(500).json({ error: 'delete_failed', detail: e.message });
  }
});

// Descargar y desencriptar media (audio/image/video/document/sticker).
//
// Recibe el sub-mensaje de Baileys (ej. audioMessage con mediaKey, url,
// directPath, mimetype, fileLength, etc) y devuelve el binary
// desencriptado. WhatsApp expone los media files encriptados en
// mmg.whatsapp.net/...enc — un GET plano devuelve el cipher, no el
// archivo. Baileys tiene downloadContentFromMessage que aplica la
// mediaKey + HKDF para desencriptar.
//
// Body: { type: "audio"|"image"|"video"|"document"|"sticker", message: <sub-mensaje> }
// Response: binary (Content-Type según el mimetype del media)
app.post('/media/download', async (req, res) => {
  const body = req.body || {};
  const type = String(body.type || '').toLowerCase();
  const message = body.message;

  const validTypes = ['audio', 'image', 'video', 'document', 'sticker'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: 'invalid_type', valid: validTypes });
  }
  if (!message || typeof message !== 'object') {
    return res.status(400).json({ error: 'missing_message_object' });
  }
  if (!message.mediaKey || !(message.url || message.directPath)) {
    return res.status(400).json({ error: 'missing_mediaKey_or_url' });
  }

  try {
    const stream = await downloadContentFromMessage(message, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    const mime = message.mimetype || (type === 'audio' ? 'audio/ogg' : 'application/octet-stream');
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(buffer.length));
    return res.end(buffer);
  } catch (e) {
    logger.error({ err: e.message, type }, 'media download failed');
    return res.status(500).json({ error: 'download_failed', detail: e.message });
  }
});

// Logout endpoint -- destruye la session local (para rotar QR sin tocar volume).
app.delete('/instance/logout/:instance', async (req, res) => {
  const s = sessionFromReq(req);
  try {
    if (s.sock) await s.sock.logout();
    res.json({ status: 'logged_out' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Reconectar/reiniciar una línea SIN borrar credenciales (re-corre startSocket).
// Útil cuando una línea quedó 'close' y no reconectó sola.
app.post('/instance/reconnect/:instance', async (req, res) => {
  const name = (req.params && req.params.instance) || INSTANCE_NAME;
  try {
    startSocket(name).catch((e) => logger.error({ err: e.message, instance: name }, 'manual reconnect failed'));
    return res.json({ message: 'reconnecting', instance: name });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── Perfil de la LÍNEA (editar desde el dashboard /manager): foto, nombre y
//    estado/about del número conectado. ──────────────────────────────────────
app.post('/profile/picture/:instance', async (req, res) => {
  const s = sessionFromReq(req);
  if (s.connection !== 'open' || !s.sock) return res.status(503).json({ error: 'not_connected', state: s.connection });
  const jid = s.sock.user && s.sock.user.id ? s.sock.user.id : null;
  if (!jid) return res.status(503).json({ error: 'no_user' });
  const body = req.body || {};
  try {
    let content;
    if (body.imageUrl) content = { url: String(body.imageUrl) };
    else if (body.imageBase64) content = Buffer.from(String(body.imageBase64).replace(/^data:image\/\w+;base64,/, ''), 'base64');
    else return res.status(400).json({ error: 'missing_imageUrl_or_imageBase64' });
    await s.sock.updateProfilePicture(jid, content);
    return res.json({ message: 'updated' });
  } catch (e) { logger.error({ err: e.message }, 'updateProfilePicture failed'); return res.status(500).json({ error: 'failed', detail: e.message }); }
});
app.post('/profile/name/:instance', async (req, res) => {
  const s = sessionFromReq(req);
  if (s.connection !== 'open' || !s.sock) return res.status(503).json({ error: 'not_connected', state: s.connection });
  const name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ error: 'missing_name' });
  try { await s.sock.updateProfileName(name); return res.json({ message: 'updated' }); }
  catch (e) { logger.error({ err: e.message }, 'updateProfileName failed'); return res.status(500).json({ error: 'failed', detail: e.message }); }
});
app.post('/profile/status/:instance', async (req, res) => {
  const s = sessionFromReq(req);
  if (s.connection !== 'open' || !s.sock) return res.status(503).json({ error: 'not_connected', state: s.connection });
  const status = String((req.body || {}).status || '');
  try { await s.sock.updateProfileStatus(status); return res.json({ message: 'updated' }); }
  catch (e) { logger.error({ err: e.message }, 'updateProfileStatus failed'); return res.status(500).json({ error: 'failed', detail: e.message }); }
});
// Foto de perfil de un CONTACTO (la usa el panel de contacto de Maven).
app.get('/profile/picture/:instance', async (req, res) => {
  const s = sessionFromReq(req);
  if (s.connection !== 'open' || !s.sock) return res.status(503).json({ error: 'not_connected', state: s.connection });
  const jid = resolveJid(String(req.query.jid || ''));
  if (!jid) return res.status(400).json({ error: 'invalid_jid' });
  try { const url = await s.sock.profilePictureUrl(jid, 'image').catch(() => null); return res.json({ url: url || null }); }
  catch (e) { return res.json({ url: null }); }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  logger.info({ port: PORT, instance: INSTANCE_NAME }, 'HTTP listening');
  // Sesión default (número histórico; sus credenciales viven en la raíz de AUTH_DIR).
  startSocket().catch((e) => {
    logger.error({ err: e.message }, 'startSocket failed at boot');
    state.connection = 'close';
    state.lastError = e.message;
    // Reintenta en 5s.
    setTimeout(() => startSocket().catch((err) => logger.error({ err: err.message }, 'retry failed')), 5000);
  });
  // Persistencia multi-número: re-arranca cada instancia adicional con credenciales
  // guardadas (subdirectorio propio dentro de AUTH_DIR). El default vive en la raíz,
  // así que no se re-arranca acá. Bridge hasta que la fuente de verdad sea la DB (Fase 3).
  try {
    if (fs.existsSync(AUTH_DIR)) {
      for (const entry of fs.readdirSync(AUTH_DIR, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name !== INSTANCE_NAME) {
          logger.info({ instance: entry.name }, 'Restoring saved instance');
          startSocket(entry.name).catch((e) => logger.error({ err: e.message, instance: entry.name }, 'restore failed'));
        }
      }
    }
  } catch (e) {
    logger.warn({ err: e.message }, 'instance restore scan failed');
  }
  // Snapshot periódico de las métricas de tráfico al volumen (sobrevive reinicios).
  setInterval(() => { for (const s of sessions.values()) saveMetrics(s); }, 60_000);
});

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    logger.info({ sig }, 'Shutting down');
    try {
      if (state.sock) await state.sock.end();
    } catch (_e) { /* ignore */ }
    process.exit(0);
  });
}

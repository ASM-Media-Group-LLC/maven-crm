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
const fs = require('fs');

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
const MANAGER_HTML = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Maven Asistente -- Gateway Manager</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .pulse-dot { animation: pulse 2s cubic-bezier(.4,0,.6,1) infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
  </style>
</head>
<body class="bg-slate-50 min-h-screen">
  <div class="max-w-6xl mx-auto p-6">

    <!-- Hero / Profile header -->
    <header class="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-lg p-6 mb-6 text-white">
      <div class="flex items-center gap-4">
        <div id="profile-pic-wrap" class="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
          <span id="profile-initials" class="text-2xl font-bold text-slate-400">MA</span>
          <img id="profile-pic" class="w-full h-full object-cover hidden" alt="pic" />
        </div>
        <div class="flex-1">
          <h1 id="profile-name" class="text-xl font-bold">Maven Asistente</h1>
          <p id="profile-number" class="text-sm text-slate-400 font-mono">cargando…</p>
        </div>
        <div class="text-right">
          <div class="flex items-center gap-2 justify-end">
            <span id="conn-dot" class="w-3 h-3 rounded-full bg-slate-500"></span>
            <span id="conn-text" class="text-sm font-semibold">cargando…</span>
          </div>
          <p id="conn-uptime" class="text-xs text-slate-400 mt-1 font-mono">--</p>
        </div>
      </div>
    </header>

    <!-- Stats grid -->
    <section class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <p class="text-xs text-slate-500 uppercase tracking-wide font-semibold">📥 In hoy</p>
        <p id="stat-in-today" class="text-2xl font-bold text-slate-900 mt-1">0</p>
        <p class="text-xs text-slate-400" id="stat-in-total">total: 0</p>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <p class="text-xs text-slate-500 uppercase tracking-wide font-semibold">📤 Out hoy</p>
        <p id="stat-out-today" class="text-2xl font-bold text-slate-900 mt-1">0</p>
        <p class="text-xs text-slate-400" id="stat-out-total">total: 0</p>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <p class="text-xs text-slate-500 uppercase tracking-wide font-semibold">👥 Grupos</p>
        <p id="stat-groups" class="text-2xl font-bold text-slate-900 mt-1">--</p>
        <p class="text-xs text-slate-400">activos</p>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <p class="text-xs text-slate-500 uppercase tracking-wide font-semibold">⏱️ Uptime</p>
        <p id="stat-uptime" class="text-2xl font-bold text-slate-900 mt-1">--</p>
        <p class="text-xs text-slate-400">desde boot</p>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <p class="text-xs text-slate-500 uppercase tracking-wide font-semibold">🧠 Memoria</p>
        <p id="stat-mem" class="text-2xl font-bold text-slate-900 mt-1">--</p>
        <p class="text-xs text-slate-400" id="stat-mem-heap">heap: --</p>
      </div>
    </section>

    <!-- QR / Connected panel -->
    <section id="qr-panel" class="bg-amber-50 rounded-xl border-2 border-amber-200 p-6 mb-6 hidden">
      <div class="flex items-start gap-6">
        <img id="qr-img" alt="QR" class="rounded-lg border-2 border-amber-300 bg-white" style="image-rendering:pixelated;width:240px;height:240px" />
        <div class="flex-1">
          <h2 class="font-bold text-lg text-amber-900 mb-2">📱 Escaneá el QR</h2>
          <p class="text-sm text-amber-800 mb-3">
            En el teléfono del bot:
          </p>
          <ol class="text-sm text-amber-800 list-decimal list-inside space-y-1">
            <li>WhatsApp → Configuración (los 3 puntos)</li>
            <li>Dispositivos vinculados</li>
            <li>Vincular un dispositivo</li>
            <li>Apuntá la cámara al QR de la izquierda</li>
          </ol>
          <p class="text-xs text-amber-700 mt-4">El QR rota cada ~30s · auto-refresh activo</p>
        </div>
      </div>
    </section>

    <!-- Two-column layout: groups + recent activity -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

      <!-- Groups list -->
      <section class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <header class="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h2 class="font-semibold text-slate-900">Grupos del bot</h2>
          <span id="groups-count" class="text-xs text-slate-500 font-mono">--</span>
        </header>
        <div id="groups-list" class="max-h-96 overflow-y-auto">
          <p class="text-sm text-slate-400 px-5 py-6 text-center">cargando…</p>
        </div>
      </section>

      <!-- Recent activity -->
      <section class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <header class="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h2 class="font-semibold text-slate-900">Actividad reciente</h2>
          <span class="text-xs text-slate-400">live · últimos 30</span>
        </header>
        <div id="recent-list" class="max-h-96 overflow-y-auto">
          <p class="text-sm text-slate-400 px-5 py-6 text-center">esperando mensajes…</p>
        </div>
      </section>

    </div>

    <!-- Collapsible actions -->
    <section class="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 overflow-hidden">
      <button onclick="toggleActions()" class="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition">
        <h2 class="font-semibold text-slate-900">⚙️ Acciones (enviar prueba, logout)</h2>
        <span id="actions-toggle" class="text-slate-400">▸</span>
      </button>
      <div id="actions-body" class="hidden border-t border-slate-100 p-5 space-y-4">

        <div>
          <label class="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">API Key</label>
          <p class="text-xs text-slate-500 mb-2">De Dokploy → evolution-api → Environment → <code class="bg-slate-100 px-1 rounded">EVOLUTION_API_KEY</code>. Se guarda en sessionStorage.</p>
          <div class="flex gap-2">
            <input id="apikey" type="password" placeholder="..."
              class="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" />
            <button onclick="saveKey()" class="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-800">
              Guardar
            </button>
          </div>
          <p id="key-status" class="text-xs text-slate-500 mt-2"></p>
        </div>

        <div class="border-t border-slate-100 pt-4">
          <label class="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Enviar mensaje de prueba</label>
          <div class="space-y-2">
            <input id="send-number" type="text" placeholder="120363xxx@g.us  ·  o  ·  57322xxx (DM)"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" />
            <textarea id="send-text" rows="2" placeholder="Texto del mensaje"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"></textarea>
            <div class="flex justify-between items-center">
              <p id="send-status" class="text-xs"></p>
              <button onclick="sendMessage()" class="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
                Enviar
              </button>
            </div>
          </div>
        </div>

        <div class="border-t border-slate-100 pt-4">
          <label class="block text-xs font-semibold text-rose-700 uppercase tracking-wide mb-1">Logout / rotar sesión</label>
          <div class="flex items-center justify-between">
            <p class="text-xs text-slate-500">Cierra Baileys, pierde la vinculación, vuelve a estado QR.</p>
            <button onclick="logoutBot()" class="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm hover:bg-rose-700">
              Logout
            </button>
          </div>
        </div>

      </div>
    </section>

    <footer class="text-center text-xs text-slate-400 mt-8">
      Maven Baileys Gateway · código nuestro · sin licensing comercial · auto-refresh 3s
    </footer>
  </div>

<script>
const ENDPOINT = location.origin;
let currentInstance = 'maven-bot';

function getKey() { return sessionStorage.getItem('apikey') || ''; }

function saveKey() {
  const k = document.getElementById('apikey').value.trim();
  if (!k) { alert('Pone una API key'); return; }
  sessionStorage.setItem('apikey', k);
  document.getElementById('key-status').textContent = '✓ Guardada en sessionStorage';
  document.getElementById('key-status').className = 'text-xs text-emerald-600 mt-2';
}

function toggleActions() {
  const body = document.getElementById('actions-body');
  const toggle = document.getElementById('actions-toggle');
  body.classList.toggle('hidden');
  toggle.textContent = body.classList.contains('hidden') ? '▸' : '▾';
}

function fmtUptime(sec) {
  if (sec == null) return '--';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return d + 'd ' + h + 'h';
  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + 'm ' + s + 's';
  return s + 's';
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function shortJid(jid) {
  if (!jid) return '';
  if (jid.endsWith('@g.us')) return 'grupo ' + jid.split('@')[0].slice(-6);
  if (jid.endsWith('@lid')) return '@lid ' + jid.split('@')[0].slice(-6);
  if (jid.endsWith('@s.whatsapp.net')) return jid.split('@')[0];
  return jid;
}

async function refreshStatus() {
  try {
    const r = await fetch(ENDPOINT + '/manager/status');
    const d = await r.json();
    currentInstance = d.instance || 'maven-bot';

    const dot = document.getElementById('conn-dot');
    const text = document.getElementById('conn-text');
    const qrPanel = document.getElementById('qr-panel');

    if (d.connection === 'open') {
      dot.className = 'w-3 h-3 rounded-full bg-emerald-400';
      text.textContent = 'Conectado';
      qrPanel.classList.add('hidden');
    } else if (d.connection === 'connecting' || d.qrDataUrl) {
      dot.className = 'w-3 h-3 rounded-full bg-amber-400 pulse-dot';
      text.textContent = d.connection || 'connecting';
      if (d.qrDataUrl) {
        qrPanel.classList.remove('hidden');
        document.getElementById('qr-img').src = d.qrDataUrl;
      } else {
        qrPanel.classList.add('hidden');
      }
    } else {
      dot.className = 'w-3 h-3 rounded-full bg-rose-500';
      text.textContent = d.connection || 'desconectado';
      qrPanel.classList.add('hidden');
    }
  } catch (e) {
    document.getElementById('conn-text').textContent = 'sin conexion';
  }
}

async function refreshStats() {
  try {
    const r = await fetch(ENDPOINT + '/manager/stats');
    const s = await r.json();
    document.getElementById('stat-in-today').textContent = s.msgsInToday ?? 0;
    document.getElementById('stat-in-total').textContent = 'total: ' + (s.msgsIn ?? 0);
    document.getElementById('stat-out-today').textContent = s.msgsOutToday ?? 0;
    document.getElementById('stat-out-total').textContent = 'total: ' + (s.msgsOut ?? 0);
    document.getElementById('stat-uptime').textContent = fmtUptime(s.uptimeSec);
    document.getElementById('stat-mem').textContent = (s.memoryRssMb ?? '?') + ' MB';
    document.getElementById('stat-mem-heap').textContent = 'heap: ' + (s.memoryHeapMb ?? '?') + ' MB';
    if (s.connectedSec != null) {
      document.getElementById('conn-uptime').textContent = 'conectado · ' + fmtUptime(s.connectedSec);
    } else {
      document.getElementById('conn-uptime').textContent = '--';
    }
    // Profile
    const p = s.profile || {};
    if (p.name) document.getElementById('profile-name').textContent = p.name;
    if (p.number) document.getElementById('profile-number').textContent = '+' + p.number;
    if (p.pic) {
      const img = document.getElementById('profile-pic');
      img.src = p.pic;
      img.classList.remove('hidden');
      document.getElementById('profile-initials').classList.add('hidden');
    }
  } catch (e) { /* keep last values */ }
}

async function refreshGroups() {
  try {
    const r = await fetch(ENDPOINT + '/manager/groups');
    const d = await r.json();
    const list = document.getElementById('groups-list');
    const count = document.getElementById('groups-count');
    const groups = d.groups || [];
    document.getElementById('stat-groups').textContent = groups.length;
    count.textContent = groups.length + ' grupos';
    if (groups.length === 0) {
      list.innerHTML = '<p class="text-sm text-slate-400 px-5 py-6 text-center">' + (d.error === 'not_connected' ? 'bot desconectado' : 'sin grupos') + '</p>';
      return;
    }
    list.innerHTML = groups.map(g =>
      '<div class="px-5 py-3 border-b border-slate-50 hover:bg-slate-50">' +
      '  <div class="flex items-center justify-between gap-3">' +
      '    <div class="min-w-0 flex-1">' +
      '      <p class="font-medium text-slate-900 truncate">' + escapeHtml(g.name) + '</p>' +
      '      <p class="text-xs text-slate-400 font-mono truncate">' + escapeHtml(g.jid) + '</p>' +
      '    </div>' +
      '    <div class="text-right flex-shrink-0">' +
      '      <p class="text-sm font-semibold text-slate-700">' + g.memberCount + '</p>' +
      '      <p class="text-xs text-slate-400">miembros</p>' +
      '    </div>' +
      '  </div>' +
      '</div>'
    ).join('');
  } catch (e) {
    document.getElementById('groups-list').innerHTML = '<p class="text-sm text-rose-500 px-5 py-6 text-center">error: ' + escapeHtml(e.message) + '</p>';
  }
}

async function refreshRecent() {
  try {
    const r = await fetch(ENDPOINT + '/manager/recent');
    const d = await r.json();
    const list = document.getElementById('recent-list');
    const events = d.events || [];
    if (events.length === 0) {
      list.innerHTML = '<p class="text-sm text-slate-400 px-5 py-6 text-center">esperando mensajes…</p>';
      return;
    }
    list.innerHTML = events.map(e => {
      const icon = e.kind === 'in' ? '📥' : e.kind === 'out' ? '📤' : '🔌';
      const bg = e.kind === 'in' ? 'bg-blue-50' : e.kind === 'out' ? 'bg-emerald-50' : 'bg-slate-50';
      const title = e.kind === 'in' ? (e.from || '?') : e.kind === 'out' ? 'bot →' : 'connection';
      const subtitle = e.kind === 'connection' ? ('state: ' + (e.state || '?')) : shortJid(e.jid || '');
      return '<div class="px-5 py-3 border-b border-slate-50 ' + bg + '">' +
        '  <div class="flex items-start gap-2 text-sm">' +
        '    <span class="flex-shrink-0">' + icon + '</span>' +
        '    <div class="flex-1 min-w-0">' +
        '      <div class="flex items-baseline justify-between gap-2">' +
        '        <span class="font-medium text-slate-800 truncate">' + escapeHtml(title) + '</span>' +
        '        <span class="text-xs text-slate-400 font-mono flex-shrink-0">' + fmtTime(e.at) + '</span>' +
        '      </div>' +
        '      <p class="text-xs text-slate-500 truncate">' + escapeHtml(subtitle) + '</p>' +
        '      ' + (e.body ? '<p class="text-sm text-slate-700 truncate mt-1">' + escapeHtml(e.body) + '</p>' : '') +
        '    </div>' +
        '  </div>' +
        '</div>';
    }).join('');
  } catch (e) { /* keep last */ }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

async function sendMessage() {
  const key = getKey();
  if (!key) { alert('Guardá una API key primero.'); return; }
  const number = document.getElementById('send-number').value.trim();
  const text = document.getElementById('send-text').value.trim();
  if (!number || !text) { alert('Completa numero y texto.'); return; }
  const st = document.getElementById('send-status');
  st.textContent = 'enviando…';
  st.className = 'text-xs text-slate-500';
  try {
    const r = await fetch(ENDPOINT + '/message/sendText/' + currentInstance, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': key },
      body: JSON.stringify({ number, text }),
    });
    const d = await r.json();
    if (r.ok) {
      st.textContent = '✓ enviado (id: ' + (d.key && d.key.id || '?') + ')';
      st.className = 'text-xs text-emerald-600';
      document.getElementById('send-text').value = '';
    } else {
      st.textContent = '✗ ' + (d.error || r.statusText);
      st.className = 'text-xs text-rose-600';
    }
  } catch (e) {
    st.textContent = '✗ error: ' + e.message;
    st.className = 'text-xs text-rose-600';
  }
}

async function logoutBot() {
  const key = getKey();
  if (!key) { alert('Guardá una API key primero.'); return; }
  if (!confirm('Estas seguro? El bot perdera la vinculacion y habra que rescanear QR.')) return;
  const r = await fetch(ENDPOINT + '/instance/logout/' + currentInstance, {
    method: 'DELETE',
    headers: { 'apikey': key },
  });
  if (r.ok) { alert('Logout OK. El bot va a generar un QR nuevo.'); refreshAll(); }
  else { alert('Error: ' + r.statusText); }
}

async function refreshAll() {
  await Promise.all([refreshStatus(), refreshStats(), refreshGroups(), refreshRecent()]);
}

document.getElementById('key-status').textContent = getKey() ? '✓ Hay key guardada' : 'sin key';
refreshAll();
setInterval(refreshAll, 3000);
</script>
</body>
</html>`;

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
  };
}

function getSession(instanceName) {
  let s = sessions.get(instanceName);
  if (!s) { s = createSession(instanceName); sessions.set(instanceName, s); }
  return s;
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
  s.recentEvents.unshift({ ...event, at: new Date().toISOString() });
  if (s.recentEvents.length > RECENT_MAX) s.recentEvents.length = RECENT_MAX;
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
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });

  s.sock.ev.on('creds.update', saveCreds);

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
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      s.lastError = lastDisconnect?.error?.message || 'unknown';
      logger.warn({ instance: instanceName, statusCode, err: s.lastError }, 'Connection closed');

      const loggedOut = statusCode === DisconnectReason.loggedOut;
      if (loggedOut) {
        logger.error({ instance: instanceName }, 'Logged out by WhatsApp -- clear AUTH_DIR and re-scan QR');
        // No auto-reconnect on logout: necesita rescanear.
      } else {
        // Reconnect con backoff.
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
      }
      if (WEBHOOK_URL) {
        try {
          await forwardMessage(m, s);
        } catch (e) {
          logger.error({ err: e.message }, 'forwardMessage failed');
        }
      }
    }
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

async function forwardMessage(m, s = state) {
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

  const resp = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    logger.warn({ status: resp.status, body: txt.slice(0, 200) }, 'webhook returned non-2xx');
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

// Manager UI -- dashboard HTML inspired on Evolution Manager pero light.
// Sirve sin auth (publica). Las acciones que mutan estado piden apikey
// guardada en sessionStorage del browser.
app.get('/manager', (_req, res) => {
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

  if (!number || !text) {
    return res.status(400).json({ error: 'missing_number_or_text' });
  }

  const jid = resolveJid(number);
  if (!jid) return res.status(400).json({ error: 'invalid_jid' });

  try {
    const payload = { text: String(text) };
    if (mentions && mentions.length > 0) {
      payload.mentions = mentions;
    }
    const result = await s.sock.sendMessage(jid, payload);
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

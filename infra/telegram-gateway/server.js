// telegram-gateway — lee canales de Telegram vía MTProto (GramJS) para Promolog.
//
// QUÉ HACE: con una cuenta de Telegram logueada (session string), resuelve un canal
// por @handle y devuelve sus posts recientes (texto + links + si hay media bajable +
// permalink). Es el equivalente al "scraper de IG", pero usando la API OFICIAL de
// Telegram (más confiable, sin Apify). Leer canales públicos como usuario es benigno
// — NO es granja de cuentas ni evasión.
//
// AUTH del micro hacia Maven: header `x-spike-token` (env SPIKE_TOKEN), igual que el
// cloudphone-gateway. Slice posterior: JWT de Supabase.
//
// SECRETOS (env, se setean en Dokploy — NUNCA en el repo ni en chat):
//   TELEGRAM_API_ID, TELEGRAM_API_HASH  → de https://my.telegram.org (app del owner)
//   TELEGRAM_SESSION                     → string que genera `node login.js` (una vez)
//   SPIKE_TOKEN                          → secreto compartido con las edge functions
//
// ENDPOINTS:
//   GET /diag                              → (guard) conecta + getMe → ¿la sesión sirve?
//   GET /channel/:handle/recent?hours=24   → (guard) posts recientes del canal
//
// NOTA DRM / canales protegidos (noforwards): el TEXTO y los links SIEMPRE llegan
// (alcanza, porque "promo = referencia a su OnlyFans" = link/CTA). La MEDIA puede NO
// poder bajarse (Telegram bloquea downloadMedia en protegidos) → por eso devolvemos
// `mediaDownloadable` por post, para decidir afuera (texto-only o "revisar manual").

const express = require("express");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

const PORT = process.env.PORT || 8091;
const SPIKE_TOKEN = process.env.SPIKE_TOKEN || "";
const API_ID = Number(process.env.TELEGRAM_API_ID || 0);
const API_HASH = process.env.TELEGRAM_API_HASH || "";
const SESSION = process.env.TELEGRAM_SESSION || "";

const app = express();
app.use(express.json({ limit: "1mb" }));

function guard(req, res, next) {
  if (!SPIKE_TOKEN || req.get("x-spike-token") !== SPIKE_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

// Cliente GramJS singleton (una conexión persistente reusada entre requests).
let client = null;
let connecting = null;
async function getClient() {
  if (client && client.connected) return client;
  if (!API_ID || !API_HASH || !SESSION) {
    throw new Error("faltan TELEGRAM_API_ID / TELEGRAM_API_HASH / TELEGRAM_SESSION");
  }
  if (!connecting) {
    connecting = (async () => {
      const c = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, { connectionRetries: 5 });
      await c.connect();
      client = c;
      return c;
    })().catch((e) => { connecting = null; throw e; });
  }
  return connecting;
}

const URL_RE = /https?:\/\/[^\s)]+/gi;

function buildPermalink(handle, id) {
  const h = String(handle)
    .replace(/^@/, "")
    .replace(/^https?:\/\/t\.me\//i, "")
    .replace(/\/.*$/, "");
  return `https://t.me/${h}/${id}`;
}

app.get("/diag", guard, async (req, res) => {
  try {
    const c = await getClient();
    const me = await c.getMe();
    res.json({ ok: true, account: me?.username || me?.firstName || String(me?.id) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

// Posts recientes (últimas `hours`) de un canal público por @handle.
// SPIKE: `mediaDownloadable` baja la miniatura para confirmar si se puede (en
// canales protegidos suele fallar). En producción esto se hará selectivo.
app.get("/channel/:handle/recent", guard, async (req, res) => {
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
        } catch (_) {
          mediaDownloadable = false;
        }
      }
      posts.push({
        id: m.id,
        date: m.date,
        text,
        links: text.match(URL_RE) || [],
        hasMedia,
        mediaDownloadable,
        permalink: buildPermalink(handle, m.id),
      });
    }
    res.json({ ok: true, channel: handle, protected: isProtected, count: posts.length, posts });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

app.get("/", (req, res) => res.json({ service: "telegram-gateway", ok: true }));

app.listen(PORT, () => console.log(`[telegram-gateway] escuchando en :${PORT}`));

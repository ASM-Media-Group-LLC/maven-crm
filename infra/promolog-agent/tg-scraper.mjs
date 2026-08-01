// tg-scraper.mjs — Plan B LOCAL de Telegram. Dos vías:
//   • PÚBLICOS (t.me/<user> o @user): se leen por `t.me/s/<user>` — vista pública,
//     SIN login ni cuenta, con fetch pelado. Robusto.
//   • PRIVADOS (t.me/+invite): necesitan que la cuenta dedicada sea MIEMBRO. Se leen
//     con Playwright + web.telegram.org logueado. ⚠️ Es la parte a tunear en el
//     primer run (leer el DOM de Telegram Web + matchear el canal por título).
//
// Los posts scrapeados se mandan a telegram-scan?mode=ingest → reusa la MISMA
// clasificación y persist que el gateway. Targets en vivo desde telegram-scan?mode=targets.

import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { MAVEN_URL, CRON_TOKEN, TG_SESSION, HEADFUL } from "./config.mjs";
import { sleep } from "./agent-core.mjs";
import { creatorSlot } from "./accounts.mjs";

const norm = (s) => String(s ?? "").trim();
const isInvite = (h) => /t\.me\/\+|t\.me\/joinchat/i.test(h);
const publicUser = (h) => {
  const m = String(h).match(/t\.me\/(?:s\/)?([A-Za-z0-9_]+)/);
  if (m) return m[1];
  const at = String(h).replace(/^@/, "");
  return /^[A-Za-z0-9_]+$/.test(at) ? at : null;
};

async function fetchTargets() {
  const r = await fetch(`${MAVEN_URL}/functions/v1/telegram-scan`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-cron-token": CRON_TOKEN },
    body: JSON.stringify({ mode: "targets" }),
  });
  if (!r.ok) throw new Error(`targets ${r.status}`);
  const j = await r.json();
  return Array.isArray(j.targets) ? j.targets : [];
}
async function postIngest(items) {
  if (!items.length) return { ok: true };
  const r = await fetch(`${MAVEN_URL}/functions/v1/telegram-scan`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-cron-token": CRON_TOKEN },
    body: JSON.stringify({ mode: "ingest", items }),
  });
  return r.json().catch(() => ({ ok: false }));
}

// ── PÚBLICO: t.me/s/<user> devuelve HTML con los últimos posts del canal ──────
async function scrapePublic(user) {
  const r = await fetch(`https://t.me/s/${user}`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) return null;
  const html = await r.text();
  // Cada post: <div class="tgme_widget_message ..." data-post="user/123"> ... <div class="tgme_widget_message_text">TEXTO</div>
  const posts = [];
  const re = /data-post="([^"]+)"[\s\S]*?(?:<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>)?/g;
  let m;
  while ((m = re.exec(html)) && posts.length < 30) {
    const permalink = `https://t.me/${m[1]}`;
    const text = (m[2] || "").replace(/<br\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
    if (text || m[1]) posts.push({ text, permalink });
  }
  return posts;
}

// ── PRIVADO: web.telegram.org logueado. ⚠️ TUNING: leer el DOM del canal. ─────
async function scrapePrivate(page, invite, title, log) {
  // Unirse (best-effort) navegando el invite; algunos piden aprobación del admin.
  try {
    await page.goto(invite.startsWith("http") ? invite : `https://${invite}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await sleep(2500);
    // Botón "Join" / "Unirse" si aparece.
    for (const sel of ['button:has-text("Join")', 'button:has-text("Unirse")', '.btn-primary:has-text("Join")']) {
      const b = await page.$(sel).catch(() => null);
      if (b) { await b.click().catch(() => {}); await sleep(1500); break; }
    }
  } catch { /* */ }
  // Leer los últimos mensajes del canal abierto (DOM de web.telegram.org/k/).
  // ⚠️ Los selectores pueden cambiar — esto es lo que se tunea en el primer run.
  try {
    await sleep(2000);
    const posts = await page.evaluate(() => {
      const out = [];
      const els = document.querySelectorAll(".message, .bubble .message, [class*=message]");
      els.forEach((el) => {
        const text = (el.innerText || "").trim();
        if (text && text.length > 1) out.push({ text: text.slice(0, 1500) });
      });
      return out.slice(-25);
    });
    return posts;
  } catch { return []; }
}

export async function runTelegram({ account = { sessionFile: TG_SESSION, index: 0, count: 1 }, log = () => {}, onResult = () => {}, shouldStop = () => false } = {}) {
  if (!CRON_TOKEN) { log("⚠️ Falta CRON_INTERNAL_TOKEN en el .env — Telegram/X lo necesitan."); return; }
  const { sessionFile, index, count } = account;
  let targets = await fetchTargets();
  // Reparto: si hay N cuentas de Telegram, esta lee su parte (por hash del creator_id).
  if (count > 1) targets = targets.filter((t) => creatorSlot(t.creator_id, count) === index);
  log(`▶️ Telegram cuenta ${index + 1}/${count}: ${targets.length} canales (en vivo desde Maven).`);
  const pub = targets.filter((t) => !isInvite(t.handle) && publicUser(t.handle));
  const priv = targets.filter((t) => isInvite(t.handle));

  // 1) PÚBLICOS (sin cuenta)
  const batch = [];
  for (const t of pub) {
    if (shouldStop()) break;
    const user = publicUser(t.handle);
    const posts = await scrapePublic(user);
    if (posts == null) { log(`⚠️ @${user}: no se pudo leer (t.me/s)`); onResult({ handle: user, outcome: "pendiente", red: "telegram" }); }
    else { batch.push({ creator_id: t.creator_id, source_handle: t.handle, posts }); log(`✅ @${user}: ${posts.length} posts`); onResult({ handle: user, outcome: posts.length ? "historias" : "sin_promo", stories: posts.length, red: "telegram" }); }
    await sleep(1200 + Math.random() * 1500);
  }

  // 2) PRIVADOS (cuenta dedicada + web.telegram.org)
  if (priv.length) {
    if (!existsSync(sessionFile)) { log(`⚠️ ${priv.length} canales privados sin leer: falta login de la cuenta de Telegram (logueala en el panel).`); }
    else if (!shouldStop()) {
      const browser = await chromium.launch({ headless: !HEADFUL });
      const context = await browser.newContext({ storageState: sessionFile, viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      for (const t of priv) {
        if (shouldStop()) break;
        const posts = await scrapePrivate(page, t.handle, t.name, log);
        if (posts && posts.length) { batch.push({ creator_id: t.creator_id, source_handle: t.handle, posts: posts.map((p) => ({ text: p.text })) }); log(`✅ ${t.name} (privado): ${posts.length} posts`); onResult({ handle: t.name, outcome: "historias", stories: posts.length, red: "telegram" }); }
        else { log(`· ${t.name} (privado): sin posts / no leído`); onResult({ handle: t.name, outcome: "pendiente", red: "telegram" }); }
        await sleep(3000 + Math.random() * 3000);
      }
      await browser.close();
    }
  }

  const res = await postIngest(batch);
  log(`◀️ Telegram: ${batch.length} canales posteados. Ingest ok=${res.ok !== false}, promos=${res.promoted ?? "?"}.`);
  return res;
}

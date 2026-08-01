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
// `unreadable` viaja al server para que quede en el INFORME de la corrida: lo que
// no se pudo leer tiene que ser visible (si no, un canal ilegible es invisible —
// no genera fila a propósito, para no escribir un "No" falso).
async function postIngest(items, unreadable = []) {
  if (!items.length && !unreadable.length) return { ok: true };
  const r = await fetch(`${MAVEN_URL}/functions/v1/telegram-scan`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-cron-token": CRON_TOKEN },
    body: JSON.stringify({ mode: "ingest", items, unreadable }),
  });
  return r.json().catch(() => ({ ok: false }));
}

// ── PÚBLICO: t.me/s/<user> = vista previa pública del canal ───────────────────
// Devuelve:
//   null            → el canal NO tiene vista pública (privado / preview off). NO
//                     se manda al ingest: mandar posts:[] escribiría un "No" FALSO
//                     ("revisada · sin actividad") sobre un canal que ni pudimos leer.
//   []              → canal legible, sin posts en la ventana de horas.
//   [{text,permalink,date}]
//
// ⚠️ t.me/s devuelve SIEMPRE los últimos ~20 posts, sin filtrar por fecha (los de
// julietaspicy iban hasta el 16/06). Sin filtrar por `hours`, esos posts viejos
// entraban como promos de HOY. Por eso se extrae el <time datetime> de cada post,
// se filtra por ventana y se manda `date` (unix s) para que la fila caiga en SU día.
async function scrapePublic(user, hours = 24) {
  let html;
  try {
    const r = await fetch(`https://t.me/s/${user}`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    html = await r.text();
  } catch { return null; }
  // Sin widget de mensajes = canal sin vista pública (no es "canal vacío").
  if (!html.includes("tgme_widget_message")) return null;

  const posts = [];
  const cutoff = Date.now() - hours * 3600e3;
  // Un bloque por mensaje: se corta por el atributo data-post de cada burbuja.
  const blocks = html.split(/<div class="tgme_widget_message[ "]/).slice(1);
  for (const b of blocks) {
    const idM = b.match(/data-post="([^"]+)"/);
    if (!idM) continue;
    const timeM = b.match(/<time[^>]+datetime="([^"]+)"/);
    const ts = timeM ? Date.parse(timeM[1]) : NaN;
    if (Number.isFinite(ts) && ts < cutoff) continue;           // post viejo → fuera
    const txtM = b.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const text = (txtM?.[1] || "")
      .replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
      .trim();
    posts.push({
      text,
      permalink: `https://t.me/${idM[1]}`,
      ...(Number.isFinite(ts) ? { date: Math.floor(ts / 1000) } : {}),
    });
    if (posts.length >= 30) break;
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
  const handleByCreator = new Map();
  const noLegibles = [];   // {handle, reason} → van al informe de la corrida
  for (const t of pub) {
    if (shouldStop()) break;
    const user = publicUser(t.handle);
    handleByCreator.set(t.creator_id, user);
    const posts = await scrapePublic(user);
    if (posts == null) {
      // Sin vista pública: NO lo mandamos (mandar posts:[] = "No" falso). Queda
      // para el gateway, que sí puede leerlo si la cuenta es miembro.
      noLegibles.push({ handle: user, reason: "canal sin vista pública (t.me/s no lo muestra: privado o preview desactivado)" });
      log(`🔒 @${user}: sin vista pública — no se puede leer sin cuenta (queda para el gateway)`);
      onResult({ handle: user, outcome: "no_legible", red: "telegram" });
    } else {
      batch.push({ creator_id: t.creator_id, source_handle: t.handle, posts });
      log(`${posts.length ? "✅" : "·"} @${user}: ${posts.length} posts en las últimas 24h`);
      onResult({ handle: user, outcome: posts.length ? "leido" : "sin_posts", stories: posts.length, red: "telegram" });
    }
    await sleep(1200 + Math.random() * 1500);
  }

  // 2) PRIVADOS (cuenta dedicada + web.telegram.org)
  if (priv.length) {
    if (!existsSync(sessionFile)) { for (const t of priv) noLegibles.push({ handle: t.name, reason: "canal privado y no hay cuenta de Telegram logueada en el agente" }); log(`⚠️ ${priv.length} canales privados sin leer: falta login de la cuenta de Telegram (logueala en el panel).`); }
    else if (!shouldStop()) {
      const browser = await chromium.launch({ headless: !HEADFUL });
      const context = await browser.newContext({ storageState: sessionFile, viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      for (const t of priv) {
        if (shouldStop()) break;
        handleByCreator.set(t.creator_id, t.name);
        const posts = await scrapePrivate(page, t.handle, t.name, log);
        // Igual que arriba: si no leímos nada, NO mandamos posts:[] (sería un "No" falso).
        if (posts && posts.length) { batch.push({ creator_id: t.creator_id, source_handle: t.handle, posts: posts.map((p) => ({ text: p.text })) }); log(`✅ ${t.name} (privado): ${posts.length} posts`); onResult({ handle: t.name, outcome: "leido", stories: posts.length, red: "telegram" }); }
        else { noLegibles.push({ handle: t.name, reason: "canal privado (invite): la cuenta no es miembro o no se pudo abrir en Telegram Web" }); log(`🔒 ${t.name} (privado): no se pudo leer — no se marca nada`); onResult({ handle: t.name, outcome: "no_legible", red: "telegram" }); }
        await sleep(3000 + Math.random() * 3000);
      }
      await browser.close();
    }
  }

  const res = await postIngest(batch, noLegibles);
  // La clasificación (promo sí/no) la hace el SERVER en el ingest — acá reflejamos
  // su veredicto por canal, que es lo que interesa ver en el panel.
  for (const r of (res?.results ?? [])) {
    const h = handleByCreator.get(r.creator_id) ?? r.source_handle ?? "?";
    if (r.promoted > 0) onResult({ handle: h, outcome: "con_promo", stories: r.promoted, red: "telegram" });
    else if (r.posts > 0) onResult({ handle: h, outcome: "sin_promo", stories: r.posts, red: "telegram" });
  }
  const R = res?.resumen;
  if (R) {
    log(`━━━ INFORME TELEGRAM ━━━`);
    log(`✅ CON promo: ${R.con_promo}${R.detalle_con_promo?.length ? " → " + R.detalle_con_promo.map((d) => d.handle).join(", ") : ""}`);
    log(`· sin promo (leídos): ${R.sin_promo}   · leídos sin posts nuevos: ${R.leidos_sin_posts}`);
    log(`🔒 NO se pudieron revisar: ${R.no_legibles}`);
    for (const d of (R.detalle_no_legibles ?? [])) log(`     · ${d.handle} — ${d.motivo}`);
    log(`(el informe queda guardado; el bot lo lee con get_promolog_scan_report)`);
  } else log(`◀️ Telegram: ${batch.length} leídos · ${noLegibles.length} no legibles.`);
  return res;
}

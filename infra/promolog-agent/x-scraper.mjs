// x-scraper.mjs — Plan B LOCAL de X. Playwright + una cuenta de X logueada
// (X gatea casi todo el contenido sin login). Navega el perfil de cada creadora,
// lee los tweets recientes y los manda a x-scan?mode=ingest → reusa la MISMA
// clasificación (classifyX + visión) y persist que el path de Apify.
// Targets en vivo desde x-scan?mode=targets.
//
// ⚠️ TUNING (primer run): los selectores del DOM de x.com cambian seguido; la
// extracción de tweets vive en extractTweets() — es el único punto a ajustar.

import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { MAVEN_URL, CRON_TOKEN, X_SESSION, HEADFUL, PACING } from "./config.mjs";
import { sleep } from "./agent-core.mjs";
import { creatorSlot } from "./accounts.mjs";

async function fetchTargets() {
  const r = await fetch(`${MAVEN_URL}/functions/v1/x-scan`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-cron-token": CRON_TOKEN },
    body: JSON.stringify({ mode: "targets" }),
  });
  if (!r.ok) throw new Error(`targets ${r.status}`);
  const j = await r.json();
  return Array.isArray(j.targets) ? j.targets : [];
}
async function postIngest(items, unreadable = []) {
  if (!items.length && !unreadable.length) return { ok: true };
  const r = await fetch(`${MAVEN_URL}/functions/v1/x-scan`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-cron-token": CRON_TOKEN },
    body: JSON.stringify({ mode: "ingest", items, unreadable }),
  });
  return r.json().catch(() => ({ ok: false }));
}

// ⚠️ Extracción del DOM de x.com — el punto a tunear. Lee los <article> de tweets
// del perfil: texto, permalink (link al status), fecha (time[datetime]) e imagen.
async function extractTweets(page, handle) {
  return page.evaluate((h) => {
    const out = [];
    for (const art of document.querySelectorAll("article")) {
      const textEl = art.querySelector('[data-testid="tweetText"]');
      const text = textEl ? textEl.innerText : "";
      const linkEl = art.querySelector('a[href*="/status/"]');
      const permalink = linkEl ? new URL(linkEl.getAttribute("href"), "https://x.com").href.split("?")[0] : "";
      const timeEl = art.querySelector("time[datetime]");
      const date = timeEl ? timeEl.getAttribute("datetime") : "";
      const imgEl = art.querySelector('[data-testid="tweetPhoto"] img, img[src*="pbs.twimg.com/media"]');
      const imageUrl = imgEl ? imgEl.getAttribute("src") : null;
      // solo tweets del propio perfil (evitar retweets/quotes de otros)
      if ((text || imageUrl) && permalink && permalink.toLowerCase().includes("/" + h.toLowerCase() + "/status/")) {
        out.push({ text, permalink, date, imageUrl });
      }
    }
    return out.slice(0, 20);
  }, handle);
}

export async function runX({ account = { sessionFile: X_SESSION, index: 0, count: 1 }, log = () => {}, onResult = () => {}, shouldStop = () => false } = {}) {
  if (!CRON_TOKEN) { log("⚠️ Falta CRON_INTERNAL_TOKEN en el .env."); return; }
  const { sessionFile, index, count } = account;
  if (!existsSync(sessionFile)) { log("⚠️ Falta login de esta cuenta de X (logueala en el panel)."); return; }
  let targets = await fetchTargets();
  if (count > 1) targets = targets.filter((t) => creatorSlot(t.creator_id, count) === index);
  log(`▶️ X cuenta ${index + 1}/${count}: ${targets.length} perfiles (en vivo desde Maven).`);
  const browser = await chromium.launch({ headless: !HEADFUL });
  const context = await browser.newContext({ storageState: sessionFile, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const batch = [];
  const noLegibles = [];   // {handle, reason} → informe de la corrida
  let done = 0;
  for (const t of targets) {
    if (shouldStop()) { log("⏹️ X: detenido."); break; }
    if (done >= PACING.maxPerRun) { log(`(tope ${PACING.maxPerRun})`); break; }
    const handle = String(t.handle).replace(/^@+/, "");
    try {
      await page.goto(`https://x.com/${handle}`, { waitUntil: "domcontentloaded", timeout: PACING.navTimeoutMs });
      // ¿nos mandó a login? → sesión caída.
      if (/\/i\/flow\/login|\/login/.test(page.url())) { log("⛔ X: sesión caída, re-logueá la cuenta."); break; }
      // INTERSTICIAL DE CONTENIDO SENSIBLE: X esconde el timeline de las creadoras
      // adultas tras un "Sí, ver perfil". Sin este clic el perfil daba 0 tweets
      // SIEMPRE (verificado: elonmusk 5 tweets vs eliloaiza/bysaritac 0).
      // El botón es data-testid="empty_state_button_text" ("Yes, view profile" /
      // "Sí, ver perfil"). Tarda unos segundos en renderizar: hay que ESPERARLO,
      // no buscarlo apenas carga el DOM (por eso fallaba el primer intento).
      try {
        const btn = await page.waitForSelector('[data-testid="empty_state_button_text"]', { timeout: 6000 });
        if (btn) { await btn.click().catch(() => {}); await sleep(2000); }
      } catch { /* perfil sin intersticial: seguimos */ }
      // El timeline es lazy: esperar a que aparezca el primer <article>.
      try { await page.waitForSelector("article", { timeout: 15000 }); } catch { /* perfil sin tweets visibles */ }
      await sleep(1200 + Math.random() * 1000);
      const tweets = await extractTweets(page, handle);
      batch.push({ creator_id: t.creator_id, source_handle: handle, tweets });
      log(`${tweets.length ? "✅" : "·"} @${handle}: ${tweets.length} tweets`);
      onResult({ handle, outcome: tweets.length ? "historias" : "sin_promo", stories: tweets.length, red: "x" });
    } catch (e) {
      // Error al abrir el perfil → NO se manda como "sin tweets" (sería un "No"
      // falso): va al informe como no legible.
      noLegibles.push({ handle, reason: `no se pudo abrir el perfil: ${String(e.message).slice(0, 60)}` });
      log(`🔒 @${handle}: no se pudo leer — ${String(e.message).slice(0, 40)}`); onResult({ handle, outcome: "no_legible", red: "x" });
    }
    done++;
    await sleep(PACING.minDelayMs + Math.random() * (PACING.maxDelayMs - PACING.minDelayMs));
  }
  await browser.close();
  const res = await postIngest(batch, noLegibles);
  // Veredicto del server (promo sí/no) reflejado por perfil en el panel.
  for (const r of (res?.results ?? [])) {
    const h = r.source_handle ?? "?";
    if (r.promoted > 0) onResult({ handle: h, outcome: "con_promo", stories: r.promoted, red: "x" });
    else if (r.tweets > 0) onResult({ handle: h, outcome: "sin_promo", stories: r.tweets, red: "x" });
  }
  const R = res?.resumen;
  if (R) {
    log(`━━━ INFORME X ━━━`);
    log(`✅ CON promo: ${R.con_promo}${R.detalle_con_promo?.length ? " → " + R.detalle_con_promo.map((d) => d.handle).join(", ") : ""}`);
    log(`· sin promo (leídos): ${R.sin_promo}   · leídos sin tweets nuevos: ${R.leidos_sin_posts}`);
    log(`🔒 NO se pudieron revisar: ${R.no_legibles}`);
    for (const d of (R.detalle_no_legibles ?? [])) log(`     · ${d.handle} — ${d.motivo}`);
    log(`(informe guardado; el bot lo lee con get_promolog_scan_report)`);
  } else log(`◀️ X: ${batch.length} leídos · ${noLegibles.length} no legibles.`);
  return res;
}

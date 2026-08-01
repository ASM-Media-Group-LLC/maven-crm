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
async function postIngest(items) {
  if (!items.length) return { ok: true };
  const r = await fetch(`${MAVEN_URL}/functions/v1/x-scan`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-cron-token": CRON_TOKEN },
    body: JSON.stringify({ mode: "ingest", items }),
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
  let done = 0;
  for (const t of targets) {
    if (shouldStop()) { log("⏹️ X: detenido."); break; }
    if (done >= PACING.maxPerRun) { log(`(tope ${PACING.maxPerRun})`); break; }
    const handle = String(t.handle).replace(/^@+/, "");
    try {
      await page.goto(`https://x.com/${handle}`, { waitUntil: "domcontentloaded", timeout: PACING.navTimeoutMs });
      // ¿nos mandó a login? → sesión caída.
      if (/\/i\/flow\/login|\/login/.test(page.url())) { log("⛔ X: sesión caída, re-logueá la cuenta."); break; }
      await sleep(2500 + Math.random() * 1500);
      const tweets = await extractTweets(page, handle);
      batch.push({ creator_id: t.creator_id, source_handle: handle, tweets });
      log(`${tweets.length ? "✅" : "·"} @${handle}: ${tweets.length} tweets`);
      onResult({ handle, outcome: tweets.length ? "historias" : "sin_promo", stories: tweets.length, red: "x" });
    } catch (e) {
      batch.push({ creator_id: t.creator_id, source_handle: handle, tweets: [] });
      log(`⚠️ @${handle}: ${String(e.message).slice(0, 40)}`); onResult({ handle, outcome: "pendiente", red: "x" });
    }
    done++;
    await sleep(PACING.minDelayMs + Math.random() * (PACING.maxDelayMs - PACING.minDelayMs));
  }
  await browser.close();
  const res = await postIngest(batch);
  log(`◀️ X: ${batch.length} perfiles posteados. Ingest ok=${res.ok !== false}, promos=${res.promoted ?? "?"}.`);
  return res;
}

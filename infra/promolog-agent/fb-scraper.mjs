// fb-scraper.mjs — Plan B LOCAL de Facebook. Playwright + una cuenta de FB
// logueada; navega la página/perfil de cada creadora, lee los posts recientes y
// los manda a fb-scan?mode=ingest → reusa la MISMA clasificación (classifyFb +
// visión) y el mismo guardado que el path de Apify. El veredicto es idéntico
// venga de donde venga; lo único que cambia es de dónde salen los posts.
//
// POR QUÉ EXISTE: fb-scan corre 6 veces por día contra Apify — es el mayor
// consumidor pago de promolog (X son 2, Telegram usa el gateway propio). Leerlo
// desde una máquina de la oficina lo baja a cero y encima usa IP residencial.
//
// ⚠️ TUNING: los selectores del DOM de Facebook cambian seguido. TODA la
// extracción vive en extractPosts() — es el único punto a ajustar cuando FB
// cambie el markup. El resto (targets, tandas, informe) no depende del DOM.

import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { MAVEN_URL, CRON_TOKEN, SESSIONS_DIR, HEADFUL, PACING } from "./config.mjs";
import { sleep } from "./agent-core.mjs";
import { creatorSlot } from "./accounts.mjs";

export const FB_SESSION = join(SESSIONS_DIR, "facebook.json");

async function fetchTargets() {
  const r = await fetch(`${MAVEN_URL}/functions/v1/fb-scan`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-cron-token": CRON_TOKEN },
    body: JSON.stringify({ mode: "targets" }),
  });
  if (!r.ok) throw new Error(`targets ${r.status}`);
  const j = await r.json();
  return Array.isArray(j.targets) ? j.targets : [];
}

async function postIngest(items) {
  if (!items.length) return { ok: true, results: [] };
  const r = await fetch(`${MAVEN_URL}/functions/v1/fb-scan`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-cron-token": CRON_TOKEN },
    body: JSON.stringify({ mode: "ingest", items }),
  });
  return r.json().catch(() => ({ ok: false, results: [] }));
}

// Cada cuántas páginas se postea. Igual que en X: sin esto el veredicto recién
// aparece al terminar TODAS, y si algo corta a mitad se pierde lo leído.
const FLUSH_EVERY = 5;

// Ventana de lectura. Facebook mezcla posts fijados y "recuerdos" viejos en el
// muro; sin cortar por fecha se insertarían promos retroactivas —el mismo bug
// que ya pasó en X con los tweets fijados de 2024.
const HOURS = 24;

/** ⚠️ EL PUNTO A TUNEAR. Lee los posts del muro desde el DOM.
 *
 *  Facebook no expone fechas legibles: el timestamp real está en el `aria-label`
 *  del link del post o en su `title`. Cuando no se puede leer una fecha, el post
 *  se DESCARTA en vez de asumir "es de hoy" — un post viejo contado como de hoy
 *  es peor que un post perdido (inventa un día de promo que no existió).
 */
async function extractPosts(page, desdeMs) {
  const crudos = await page.evaluate(() => {
    const out = [];
    // Cada post del muro es un [role=article]. Es el contenedor más estable que
    // tiene FB (las clases son hashes que cambian en cada deploy).
    for (const art of Array.from(document.querySelectorAll('[role="article"]')).slice(0, 25)) {
      // Texto: el cuerpo del post. Se saltean los bloques de comentarios, que
      // también son [role=article] anidados.
      if (art.querySelector('[role="article"]')) continue;
      const texto = (art.innerText || "").slice(0, 4000);

      // Permalink + fecha: el link al post lleva el timestamp en aria-label/title.
      let permalink = "", fechaTxt = "";
      for (const a of art.querySelectorAll("a[href]")) {
        const href = a.getAttribute("href") || "";
        if (!/\/(posts|permalink|videos|photos|story\.php|share)\//.test(href) && !/story_fbid=/.test(href)) continue;
        permalink = href.startsWith("http") ? href : `https://www.facebook.com${href}`;
        fechaTxt = a.getAttribute("aria-label") || a.getAttribute("title") || a.innerText || "";
        break;
      }

      // Imagen: la primera foto real del post (se descartan avatares y emojis,
      // que son los `img` chicos y los de scontent con /emoji/).
      let imagen = null;
      for (const img of art.querySelectorAll("img")) {
        const src = img.getAttribute("src") || "";
        if (!src || /emoji|static\.xx|\/rsrc\.php/.test(src)) continue;
        const w = img.naturalWidth || img.width || 0;
        if (w && w < 120) continue;   // avatar / ícono
        imagen = src; break;
      }

      // Links externos del post (el destino es lo que decide si es promo de OF).
      const links = [];
      for (const a of art.querySelectorAll("a[href]")) {
        const h = a.getAttribute("href") || "";
        // FB envuelve los externos en /l.php?u=<encoded>
        const m = h.match(/[?&]u=([^&]+)/);
        const real = m ? decodeURIComponent(m[1]) : h;
        if (/^https?:\/\//.test(real) && !/facebook\.com/.test(real)) links.push(real);
      }

      out.push({ texto, permalink, fechaTxt, imagen, link: links[0] || null, links });
    }
    return out;
  });

  // La fecha se parsea en Node (no en el navegador): acá tenemos Date completo y
  // es más fácil de testear. FB escribe "31 de julio de 2026 a las 21:40" o
  // "hace 2 h" según el idioma/formato.
  const salida = [];
  for (const p of crudos) {
    const ts = parseFechaFb(p.fechaTxt);
    if (ts === null) continue;             // sin fecha legible → fuera (no inventamos)
    if (ts < desdeMs) continue;            // fuera de ventana
    salida.push({
      text: p.texto,
      permalink: p.permalink || null,
      date: new Date(ts).toISOString(),
      imageUrl: p.imagen || null,
      link: p.link,
      links: p.links,
    });
  }
  return salida;
}

/** "hace 2 h" / "2 h" / "31 de julio de 2026 a las 21:40" / "Yesterday at 9:40 PM"
 *  → epoch ms, o null si no se entiende (y entonces el post se descarta). */
export function parseFechaFb(txt) {
  const s = String(txt || "").trim().toLowerCase();
  if (!s) return null;
  const ahora = Date.now();
  // Relativas: "hace 2 h", "2 h", "45 min", "hace 3 días"
  const rel = s.match(/(?:hace\s+)?(\d+)\s*(m|min|minutos?|h|hora?s?|d|d[ií]as?|sem)/);
  if (rel) {
    const n = Number(rel[1]); const u = rel[2];
    const ms = /^m/.test(u) ? n * 60_000
             : /^h/.test(u) ? n * 3600_000
             : /^d/.test(u) ? n * 86_400_000
             : n * 7 * 86_400_000;
    return ahora - ms;
  }
  if (/\bayer\b|\byesterday\b/.test(s)) return ahora - 86_400_000;
  if (/\bhoy\b|\btoday\b/.test(s)) return ahora - 3600_000;   // hoy, hora desconocida
  // Absolutas: dejamos que Date las intente (FB suele dar formato local completo).
  const d = Date.parse(txt);
  return Number.isFinite(d) ? d : null;
}

// Refleja el veredicto del server y acumula los totales de la tanda.
function aplicarVeredictos(res, acc, onResult, log) {
  for (const r of (res?.results ?? [])) {
    const h = r.source_handle ?? "?";
    if (r.skip) continue;
    acc.leidos++;
    if (r.promoted > 0) {
      acc.con_promo++; acc.detalle_con_promo.push({ handle: h, promos: r.promoted });
      onResult({ handle: h, outcome: "con_promo", stories: r.promoted, red: "facebook" });
      log(`   ✅ ${h} PROMOCIONÓ (${r.promoted})`);
    } else if (r.posts > 0) { acc.sin_promo++; onResult({ handle: h, outcome: "sin_promo", stories: r.posts, red: "facebook" }); }
    else { acc.leidos_sin_posts++; }
    if (r.ya_analizados > 0) log(`   ↩️ ${h}: ${r.ya_analizados} post(s) ya analizados antes`);
  }
}

export async function runFacebook({ account = { sessionFile: FB_SESSION, index: 0, count: 1 }, log = () => {}, onResult = () => {}, shouldStop = () => false } = {}) {
  if (!CRON_TOKEN) { log("⚠️ Falta CRON_INTERNAL_TOKEN en el .env."); return; }
  const { sessionFile, index, count } = account;
  if (!existsSync(sessionFile)) { log("⚠️ Falta login de esta cuenta de Facebook (logueala en el panel)."); return; }

  let targets = await fetchTargets();
  if (count > 1) targets = targets.filter((t) => creatorSlot(t.creator_id, count) === index);
  log(`▶️ Facebook cuenta ${index + 1}/${count}: ${targets.length} páginas (en vivo desde Maven).`);

  const browser = await chromium.launch({ headless: !HEADFUL });
  const context = await browser.newContext({ storageState: sessionFile, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const batch = [];
  const acc = { leidos: 0, con_promo: 0, sin_promo: 0, leidos_sin_posts: 0, no_legibles: 0, detalle_con_promo: [] };
  const desdeMs = Date.now() - HOURS * 3600_000;
  let done = 0;

  try {
    for (const t of targets) {
      if (shouldStop()) { log("⏹️ Facebook: detenido."); break; }
      if (done >= PACING.maxPerRun) { log(`(tope ${PACING.maxPerRun})`); break; }
      const etiqueta = String(t.handle || "").replace(/^https?:\/\/(www\.)?facebook\.com\//, "");
      try {
        await page.goto(t.url, { waitUntil: "domcontentloaded", timeout: PACING.navTimeoutMs });
        // ¿nos mandó a login? → sesión caída: cortamos la corrida entera (seguir
        // sería marcar "sin posts" a todas, que es un "No" falso masivo).
        if (/\/login|checkpoint/.test(page.url())) { log("⛔ Facebook: sesión caída, re-logueá la cuenta."); break; }
        try { await page.waitForSelector('[role="article"]', { timeout: 15000 }); } catch { /* muro sin posts visibles */ }
        await sleep(1200 + Math.random() * 1200);
        const posts = await extractPosts(page, desdeMs);
        batch.push({ creator_id: t.creator_id, source_handle: etiqueta, posts });
        log(`${posts.length ? "✅" : "·"} ${etiqueta}: ${posts.length} posts`);
        onResult({ handle: etiqueta, outcome: posts.length ? "historias" : "sin_promo", stories: posts.length, red: "facebook" });
      } catch (e) {
        // No se pudo abrir → NO se manda como "sin posts" (sería un No falso).
        acc.no_legibles++;
        log(`🔒 ${etiqueta}: no se pudo leer — ${String(e.message).slice(0, 40)}`);
        onResult({ handle: etiqueta, outcome: "no_legible", red: "facebook" });
      }
      done++;
      if (batch.length >= FLUSH_EVERY) {
        aplicarVeredictos(await postIngest(batch.splice(0, batch.length)), acc, onResult, log);
      }
      await sleep(PACING.minDelayMs + Math.random() * (PACING.maxDelayMs - PACING.minDelayMs));
    }
    if (batch.length) aplicarVeredictos(await postIngest(batch), acc, onResult, log);
  } finally {
    await browser.close().catch(() => {});
  }

  log(`—— INFORME Facebook ——`);
  log(`✅ con promo: ${acc.con_promo}  ·  sin promo: ${acc.sin_promo}  ·  sin posts: ${acc.leidos_sin_posts}`);
  if (acc.no_legibles) log(`🔒 NO se pudieron revisar: ${acc.no_legibles}`);
  log(`— corrida terminada —`);
}

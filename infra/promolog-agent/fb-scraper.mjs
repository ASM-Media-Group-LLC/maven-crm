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
import { sesionUsable } from "./session-check.mjs";

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

// Mismo contrato que Telegram y X: `unreadable` lleva lo que NO se pudo leer (con
// motivo), `acumulado` los totales de las tandas previas y `final` marca la última,
// que es la que hace que el edge escriba el informe de la corrida UNA vez.
// Facebook mandaba solo `items` → sus corridas no quedaban registradas en Maven
// (ni el panel ni el bot las veían) y no tenía por dónde reportar lo ilegible.
async function postIngest(items, unreadable = [], { acumulado = null, final = true } = {}) {
  if (!items.length && !unreadable.length && final !== true) return { ok: true, results: [] };
  const r = await fetch(`${MAVEN_URL}/functions/v1/fb-scan`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-cron-token": CRON_TOKEN },
    body: JSON.stringify({ mode: "ingest", items, unreadable, acumulado, final }),
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
  // `vistos` = posts que había en el DOM, ANTES de filtrar por fecha. Es el dato que
  // distingue "leí el muro y no publicó hoy" (vistos > 0, salida vacía) de "no pude
  // leer el muro" (vistos === 0). Sin él, las dos cosas terminaban como "no promocionó".
  return { posts: salida, vistos: crudos.length };
}

/** ¿Pudimos ver el muro de esta página, o Facebook nos mostró otra cosa?
 *
 *  ⚠️ ESTA ES LA FUNCIÓN QUE EVITA LOS "No" FALSOS. Facebook no siempre manda a
 *  /login cuando no te deja ver algo: si la cuenta scanner NO sigue el perfil, o el
 *  perfil restringe sus publicaciones, la página CARGA BIEN y muestra un cartel
 *  ("este contenido no está disponible", un muro de registro embebido, o
 *  directamente un perfil sin publicaciones visibles). El scraper leía cero posts,
 *  los mandaba como `posts: []`, y el edge los escribía como "no promocionó".
 *  Eso es inventar un veredicto sobre algo que nunca se vio.
 *
 *  Devuelve null si el muro se pudo leer, o el MOTIVO si no.
 *  Ante la duda decimos "no legible": perder cobertura se ve en el informe y se
 *  arregla; un "No" falso se cuela como dato bueno y nadie lo revisa.
 */
async function motivoIlegible(page, postsVistos) {
  if (postsVistos > 0) return null;   // vimos publicaciones: el muro se leyó
  return await page.evaluate(() => {
    const txt = (document.body.innerText || "").toLowerCase();
    const tiene = (...frases) => frases.some((f) => txt.includes(f));
    // Muro de login embebido (pasa con perfiles que exigen sesión aunque la haya).
    if (document.querySelector('[data-testid="royal_login_form"], form[action*="login"] input[name="pass"]')) return "muro_de_login";
    if (tiene("contenido no está disponible", "content isn't available", "content isn't available right now",
              "este contenido no está disponible")) return "contenido_no_disponible";
    if (tiene("esta página no está disponible", "this page isn't available", "página no encontrada", "page not found")) return "pagina_no_existe";
    if (tiene("inicia sesión", "iniciar sesión", "log in to continue", "you must log in")) return "pide_login";
    if (tiene("solo sus amigos", "friends only", "solo amigos")) return "solo_amigos";
    // Sin cartel reconocible y sin un solo [role=article]: no podemos afirmar que
    // leímos el muro. Puede ser un perfil restringido, un cambio de maquetado de FB
    // o una carga a medias — las tres cosas requieren mirar, no asumir.
    if (!document.querySelector('[role="article"]')) return "sin_publicaciones_visibles";
    return null;
  });
}

/** Identificador de la página para armar la URL del visor de historias.
 *  `mode=targets` manda {handle, url} y el handle puede venir en tres formas:
 *  username pelado, URL completa, o profile.php?id=<número>. Las tres se
 *  reducen a lo que /stories/<id> necesita. */
export function idDeFacebook(target) {
  const bruto = String(target?.handle || target?.url || "").trim();
  if (!bruto) return null;
  const numerico = bruto.match(/(?:profile\.php\?id=|\/)(\d{5,})/);
  if (numerico) return numerico[1];
  const conUrl = bruto.match(/facebook\.com\/([^/?#]+)/i);
  const user = (conUrl ? conUrl[1] : bruto).replace(/^@+/, "").trim();
  return /^[A-Za-z0-9._-]+$/.test(user) ? user : null;
}

/** Clave ESTABLE a partir de una URL de Facebook.
 *
 *  Las URLs de imagen de fbcdn traen tokens que cambian en CADA lectura
 *  (`oe=`, `oh=`, `_nc_ht`…): usarlas como identidad hace que el mismo contenido
 *  entre otra vez en cada corrida. Nos quedamos con el path, que sí identifica al
 *  archivo, y descartamos la query entera.
 */
export function claveEstableFb(url) {
  const s = String(url || "").trim();
  if (!s) return null;
  try { const u = new URL(s); return `${u.origin}${u.pathname}`; }
  catch { return s.split("?")[0] || null; }
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

/** ⚠️ SEGUNDO PUNTO A TUNEAR. Lee las HISTORIAS (stories) de la página.
 *
 *  Por qué importan: en Facebook, igual que en Instagram, la promo del OF suele ir
 *  en la historia —efímera, con sticker de link— y no en el muro. El actor de
 *  Apify que usa el cron es `facebook-posts-scraper`: SOLO muro. O sea que las
 *  historias de Facebook nunca se escanearon, por ningún camino.
 *
 *  Casi siempre son IMAGEN sin texto, así que el veredicto lo va a dar la VISIÓN
 *  del edge (que ya corre cuando hay imagen y el texto no dio señal). Acá solo
 *  hay que traerlas bien identificadas.
 *
 *  ⚠️ CLAVE ESTABLE: se prefiere la URL de la historia (trae su id y no cambia).
 *  Si no se puede leer, se cae al path de la imagen SIN la query — nunca a la URL
 *  completa de fbcdn, que trae tokens nuevos en cada lectura y duplicaría la fila
 *  en cada corrida.
 *
 *  ⚠️ EFECTO REAL: abrir el visor MARCA LA HISTORIA COMO VISTA. La creadora va a
 *  ver a esta cuenta en su lista de espectadores. Es inevitable leyendo por
 *  navegador; hay que decidirlo, no descubrirlo.
 */
async function extractStories(page, target, desdeMs, log) {
  const historias = [];
  const vistas = new Set();
  const id = idDeFacebook(target);
  if (!id) return historias;
  try {
    await page.goto(`https://www.facebook.com/stories/${encodeURIComponent(id)}`,
      { waitUntil: "domcontentloaded", timeout: PACING.navTimeoutMs });
  } catch { return historias; }

  // Sin visor abierto = no hay historias activas. No es un error.
  try { await page.waitForSelector('[role="dialog"], [data-pagelet*="Stories"], video, img', { timeout: 8000 }); }
  catch { return historias; }

  for (let i = 0; i < 20; i++) {
    await sleep(900 + Math.random() * 600);
    const actual = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]') || document.body;
      // Imagen grande = el contenido de la historia (se descartan íconos/avatares).
      let media = null, w = 0;
      for (const img of dlg.querySelectorAll("img")) {
        const src = img.getAttribute("src") || "";
        if (!src || /emoji|rsrc\.php|static\.xx/.test(src)) continue;
        const ancho = img.naturalWidth || img.width || 0;
        if (ancho > w) { w = ancho; media = src; }
      }
      const video = dlg.querySelector("video");
      // Texto sobreimpreso + links del sticker.
      const texto = (dlg.innerText || "").slice(0, 1500);
      const links = [];
      for (const a of dlg.querySelectorAll("a[href]")) {
        const h = a.getAttribute("href") || "";
        const m = h.match(/[?&]u=([^&]+)/);
        const real = m ? decodeURIComponent(m[1]) : h;
        if (/^https?:\/\//.test(real) && !/facebook\.com/.test(real)) links.push(real);
      }
      return { media: media || (video?.getAttribute("poster") ?? null), texto, links, url: location.href };
    });

    const clave = claveEstableFb(actual.url) || claveEstableFb(actual.media);
    if (!clave || vistas.has(clave)) break;      // el visor dejó de avanzar → terminamos
    vistas.add(clave);

    if (actual.media || actual.links.length) {
      historias.push({
        text: actual.texto,
        permalink: clave,                        // clave estable, no la URL con tokens
        // El visor no expone la hora de publicación de forma legible. Una historia
        // ACTIVA dura 24h por definición, así que se registra como de ahora: es la
        // misma suposición que hace el scan de Instagram y es correcta por diseño.
        date: new Date().toISOString(),
        imageUrl: actual.media,
        link: actual.links[0] || null,
        es_historia: true,
      });
    }
    // Avanzar. ArrowRight es lo más estable del visor de FB.
    await page.keyboard.press("ArrowRight").catch(() => {});
  }
  if (historias.length) log(`   📖 ${historias.length} historia(s)`);
  return historias;
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
    acc.insertadas += (r.inserted ?? 0);
    if (r.ya_analizados > 0) log(`   ↩️ ${h}: ${r.ya_analizados} post(s) ya analizados antes`);
  }
}

export async function runFacebook({ account = { sessionFile: FB_SESSION, index: 0, count: 1 }, log = () => {}, onResult = () => {}, shouldStop = () => false } = {}) {
  if (!CRON_TOKEN) { log("⚠️ Falta CRON_INTERNAL_TOKEN en el .env."); return; }
  const { sessionFile, index, count } = account;
  // Igual que en X: un archivo de sesión vacío haría escanear todo sin login, y
  // Facebook sin sesión no muestra muros → una corrida entera de "No" falsos.
  const sesion = sesionUsable(sessionFile, "facebook");
  if (!sesion.ok) {
    log(`⚠️ Facebook: ${sesion.motivo}. NO se escanea (correr sin sesión solo produce falsos "no promocionó").`);
    log("   Logueá la cuenta en el panel, o importala de Chrome:  node import-session.mjs facebook");
    return;
  }

  let targets = await fetchTargets();
  if (count > 1) targets = targets.filter((t) => creatorSlot(t.creator_id, count) === index);
  log(`▶️ Facebook cuenta ${index + 1}/${count}: ${targets.length} páginas (en vivo desde Maven).`);

  const browser = await chromium.launch({ headless: !HEADFUL });
  const context = await browser.newContext({ storageState: sessionFile, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const batch = [];
  // `insertadas` acumula entre tandas para que el informe de la corrida diga cuántas
  // filas se crearon EN TOTAL y no solo en la última tanda (que es lo que ve el panel).
  const acc = { leidos: 0, con_promo: 0, sin_promo: 0, leidos_sin_posts: 0, no_legibles: 0, insertadas: 0, detalle_con_promo: [] };
  // Páginas que NO se pudieron leer, con el motivo. Viajan aparte de `items`: lo que
  // no se vio no genera fila (para no escribir un "No" falso), pero sí tiene que
  // aparecer en el informe — si no, queda invisible y nadie sabe que faltó revisarla.
  const noLegibles = [];
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
        try { await page.waitForSelector('[role="article"]', { timeout: 15000 }); } catch { /* puede no haber muro legible: se decide abajo */ }
        await sleep(1200 + Math.random() * 1200);
        const { posts, vistos } = await extractPosts(page, desdeMs);

        // ⚠️ ANTES DE MANDAR NADA: ¿de verdad leímos esta página? Si no, se cuenta
        // como no legible y NO se postea — mandar `posts: []` hace que el edge
        // escriba "no promocionó" sobre una página que nunca vimos.
        const ilegible = await motivoIlegible(page, vistos);
        if (ilegible) {
          acc.no_legibles++;
          noLegibles.push({ handle: etiqueta, reason: ilegible });
          log(`🔒 ${etiqueta}: no se pudo leer — ${ilegible}`);
          onResult({ handle: etiqueta, outcome: "no_legible", motivo: ilegible, red: "facebook" });
          done++;
          await sleep(PACING.minDelayMs + Math.random() * (PACING.maxDelayMs - PACING.minDelayMs));
          continue;
        }

        // Las HISTORIAS van en el mismo lote: para promolog la pregunta es
        // "¿promocionó hoy?", y da igual si fue por muro o por historia. El edge
        // las clasifica con la misma regla (y con visión, que es lo que decide en
        // una historia, que casi siempre es imagen sin texto).
        const stories = await extractStories(page, t, desdeMs, log);
        const todo = [...posts, ...stories];
        batch.push({ creator_id: t.creator_id, source_handle: etiqueta, posts: todo, legible: true });
        log(`${todo.length ? "✅" : "·"} ${etiqueta}: ${posts.length} posts · ${stories.length} historias (${vistos} en el muro)`);
        onResult({ handle: etiqueta, outcome: todo.length ? "historias" : "sin_promo", stories: todo.length, red: "facebook" });
      } catch (e) {
        // No se pudo abrir → NO se manda como "sin posts" (sería un No falso).
        acc.no_legibles++;
        const motivo = `navegacion: ${String(e.message).slice(0, 60)}`;
        noLegibles.push({ handle: etiqueta, reason: motivo });
        log(`🔒 ${etiqueta}: no se pudo leer — ${motivo}`);
        onResult({ handle: etiqueta, outcome: "no_legible", motivo, red: "facebook" });
      }
      done++;
      if (batch.length >= FLUSH_EVERY) {
        aplicarVeredictos(await postIngest(batch.splice(0, batch.length), [], { acumulado: acc, final: false }), acc, onResult, log);
      }
      await sleep(PACING.minDelayMs + Math.random() * (PACING.maxDelayMs - PACING.minDelayMs));
    }
    // Tanda final: va SIEMPRE, aunque no haya quedado nada por postear. Es la que
    // lleva los no legibles y la que hace que el edge registre la corrida — sin
    // esto, un scan donde todo salió ilegible no dejaba ni rastro en Maven.
    aplicarVeredictos(await postIngest(batch, noLegibles, { acumulado: acc, final: true }), acc, onResult, log);
  } finally {
    await browser.close().catch(() => {});
  }

  log(`—— INFORME Facebook ——`);
  log(`✅ con promo: ${acc.con_promo}  ·  sin promo: ${acc.sin_promo}  ·  sin posts: ${acc.leidos_sin_posts}`);
  if (acc.no_legibles) {
    // El motivo importa: "no la seguimos" se arregla siguiéndola, "muro de login"
    // es re-loguear, "no existe" es corregir el handle en Maven. Un motivo genérico
    // hizo creer una vez que faltaban 32 membresías de Telegram cuando faltaban 2.
    log(`🔒 NO se pudieron revisar: ${acc.no_legibles}`);
    const porMotivo = {};
    for (const u of noLegibles) porMotivo[u.reason] = (porMotivo[u.reason] || 0) + 1;
    for (const [m, n] of Object.entries(porMotivo)) log(`   · ${m}: ${n}`);
  }
  log(`— corrida terminada —`);
}

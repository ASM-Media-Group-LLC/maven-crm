// agent-core.mjs — la lógica reusable del scanner (la comparten el CLI index.mjs
// y la GUI ui.mjs). Todo lo que antes vivía inline en index.mjs, más los helpers
// de login por UI. Emite eventos por callbacks (log/onResult) en vez de console.log
// para que la GUI pueda streamear el progreso en vivo.

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SESSIONS_DIR, MAVEN_URL, EXT_TOKEN, SLOTS_COUNT, PACING, SOFTBLOCK, HEADFUL } from "./config.mjs";
import { tieneSesion, QUE_FALTA } from "./session-check.mjs";

const COOLDOWN_FILE = join(SESSIONS_DIR, "cooldown.json");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => PACING.minDelayMs + Math.random() * (PACING.maxDelayMs - PACING.minDelayMs);
export const norm = (s) => String(s ?? "").toLowerCase().replace(/[@/\s]/g, "").trim();

/** "31/07 21:46" en hora de Bogotá — para mostrar CUÁNDO se publicó una promo, no
 *  sólo que la hubo. Vive acá porque lo usan X y Telegram: la ventana de lectura es
 *  de 24h, así que las dos redes releen posts de anoche y sin la fecha el panel
 *  parece estar anunciando algo de hoy. */
export function fechaCorta(iso) {
  if (!iso) return "sin fecha";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "sin fecha";
  return d.toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function readCooldowns() { try { return JSON.parse(readFileSync(COOLDOWN_FILE, "utf8")); } catch { return {}; } }
export function writeCooldown(slot, until) {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  const c = readCooldowns(); if (until) c[slot] = until; else delete c[slot];
  writeFileSync(COOLDOWN_FILE, JSON.stringify(c, null, 2));
}
// ¿Hay sesión de verdad en el archivo? El chequeo por red vive en session-check.mjs
// (lo comparten el panel, el importador de cookies y los scrapers).
// `network` es opcional solo por compatibilidad con llamadas viejas; sin ella no se
// puede afirmar nada sobre el login, y devolvemos null en vez de inventar un true.
export function sessionInfo(sessionFile, network) {
  try {
    const d = JSON.parse(readFileSync(sessionFile, "utf8"));
    return { exists: true, loggedIn: tieneSesion(d, network) };
  } catch { return { exists: false, loggedIn: false }; }
}

// index = posición de esta cuenta (0..count-1); count = total de cuentas IG.
// scan-targets reparte por hash(creator_id)%count → esta cuenta recibe su parte.
export async function fetchTargets(index, count) {
  const u = `${MAVEN_URL}/functions/v1/promolog-scan-targets?slot=${index}&slots=${count}`;
  const r = await fetch(u, { headers: { "x-ext-token": EXT_TOKEN } });
  if (!r.ok) throw new Error(`scan-targets ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return Array.isArray(j.targets) ? j.targets : [];
}

// Lee historias de una creadora desde el contexto de la página (IP residencial,
// sesión real). Devuelve { outcome, reelItems?, igUserId? }.
export async function readStories(page, handle, igUserId) {
  let uid = igUserId && /^\d{1,32}$/.test(String(igUserId)) ? String(igUserId) : null;
  if (!uid) {
    try {
      const res = await page.evaluate(async (h) => {
        const r = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(h)}`,
          { headers: { "x-ig-app-id": "936619743392459" }, credentials: "include" });
        if (!r.ok) return { status: r.status };
        const j = await r.json().catch(() => ({}));
        return { status: r.status, id: j?.data?.user?.id ?? null };
      }, handle);
      if (res?.id) uid = String(res.id);
      else if (res?.status === 401 || res?.status === 429) return { outcome: "throttled" };
    } catch { /* */ }
    if (!uid) return { outcome: "no_ig_id" };
  }
  try { await page.goto(`https://www.instagram.com/stories/${handle}/`, { waitUntil: "domcontentloaded", timeout: PACING.navTimeoutMs }); } catch { /* */ }
  if (/\/accounts\/login|\/challenge/i.test(page.url())) return { outcome: "throttled" };
  await sleep(600 + Math.random() * 900);
  try {
    const res = await page.evaluate(async (id) => {
      const r = await fetch(`https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${id}`,
        { headers: { "x-ig-app-id": "936619743392459" }, credentials: "include" });
      let body = null; try { body = await r.json(); } catch { /* */ }
      return { status: r.status, body };
    }, uid);
    if ([401, 403, 429].includes(res.status)) return { outcome: "throttled" };
    if (res.status !== 200 || !res.body) return { outcome: "throttled" };
    const rm = res.body.reels_media?.[0] ?? res.body.reels?.[uid] ?? null;
    const items = Array.isArray(rm?.items) ? rm.items : [];
    if (items.length === 0) return { outcome: "empty", igUserId: uid };
    return { outcome: "items", reelItems: items, igUserId: uid };
  } catch { return { outcome: "throttled" }; }
}

export async function postToIngest(creators) {
  if (!creators.length) return { ok: true, note: "nada que postear" };
  const r = await fetch(`${MAVEN_URL}/functions/v1/promolog-ingest-stories`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-ext-token": EXT_TOKEN },
    // `source`: este endpoint lo comparten la extensión de Chrome y este agente, con
    // el mismo token. Sin declararlo, las filas de los dos quedaban idénticas en la
    // base (el edge etiquetaba TODO como "extension") y era imposible responder
    // "¿esto lo escaneó la extensión o el agente?" — que es exactamente lo que se
    // preguntó el 01/08 y no se pudo contestar con datos.
    body: JSON.stringify({ creators, source: "agente-local" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`ingest ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

// Corre UNA cuenta. Callbacks: log(msg), onResult({handle,outcome,stories}), shouldStop().
export async function runAccount(acct, { log = () => {}, onResult = () => {}, shouldStop = () => false } = {}) {
  const cds = readCooldowns();
  if (cds[acct.id] && Date.now() < cds[acct.id]) {
    const mins = Math.round((cds[acct.id] - Date.now()) / 60000);
    log(`⏸️ slot ${acct.id}: en cooldown ${mins} min más. Se saltea.`);
    return { slot: acct.id, skipped: "cooldown", cooldownUntil: cds[acct.id] };
  }
  if (!existsSync(acct.sessionFile)) { log(`⚠️ slot ${acct.id}: sin sesión. Loguea la cuenta primero.`); return { slot: acct.id, skipped: "no_session" }; }

  const targets = await fetchTargets(acct.index, acct.count);
  log(`▶️ cuenta ${acct.id} (${acct.index + 1}/${acct.count}): ${targets.length} creadoras.`);
  const browser = await chromium.launch({ headless: !HEADFUL });
  const context = await browser.newContext({
    storageState: acct.sessionFile, viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  const out = [];
  let sawStories = false, emptyStreak = 0, softBlocked = false, done = 0, sis = 0, nos = 0, pend = 0;

  for (const t of targets) {
    if (shouldStop()) { log(`⏹️ slot ${acct.id}: detenido a pedido.`); break; }
    if (done >= PACING.maxPerRun) { log(`(tope ${PACING.maxPerRun} por corrida)`); break; }
    const handle = norm(t.handle);
    const base = { creator_id: t.creator_id, handle };
    const r = await readStories(page, handle, t.ig_user_id);

    if (r.outcome === "items") {
      out.push({ ...base, reel_items: r.reelItems, is_private: false, following: true, ig_user_id: r.igUserId });
      sawStories = true; emptyStreak = 0; sis++;
      log(`✅ ${handle}: ${r.reelItems.length} historias`); onResult({ handle, outcome: "historias", stories: r.reelItems.length });
    } else if (r.outcome === "empty") {
      if (sawStories) { out.push({ ...base, reel_items: [], is_private: false, following: true, ...(r.igUserId ? { ig_user_id: r.igUserId } : {}) }); nos++; log(`· ${handle}: sin historias hoy`); onResult({ handle, outcome: "sin_promo" }); }
      else { out.push({ ...base, error: "unconfirmed_empty" }); pend++; log(`? ${handle}: vacío sin lectura previa → pendiente`); onResult({ handle, outcome: "pendiente" }); }
      emptyStreak++;
    } else {
      out.push({ ...base, error: r.outcome }); if (sawStories) emptyStreak++; pend++;
      log(`⚠️ ${handle}: ${r.outcome} → pendiente`); onResult({ handle, outcome: r.outcome });
    }
    done++;
    if (sawStories && emptyStreak >= SOFTBLOCK.streakAbort) {
      softBlocked = true;
      log(`⛔ slot ${acct.id}: racha de ${emptyStreak} vacíos → IG limitó la sesión. Corto y dejo en cooldown ${SOFTBLOCK.cooldownHours}h.`);
      break;
    }
    await sleep(jitter());
    if (done % PACING.batchPauseEvery === 0) { log(`… pausa de lote (${Math.round(PACING.batchPauseMs / 1000)}s)`); await sleep(PACING.batchPauseMs); }
  }
  await browser.close();
  if (softBlocked) writeCooldown(acct.id, Date.now() + SOFTBLOCK.cooldownHours * 3600_000);
  const ingest = await postToIngest(out).catch((e) => ({ ok: false, error: e.message }));
  // El VEREDICTO de promo lo pone el ingest (link stickers, puente IG→TG), no este
  // agente: acá solo se leen historias. Antes se tiraba la respuesta y el panel
  // quedaba en "leído" para siempre — y el "✅14" del resumen se leyó como "14
  // promos" (03/08, no lo eran: eran cuentas con historias). Ahora se reemite el
  // veredicto por cuenta (la UI reemplaza la fila) y el resumen lo dice en letras.
  const verds = Array.isArray(ingest.results) ? ingest.results.filter((x) => x && x.handle && (x.outcome === "si" || x.outcome === "no")) : [];
  for (const v of verds) {
    onResult({ handle: v.handle, outcome: v.outcome === "si" ? "con_promo" : "sin_promo", stories: v.story_items });
  }
  const vtxt = ingest.ok === false
    ? `Ingest FALLÓ: ${String(ingest.error ?? "?").slice(0, 120)}`
    : `Veredicto: ✅${ingest.si ?? 0} SÍ promocionaron · ${ingest.no ?? 0} no · ${ingest.pending ?? 0} pendientes.`;
  log(`◀️ slot ${acct.id}: leídas ${done} (con historias ${sis} · sin historias ${nos} · ⚠️${pend}). ${vtxt}`);
  return { slot: acct.id, leidas: done, si: ingest.si ?? 0, no: ingest.no ?? nos, pending: ingest.pending ?? pend, softBlocked };
}

// ── Login por UI: abrir navegador headed, guardar sesión cuando el usuario avisa ──
const openLogins = new Map(); // key → { browser, context }
// Genérico: abre un navegador visible en `url` (login de IG / Telegram Web / X).
export async function openLoginTo(key, url) {
  if (openLogins.has(key)) { try { await openLogins.get(key).browser.close(); } catch { /* */ } openLogins.delete(key); }
  mkdirSync(SESSIONS_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  openLogins.set(key, { browser, context });
}
// Guarda SOLO si la sesión tiene el marcador de la red. Si no lo tiene, NO escribe
// el archivo y DEJA LA VENTANA ABIERTA para que termines de loguearte y le des otra
// vez — cerrarla te obligaba a empezar de cero sin saber por qué había fallado.
export async function saveLoginTo(key, sessionFile, network) {
  const l = openLogins.get(key);
  if (!l) throw new Error("no hay login abierto para " + key);
  const estado = await l.context.storageState();
  if (tieneSesion(estado, network) === false) {
    throw new Error(
      `Todavía no hay sesión: falta ${QUE_FALTA[network]}. ` +
      `Termina de loguearte en la ventana que quedó abierta (incluido el 2FA) y vuelve a apretar “Ya me logueé”.` +
      (network === "x" ? " Ojo: X bloquea el login automatizado — para X hay que importar la sesión de Chrome: node import-session.mjs x" : ""),
    );
  }
  writeFileSync(sessionFile, JSON.stringify(estado, null, 2));
  await l.browser.close();
  openLogins.delete(key);
}
// IG (compat con ui.mjs existente): slot → login de Instagram.
export const openLogin = (slot) => openLoginTo(slot, "https://www.instagram.com/accounts/login/");
export const saveLogin = (slot, sessionFile) => saveLoginTo(slot, sessionFile);

// index.mjs — scanner de historias de IG para Promolog. Corre LOCAL (tu Mac,
// IP residencial) con un navegador real logueado por cuenta scanner. Reemplaza
// la extensión de Chrome. Clave anti-ban: NO pone todo el volumen en una cuenta
// — cada cuenta (slot A/B) lee SOLO su mitad (scan-targets?slot=…), y si IG
// empieza a limitar la sesión, corta y la deja en cooldown en vez de martillar.
//
// Flujo por cuenta:
//   1. scan-targets?slot=<slot>&slots=<N> → su mitad de creadoras.
//   2. Por creadora: visita la página de historias (huella humana) y trae los
//      items crudos de IG desde el CONTEXTO de la página (sus cookies, mismos
//      headers que la web-app). Los items ya vienen en el shape que espera el
//      ingest → se reusa TODA la clasificación (Sí/No, dedup por story_pk,
//      guardas de watermark/nick). Cero lógica de análisis acá.
//   3. POST a promolog-ingest-stories (igual que la extensión).
//
// El análisis (IA, evidencia, dedup) vive en el server (promolog-ingest-stories).
// Este agente SOLO lee — igual que la extensión.

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { MAVEN_URL, EXT_TOKEN, ACCOUNTS, SLOTS_COUNT, PACING, SOFTBLOCK, HEADFUL, ROOT, assertConfig } from "./config.mjs";

assertConfig();

const COOLDOWN_FILE = join(ROOT, "sessions", "cooldown.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => PACING.minDelayMs + Math.random() * (PACING.maxDelayMs - PACING.minDelayMs);
const norm = (s) => String(s ?? "").toLowerCase().replace(/[@/\s]/g, "").trim();

function readCooldowns() { try { return JSON.parse(readFileSync(COOLDOWN_FILE, "utf8")); } catch { return {}; } }
function writeCooldown(slot, until) {
  mkdirSync(join(ROOT, "sessions"), { recursive: true });
  const c = readCooldowns(); c[slot] = until; writeFileSync(COOLDOWN_FILE, JSON.stringify(c, null, 2));
}

// ── Traer targets del slot ────────────────────────────────────────────────
async function fetchTargets(slot) {
  const u = `${MAVEN_URL}/functions/v1/promolog-scan-targets?slot=${encodeURIComponent(slot)}&slots=${SLOTS_COUNT}`;
  const r = await fetch(u, { headers: { "x-ext-token": EXT_TOKEN } });
  if (!r.ok) throw new Error(`scan-targets ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return Array.isArray(j.targets) ? j.targets : [];
}

// ── Leer las historias de UNA creadora desde el contexto de la página ─────
// Devuelve { outcome, reelItems?, igUserId? } con outcome ∈
//   items      → hay historias (reelItems crudos)
//   empty      → cuenta legible (pública) sin historias hoy → el ingest = "No"
//   throttled  → IG limitó / respuesta bloqueada → pending (NUNCA "No" falso)
//   no_ig_id   → no se pudo resolver el user-id → pending
async function readStories(page, handle, igUserId) {
  // 1) Resolver user-id si falta (endpoint que IG throttlea antes → evitarlo si ya viene cacheado).
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
    } catch { /* cae a no_ig_id */ }
    if (!uid) return { outcome: "no_ig_id" };
  }

  // 2) Huella humana: visitar la página de historias (no bloquea si no hay).
  try { await page.goto(`https://www.instagram.com/stories/${handle}/`, { waitUntil: "domcontentloaded", timeout: PACING.navTimeoutMs }); } catch { /* seguimos igual */ }
  // ¿Nos redirigió a login/challenge? → sesión caída.
  const url = page.url();
  if (/\/accounts\/login|\/challenge/i.test(url)) return { outcome: "throttled" };
  await sleep(600 + Math.random() * 900);

  // 3) Traer el reel crudo desde el contexto de la página (sus cookies/headers).
  //    reels_media devuelve items en el shape que mapReelItem del ingest espera
  //    (image_versions2, video_versions, caption, taken_at, pk, story_link_stickers).
  try {
    const res = await page.evaluate(async (id) => {
      const r = await fetch(`https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${id}`,
        { headers: { "x-ig-app-id": "936619743392459" }, credentials: "include" });
      const status = r.status;
      let body = null; try { body = await r.json(); } catch { /* */ }
      return { status, body };
    }, uid);
    if (res.status === 401 || res.status === 429 || res.status === 403) return { outcome: "throttled" };
    if (res.status !== 200 || !res.body) return { outcome: "throttled" };
    // reels_media: { reels_media: [ { items: [...] } ] }  o  { reels: { <id>: { items } } }
    const rm = res.body.reels_media?.[0] ?? res.body.reels?.[uid] ?? null;
    const items = Array.isArray(rm?.items) ? rm.items : [];
    if (items.length === 0) return { outcome: "empty", igUserId: uid };
    return { outcome: "items", reelItems: items, igUserId: uid };
  } catch {
    return { outcome: "throttled" };
  }
}

// ── Postear al ingest (mismo endpoint/shape que la extensión) ─────────────
async function postToIngest(creators) {
  if (!creators.length) return { ok: true, note: "nada que postear" };
  const r = await fetch(`${MAVEN_URL}/functions/v1/promolog-ingest-stories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-ext-token": EXT_TOKEN },
    body: JSON.stringify({ creators }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`ingest ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

// ── Correr una cuenta (slot) ──────────────────────────────────────────────
async function runAccount(acct) {
  const cooldowns = readCooldowns();
  if (cooldowns[acct.slot] && Date.now() < cooldowns[acct.slot]) {
    const mins = Math.round((cooldowns[acct.slot] - Date.now()) / 60000);
    console.log(`⏸️  slot ${acct.slot}: en cooldown ${mins} min más (IG limitó la sesión antes). Se saltea.`);
    return { slot: acct.slot, skipped: "cooldown" };
  }

  const targets = await fetchTargets(acct.slot);
  console.log(`\n▶️  slot ${acct.slot}: ${targets.length} targets (su mitad).`);
  const browser = await chromium.launch({ headless: !HEADFUL });
  const context = await browser.newContext({
    storageState: acct.sessionFile,
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  const out = [];      // payload para el ingest
  let sawStories = false, emptyStreak = 0, softBlocked = false, done = 0;
  for (const t of targets) {
    if (done >= PACING.maxPerRun) { console.log(`   (tope maxPerRun=${PACING.maxPerRun} alcanzado)`); break; }
    const handle = norm(t.handle);
    const base = { creator_id: t.creator_id, handle };
    const r = await readStories(page, handle, t.ig_user_id);

    if (r.outcome === "items") {
      out.push({ ...base, reel_items: r.reelItems, is_private: false, following: true, ig_user_id: r.igUserId });
      sawStories = true; emptyStreak = 0;
      console.log(`   ✅ ${handle}: ${r.reelItems.length} historias`);
    } else if (r.outcome === "empty") {
      // Solo cuenta como "No" REAL si la sesión venía leyendo bien. Si nunca leímos
      // nada aún, un vacío es sospechoso → pending (no afirmamos "No").
      if (sawStories) {
        out.push({ ...base, reel_items: [], is_private: false, following: true, ...(r.igUserId ? { ig_user_id: r.igUserId } : {}) });
        console.log(`   ·  ${handle}: sin historias hoy (No)`);
      } else {
        out.push({ ...base, error: "unconfirmed_empty" });
        console.log(`   ?  ${handle}: vacío sin lectura previa → pending`);
      }
      emptyStreak++;
    } else { // throttled | no_ig_id
      out.push({ ...base, error: r.outcome });
      if (sawStories) emptyStreak++;
      console.log(`   ⚠️  ${handle}: ${r.outcome} → pending`);
    }
    done++;

    // Soft-block: racha de vacíos/bloqueos DESPUÉS de haber leído bien → IG está
    // limitando. Cortamos: el resto va pending y la cuenta entra en cooldown.
    if (sawStories && emptyStreak >= SOFTBLOCK.streakAbort) {
      softBlocked = true;
      console.log(`   ⛔ slot ${acct.slot}: racha de ${emptyStreak} vacíos/bloqueos → IG limitó la sesión. Corto y dejo en cooldown ${SOFTBLOCK.cooldownHours}h.`);
      break;
    }
    await sleep(jitter());
    if (done % PACING.batchPauseEvery === 0) { console.log(`   … pausa de lote (${Math.round(PACING.batchPauseMs / 1000)}s)`); await sleep(PACING.batchPauseMs); }
  }

  await browser.close();
  if (softBlocked) writeCooldown(acct.slot, Date.now() + SOFTBLOCK.cooldownHours * 3600_000);

  const ingest = await postToIngest(out).catch((e) => ({ ok: false, error: e.message }));
  console.log(`◀️  slot ${acct.slot}: leídas ${done}, posteadas ${out.length}. Ingest: ${JSON.stringify(ingest).slice(0, 160)}`);
  return { slot: acct.slot, leidas: done, softBlocked, ingest };
}

// ── Main ──────────────────────────────────────────────────────────────────
(async () => {
  console.log(`Promolog agent — ${new Date().toISOString()} — ${ACCOUNTS.length} cuenta(s): ${ACCOUNTS.map((a) => a.slot).join(", ")}`);
  for (const acct of ACCOUNTS) {
    try { await runAccount(acct); }
    catch (e) { console.error(`slot ${acct.slot} falló:`, e.message); }
    // pausa entre cuentas para no encadenar dos sesiones pegadas
    await sleep(5000 + Math.random() * 5000);
  }
  console.log("\nListo.");
  process.exit(0);
})();

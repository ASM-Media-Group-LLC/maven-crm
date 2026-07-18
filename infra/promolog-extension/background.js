// Maven Promolog Scanner — service worker.
// Flujo: pide la lista de creadoras a Maven → por cada una, DESDE ESTE NAVEGADOR
// (tu IP + tu sesión de IG) resuelve el user-id y lee sus historias → manda los
// resultados a Maven en lotes (Maven analiza con IA + guarda). Nada de scraping sale
// del server → no hay flag de datacenter.
//
// v1.2.0 reemplaza la lectura "dentro de una pestaña de IG" (v1.1.0, chrome.scripting):
// el service worker SÍ manda las cookies de sesión contra www.instagram.com
// (credentials:"include" + host_permissions) — verificado en vivo 2026-07-17 con
// ~110 lecturas y 0 errores. Lo que estaba roto era el HOST: i.instagram.com devuelve
// {status:"fail"} con HTTP 200 para lecturas de navegador. De paso: menos permisos
// (fuera scripting/tabs) y sin pestaña fantasma de IG.
//
// Anti-soft-block (portado de v1.1.0, NO se debe perder): IG limita la sesión si lee
// muchas historias muy seguido. El bloqueo tiene DOS caras y las cubrimos las dos:
//  1) EXPLÍCITA: HTTP 401/403/429 o soft-fail (HTTP 200 + json.status:"fail") → igGet
//     lo marca error → el ingest lo guarda "pending/sin datos" (NO "no promocionó").
//  2) SILENCIOSA: HTTP 200 + status:"ok" + reel VACÍO en racha (indistinguible per-
//     request de "no tiene historias"). Se detecta por RACHA: tras leer bien, N vacías
//     seguidas = bloqueo → se marcan throttled (pending) y tras 3 se ABORTA el scan
//     (dejar de martillar la sesión evita escalar a checkpoint/challenge de la cuenta).

const IG_APP_ID = "936619743392459";
const CHUNK = 6;          // creadoras por POST a Maven (acota el tiempo de análisis por request)
// Pacing lento a propósito: IG limita la sesión si lee historias muy seguido. ~1.5–3.5s
// por creadora + una pausa entre lotes reparte el scan en varios minutos y demora/evita
// el soft-block (mismos números que v1.1.0; NO acelerar sin medir el bloqueo).
const MIN_DELAY = 1500, MAX_DELAY = 3500;
const CHUNK_PAUSE = 2500;
// Racha de lecturas vacías (tras haber leído historias OK) que dispara la sospecha /
// el corte de soft-block silencioso.
const EMPTY_SUSPECT = 2, EMPTY_ABORT = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => MIN_DELAY + Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY));

async function cfg() {
  const { mavenUrl, extToken } = await chrome.storage.sync.get(["mavenUrl", "extToken"]);
  return { mavenUrl: (mavenUrl || "https://lsagslbkliprespbyhts.supabase.co").replace(/\/+$/, ""), extToken: extToken || "" };
}
async function setStatus(s) { await chrome.storage.local.set({ status: s, statusAt: Date.now() }); }

// GET a la API de IG con la sesión del navegador (cookies auto por host_permissions).
// Usamos www.instagram.com y NO i.instagram.com: el host móvil `i.` viene devolviendo
// {status:"fail","Se ha producido un error"} con HTTP 200 para lecturas desde el
// navegador, mientras que www responde OK con los MISMOS headers/cookies (verificado
// 2026-07-17 en la sesión real). softFail = HTTP 200 pero json.status !== "ok" → lo
// tratamos como error (bloqueo explícito), NO como "sin historias".
async function igGet(path) {
  try {
    const r = await fetch(`https://www.instagram.com/api/v1/${path}`, {
      headers: { "x-ig-app-id": IG_APP_ID }, credentials: "include",
    });
    const j = await r.json().catch(() => ({}));
    const softFail = typeof j?.status === "string" && j.status !== "ok";
    return { ok: r.ok && !softFail, status: r.status, softFail, json: j };
  } catch (e) { return { ok: false, status: 0, softFail: false, json: { message: String(e) } }; }
}

// Resuelve el user-id numérico desde el handle (web_profile_info, sesión del navegador).
// Devuelve { id, blocked }: blocked=true = la sesión rechazó la lectura (soft-fail /
// 401 / 429) → re-intentable (throttled); blocked=false sin id = handle roto (no_ig_id).
// Así no confundimos "sesión limitada" con "handle renombrado" en la taxonomía de error.
async function resolveId(handle) {
  try {
    const r = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`, {
      headers: { "x-ig-app-id": IG_APP_ID }, credentials: "include",
    });
    const j = await r.json().catch(() => ({}));
    const softFail = typeof j?.status === "string" && j.status !== "ok";
    if (softFail || r.status === 401 || r.status === 403 || r.status === 429) return { id: null, blocked: true };
    if (!r.ok) return { id: null, blocked: false }; // 404 u otro → handle roto, no bloqueo
    return { id: j?.data?.user?.id ?? null, blocked: false };
  } catch { return { id: null, blocked: true }; }
}

// Recorta cada item de historia a lo que Maven necesita (paths que lee mapReelItem).
function trimItem(it) {
  const ctaLink = it?.story_cta?.[0]?.links?.[0]?.webUri ?? null;
  return {
    media_type: it?.media_type,
    image_versions2: { candidates: [{ url: it?.image_versions2?.candidates?.[0]?.url ?? null }] },
    video_versions: it?.video_versions?.[0]?.url ? [{ url: it.video_versions[0].url }] : [],
    caption: it?.caption?.text ? { text: it.caption.text } : null,
    story_link_stickers: it?.story_link_stickers?.[0]?.story_link?.url
      ? [{ story_link: { url: it.story_link_stickers[0].story_link.url } }] : undefined,
    // mapReelItem del backend lee story_cta como fallback del sticker de link (algunas
    // stories exponen el link SOLO acá) → sin esto una promo con link real llegaba sin
    // link y salía "no promocionó". Reenviarlo cierra ese falso negativo.
    story_cta: ctaLink ? [{ links: [{ webUri: ctaLink }] }] : undefined,
    taken_at: it?.taken_at,
    // pk = id ESTABLE de la historia en IG → el backend deduplica re-runs por story_pk
    // (no re-analiza con Gemini, no duplica fila/imagen) y conserva el "Sí" del día.
    pk: it?.pk != null ? String(it.pk) : (it?.id != null ? String(it.id) : null),
  };
}

// Lee UNA creadora. Devuelve reel_items (posiblemente []), o error si NO se pudo leer.
// `error` = lectura fallida → el ingest la guarda pending (nunca "No"). Un reel vacío
// SIN error puede ser "no tiene historias" O soft-block silencioso; eso lo desambigua
// runScan por racha (no acá, porque una sola lectura vacía es indistinguible).
async function scanOne(t) {
  let id = t.ig_user_id;
  if (!id) {
    const res = await resolveId(t.handle);
    id = res.id;
    if (!id) return { creator_id: t.creator_id, handle: t.handle, error: res.blocked ? "throttled" : "no_ig_id" };
  }

  const st = await igGet(`feed/user/${id}/story/`);
  if (!st.ok) {
    // soft-fail (200 pero status!="ok") o 401/403/429 = sesión limitada → throttled
    // (re-intentable); otros HTTP → etiqueta cruda para diagnóstico. Ambos → pending.
    const blocked = st.softFail || [401, 403, 429].includes(st.status);
    return { creator_id: t.creator_id, handle: t.handle, error: blocked ? "throttled" : `http_${st.status}` };
  }
  const items = st.json?.reel?.items ?? [];

  let is_private = null, following = null;
  if (items.length === 0) {
    const fr = await igGet(`friendships/show/${id}/`);
    is_private = fr.json?.is_private ?? null;
    following = fr.json?.following ?? null;
  }
  return {
    creator_id: t.creator_id, handle: t.handle,
    reel_items: items.slice(0, 15).map(trimItem),
    is_private, following,
  };
}

async function runScan(trigger = "manual") {
  const { mavenUrl, extToken } = await cfg();
  if (!extToken) { await setStatus("⚠ Falta el token — configuralo en Opciones."); return; }
  // Keepalive MV3: sin esto Chrome puede matar el service worker a los ~30s de "idle" a
  // mitad del loop (scans de varios minutos quedaban congelados en "Escaneando… N/56").
  // Un chrome.* barato cada 20s resetea el timer de idle. clearInterval SIEMPRE (finally).
  const keepAlive = setInterval(() => { try { chrome.runtime.getPlatformInfo(() => {}); } catch (_) {} }, 20000);
  await setStatus(`Escaneando… (${trigger})`);
  try {
    const post = (creators) => fetch(`${mavenUrl}/functions/v1/promolog-ingest-stories`, {
      method: "POST", headers: { "x-ext-token": extToken, "Content-Type": "application/json" },
      body: JSON.stringify({ creators }),
    });
    const tally = async (res, acc) => {
      if (res && res.ok) { const j = await res.json().catch(() => ({})); acc.si += j.si || 0; acc.no += j.no || 0; acc.pending += j.pending || 0; }
    };

    const tRes = await fetch(`${mavenUrl}/functions/v1/promolog-scan-targets`, { headers: { "x-ext-token": extToken } });
    if (!tRes.ok) { await setStatus(`⚠ targets HTTP ${tRes.status} (¿token/URL?)`); return; }
    const { targets = [] } = await tRes.json();
    if (!targets.length) { await setStatus("Sin creadoras que escanear."); return; }

    const acc = { si: 0, no: 0, pending: 0 };
    let done = 0;
    // Circuit-breaker de soft-block silencioso: tras leer historias OK alguna vez
    // (gotStoriesEver), una racha de lecturas vacías sin error = sesión limitada.
    let gotStoriesEver = false, emptyStreak = 0;
    for (let i = 0; i < targets.length; i += CHUNK) {
      const chunk = targets.slice(i, i + CHUNK);
      const out = [];
      for (const t of chunk) {
        const r = await scanOne(t);
        const hasStories = Array.isArray(r.reel_items) && r.reel_items.length > 0;
        if (hasStories) { gotStoriesEver = true; emptyStreak = 0; }
        else if (!r.error && gotStoriesEver) emptyStreak += 1;
        // Ya sospechamos bloqueo (racha ≥ EMPTY_SUSPECT) → una lectura vacía SIN error
        // NO es "no tiene historias", es la sesión limitada → throttled (pending), no "No".
        out.push(gotStoriesEver && emptyStreak >= EMPTY_SUSPECT && !hasStories && !r.error
          ? { creator_id: r.creator_id, handle: r.handle, error: "throttled" }
          : r);
        await sleep(jitter());
      }
      await tally(await post(out), acc);
      done += chunk.length;
      await setStatus(`Escaneando… ${done}/${targets.length} · ✅${acc.si} ❌${acc.no} ⏳${acc.pending}`);

      // Corte duro: EMPTY_ABORT vacías seguidas tras haber leído bien = bloqueo casi
      // seguro. Dejamos de martillar la sesión (evita escalar a checkpoint/challenge de
      // la cuenta), marcamos el RESTO como throttled (pending, se retoma en otro scan) y
      // avisamos, en vez de escribir decenas de "No promocionó" falsos.
      if (gotStoriesEver && emptyStreak >= EMPTY_ABORT) {
        const rest = targets.slice(i + CHUNK).map((t) => ({ creator_id: t.creator_id, handle: t.handle, error: "throttled" }));
        if (rest.length) { await tally(await post(rest), acc); done += rest.length; }
        await setStatus(`⚠ IG limitó la sesión — frené para no marcar falsos "No". ${done}/${targets.length} · ✅${acc.si} ❌${acc.no} ⏳${acc.pending}. Reintentá en un rato.`);
        return;
      }
      if (i + CHUNK < targets.length) await sleep(CHUNK_PAUSE);
    }
    await setStatus(`✔ Listo ${new Date().toLocaleString()} · ${done} creadoras · ✅${acc.si} ❌${acc.no} ⏳${acc.pending}`);
  } catch (e) {
    await setStatus(`⚠ Error: ${String(e).slice(0, 120)}`);
  } finally {
    clearInterval(keepAlive);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "scan-now") { runScan("manual").then(() => sendResponse({ ok: true })); return true; }
});

// Cron interno diario (solo dispara si Chrome está abierto; si se saltó, corre al abrir).
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("daily-scan", { periodInMinutes: 24 * 60, delayInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "daily-scan") runScan("cron"); });

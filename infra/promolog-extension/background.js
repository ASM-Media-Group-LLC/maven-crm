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
// Anti-soft-block (v1.2.1): IG limita la sesión si lee muchas historias muy seguido.
// El bloqueo tiene DOS caras y las cubrimos las dos:
//  1) EXPLÍCITA: HTTP 401/403/429 o soft-fail (HTTP 200 + json.status:"fail") → igGet
//     lo marca error → el ingest lo guarda "pending/sin datos" (NO "no promocionó");
//     una racha de estos (BLOCKED_ABORT) corta el scan.
//  2) SILENCIOSA: HTTP 200 + status:"ok" + reel VACÍO (indistinguible per-request de
//     "no tiene historias"). Los vacíos NO EXPLICADOS (públicas; una privada sin
//     follow viene vacía SIEMPRE y no cuenta) se RETIENEN sin postear; la racha se
//     resuelve leyendo historias de otra (→ eran "No" reales) o VERIFICANDO contra la
//     última creadora que sí tuvo historias (→ bloqueo confirmado → corte, todo a
//     pending). Invariante: un soft-block no escribe NI UN "No promocionó" falso.

const IG_APP_ID = "936619743392459";
const CHUNK = 6;          // creadoras por POST a Maven (acota el tiempo de análisis por request)
// Pacing lento a propósito: IG limita la sesión si lee historias muy seguido. ~1.5–3.5s
// por creadora + una pausa entre lotes reparte el scan en varios minutos y demora/evita
// el soft-block (mismos números que v1.1.0; NO acelerar sin medir el bloqueo).
const MIN_DELAY = 1500, MAX_DELAY = 3500;
const CHUNK_PAUSE = 2500;
// ── Detección de soft-block silencioso ──────────────────────────────────────
// "Vacío NO explicado" = pública (o estado desconocido) que vino vacía. Una privada
// que NO seguimos viene vacía SIEMPRE (bloqueada o no) y no dice nada de la sesión →
// no cuenta (v1.2.0 la contaba → una cuenta scanner nueva, que no sigue a las
// privadas, disparaba el corte "IG limitó la sesión" en falso a los 3 vacíos;
// agravado porque scan-targets sirve primero las pendientes = muchas privadas).
//
// INVARIANTE: un soft-block silencioso no puede escribir NI UN "No promocionó" falso.
// Por eso los vacíos no explicados de la racha abierta se RETIENEN sin postear:
//   - la racha se rompe con una lectura CON historias → eran vacíos reales → pasan como "No";
//   - la racha llega a EMPTY_VERIFY → VERIFICAMOS re-leyendo a la última creadora que
//     SÍ tuvo historias hace minutos: ¿siguen visibles? sesión sana (vacíos genuinos,
//     pasan como "No") / ¿vacía o falla? bloqueo confirmado → corte, todo a pending.
// ⚠️ Los vacíos NO son independientes (la cola pending-first concentra públicas
// inactivas) — un umbral probabilístico solo se cortaría en falso; la verificación
// hace el corte casi determinístico.
// ⚠️ Supuesto de la verificación (a validar en un bloqueo real): re-leer un reel visto
// hace minutos falla igual que uno nuevo cuando la sesión está limitada (el límite es
// por sesión, no por target). Si IG sirviera cacheado lo recién leído, la verificación
// pasaría en falso. El espejo (historias del prover expiradas → verificación falla en
// sano) degrada a pending — dirección segura.
// Garantía REAL del invariante: ningún vacío crudo se postea sin una lectura CON
// historias POSTERIOR a él; un bloqueo que empieza Y termina dentro de una misma
// ventana retenida puede filtrar ≤EMPTY_VERIFY "No" por episodio (irresoluble a
// posteriori; aceptado y documentado).
const EMPTY_VERIFY = 6;      // racha (con sesión ya probada esta corrida) → verificar-antes-de-abortar
const EMPTY_ABORT_COLD = 10; // racha sin sesión probada esta corrida → verificar contra el prover persistido, o frenar
// Racha de bloqueos EXPLÍCITOS (softFail / 401 / 429) sin ninguna lectura CON
// historias en el medio: sesión limitada de entrada (cuota quemada) → frenar. v1.2.0
// no tenía corte para esto y martillaba las 55 igual. (http_0/red NO cuenta acá.)
const BLOCKED_ABORT = 8;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => MIN_DELAY + Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY));

async function cfg() {
  const { mavenUrl, extToken } = await chrome.storage.sync.get(["mavenUrl", "extToken"]);
  return { mavenUrl: (mavenUrl || "https://lsagslbkliprespbyhts.supabase.co").replace(/\/+$/, ""), extToken: extToken || "" };
}
async function setStatus(s) { await chrome.storage.local.set({ status: s, statusAt: Date.now() }); }

// fetch a Maven con reintentos: un blip de red ("TypeError: Failed to fetch") NO debe
// matar una corrida entera (pasó 2026-07-22: un POST de flush falló transitorio y se
// perdió el run completo con el scan por la mitad). Solo reintenta el THROW de red —
// un HTTP 4xx/5xx es una response normal y la decide el caller. Backoff ~2s/4s.
// Si igual muere tras N intentos, el error dice QUÉ endpoint falló (diagnosticable
// desde el popup, sin abrir el service worker).
async function fetchMaven(url, init, tries = 3) {
  for (let i = 1; ; i++) {
    try { return await fetch(url, init); }
    catch (e) {
      if (i >= tries) throw new Error(`${String(e).slice(0, 60)} → ${url.split("/functions/v1/")[1] || url} (${tries} intentos)`);
      await sleep(i * 2000 + Math.floor(Math.random() * 500));
    }
  }
}

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
  } catch { return { id: null, blocked: false, net: true }; } // red caída ≠ bloqueo de IG
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
    if (!id) return { creator_id: t.creator_id, handle: t.handle, error: res.net ? "http_0" : (res.blocked ? "throttled" : "no_ig_id") };
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

// Mutex simple: dos scans a la vez (doble click / alarm + manual) duplican el ritmo de
// lecturas y rompen el pacing anti-bloqueo. Estado de módulo: si el SW muere, se
// resetea solo (el lock nunca queda pegado).
let scanRunning = false;

async function runScan(trigger = "manual") {
  if (scanRunning) { await setStatus("⏳ Ya hay un scan corriendo — esperá a que termine."); return; }
  scanRunning = true;
  let keepAlive = null;
  try {
  const { mavenUrl, extToken } = await cfg();
  if (!extToken) { await setStatus("⚠ Falta el token — configuralo en Opciones."); return; }
  // Keepalive MV3: sin esto Chrome puede matar el service worker a los ~30s de "idle" a
  // mitad del loop (scans de varios minutos quedaban congelados en "Escaneando… N/56").
  // Un chrome.* barato cada 20s resetea el timer de idle. clearInterval SIEMPRE (finally).
  keepAlive = setInterval(() => { try { chrome.runtime.getPlatformInfo(() => {}); } catch (_) {} }, 20000);
  await setStatus(`Escaneando… (${trigger})`);

    const post = (creators) => fetchMaven(`${mavenUrl}/functions/v1/promolog-ingest-stories`, {
      method: "POST", headers: { "x-ext-token": extToken, "Content-Type": "application/json" },
      body: JSON.stringify({ creators }),
    });
    const tally = async (res, acc) => {
      if (res && res.ok) { const j = await res.json().catch(() => ({})); acc.si += j.si || 0; acc.no += j.no || 0; acc.pending += j.pending || 0; }
    };

    const tRes = await fetchMaven(`${mavenUrl}/functions/v1/promolog-scan-targets`, { headers: { "x-ext-token": extToken } });
    if (!tRes.ok) { await setStatus(`⚠ targets HTTP ${tRes.status} (¿token/URL?)`); return; }
    const { targets = [] } = await tRes.json();
    if (!targets.length) { await setStatus("Sin creadoras que escanear."); return; }

    const acc = { si: 0, no: 0, pending: 0 };
    let done = 0;
    // Breakers de sesión limitada, DOS caras (ver constantes arriba):
    //  - emptyStreak + held: soft-block SILENCIOSO. Los vacíos no explicados de la
    //    racha abierta se RETIENEN (held) sin postear hasta saber si eran bloqueo
    //    (→ throttled/pending) o casualidad (→ "No" reales).
    //  - blockedStreak: bloqueo EXPLÍCITO (softFail/401/429 encadenados). Solo una
    //    lectura CON historias lo resetea — un vacío silencioso NO prueba sesión sana
    //    (un bloqueo mixto explícito+silencioso burlaba los dos breakers).
    let gotStoriesEver = false, emptyStreak = 0, blockedStreak = 0;
    let held = [];   // vacíos no explicados de la racha abierta (sin postear)
    let out = [];    // resultados listos para postear
    let abort = null; // null | "explicita" | "confirmada" | "fria"
    const throttledOf = (x) => ({ creator_id: x.creator_id, handle: x.handle, error: "throttled" });
    const hasReel = (x) => Array.isArray(x?.reel_items) && x.reel_items.length > 0;
    const flush = async () => { if (out.length) { await tally(await post(out), acc); out = []; } };

    // Prover: la última creadora vista CON historias. Se persiste ENTRE corridas para
    // que una racha fría (desde la lectura #1) también pueda VERIFICAR en vez de
    // abortar a ciegas (sin esto, un corte frío dejaba todo pending en el mismo orden
    // → el reintento repetía idéntico → livelock del scanner con sesión sana).
    let lastStoryTarget = (await chrome.storage.local.get("lastStoryBearer")).lastStoryBearer || null;

    for (const t of targets) {
      const r = await scanOne(t);
      done += 1;
      const hasStories = hasReel(r);
      // Vacío EXPLICADO: privada que NO seguimos → reel vacío SIEMPRE (bloqueada o no).
      // No dice nada de la sesión → no suma racha; el ingest la marca follow_pending.
      const explainedEmpty = !hasStories && !r.error && r.is_private === true && r.following !== true;

      if (r.error === "throttled") {
        blockedStreak += 1;
        // Evidencia EXPLÍCITA de sesión limitada con racha abierta → racha contaminada:
        // los retenidos van a pending (no pueden pasar como "No" con un bloqueo a la vista).
        if (held.length) { out.push(...held.map(throttledOf)); held = []; emptyStreak = 0; }
      } else if (hasStories) blockedStreak = 0;

      if (hasStories) {
        gotStoriesEver = true; emptyStreak = 0;
        lastStoryTarget = t;
        chrome.storage.local.set({ lastStoryBearer: t }).catch(() => {}); // prover entre corridas
        out.push(...held, r); held = []; // racha rota con sesión sana → eran vacíos reales ("No")
      } else if (r.error || explainedEmpty) {
        out.push(r);
      } else {
        emptyStreak += 1;
        held.push(r); // retener: todavía no sabemos si es "sin historias" o bloqueo
      }

      if (blockedStreak >= BLOCKED_ABORT) {
        abort = "explicita";
      } else if (emptyStreak >= (gotStoriesEver ? EMPTY_VERIFY : EMPTY_ABORT_COLD)) {
        if (lastStoryTarget) {
          // Verificar antes de abortar: re-leemos a la última creadora QUE TUVO
          // historias. ¿Siguen visibles? → sesión sana, la racha era casualidad (los
          // retenidos pasan como "No" reales y seguimos). ¿Vacía o falla? → bloqueo.
          // (Lectura local: NO se postea → no duplica nada en Maven.)
          await sleep(jitter());
          const v = await scanOne(lastStoryTarget);
          if (hasReel(v)) {
            gotStoriesEver = true; emptyStreak = 0; blockedStreak = 0;
            out.push(...held); held = [];
          } else {
            abort = gotStoriesEver ? "confirmada" : "fria";
          }
        } else {
          abort = "fria"; // nunca vimos historias (ni en corridas previas): no hay a quién re-leer
        }
      }
      if (abort) break;

      if (out.length >= CHUNK) await flush();
      if (done % CHUNK === 0) {
        await setStatus(`Escaneando… ${done}/${targets.length} · ✅${acc.si} ❌${acc.no} ⏳${acc.pending}`);
        if (done < targets.length) await sleep(CHUNK_PAUSE);
      }
      await sleep(jitter());
    }

    if (abort) {
      // Corte: seguir martillando una sesión limitada escala a checkpoint/challenge.
      // Lo retenido va como throttled (pending) — NUNCA "No" falsos.
      const scanned = done;
      out.push(...held.map(throttledOf)); held = [];
      if (abort === "fria") {
        // Corte frío = NO verificado (puede ser sesión sana con racha de inactivas).
        // La cola NO se postea: sin entry siguen rank 0 y el reintento arranca por
        // targets frescos (rompe el livelock) — y el mensaje no culpa a IG en falso.
        await flush();
        await setStatus(`⚠ No pude confirmar la sesión (${EMPTY_ABORT_COLD} vacíos seguidos sin ver historias) — frené por precaución en ${scanned}/${targets.length} · ✅${acc.si} ❌${acc.no} ⏳${acc.pending}. Lo no escaneado queda para el próximo intento.`);
      } else {
        out.push(...targets.slice(done).map(throttledOf));
        await flush(); // tally ya cuenta la cola en acc.pending
        await setStatus(`⚠ IG limitó la sesión — frené para no marcar falsos "No" en ${scanned}/${targets.length} · ✅${acc.si} ❌${acc.no} ⏳${acc.pending}. Reintentá en un rato.`);
      }
      return;
    }

    // Racha abierta al terminar: verificamos UNA vez para decidir la cola retenida —
    // sesión sana → "No" reales; sin prueba de sesión (o falla) → pending (nunca "No" a ciegas).
    let tailNote = "";
    if (held.length) {
      const heldCount = held.length;
      await sleep(jitter());
      const v = lastStoryTarget ? await scanOne(lastStoryTarget) : null;
      if (hasReel(v)) out.push(...held);
      else { out.push(...held.map(throttledOf)); tailNote = ` (⏳${heldCount} sin confirmar — la verificación final vino vacía; esperá antes de reintentar)`; }
      held = [];
    }
    await flush();
    await setStatus(`✔ Listo ${new Date().toLocaleString()} · ${done} creadoras · ✅${acc.si} ❌${acc.no} ⏳${acc.pending}${tailNote}`);
  } catch (e) {
    await setStatus(`⚠ Error: ${String(e).slice(0, 120)}`);
  } finally {
    if (keepAlive) clearInterval(keepAlive);
    scanRunning = false;
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

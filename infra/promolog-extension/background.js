// Maven Promolog Scanner — service worker.
// Lee las historias DENTRO de una pestaña de instagram.com (mismo origen → la cookie de
// sesión SÍ viaja; desde el service worker iba anónimo y devolvía 0 historias). Junta
// resultados por lotes y los manda a Maven, que analiza (IA + evidencia) y guarda.

const CHUNK = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cfg() {
  const { mavenUrl, extToken } = await chrome.storage.sync.get(["mavenUrl", "extToken"]);
  return { mavenUrl: (mavenUrl || "https://lsagslbkliprespbyhts.supabase.co").replace(/\/+$/, ""), extToken: extToken || "" };
}
async function setStatus(s) { await chrome.storage.local.set({ status: s, statusAt: Date.now() }); }

// Asegura una pestaña de instagram.com donde correr los fetch (mismo origen).
async function ensureIgTab() {
  const tabs = await chrome.tabs.query({ url: "https://www.instagram.com/*" });
  if (tabs.length) return tabs[0].id;
  const tab = await chrome.tabs.create({ url: "https://www.instagram.com/", active: false });
  await new Promise((res) => {
    const done = (id, info) => { if (id === tab.id && info.status === "complete") { chrome.tabs.onUpdated.removeListener(done); res(); } };
    chrome.tabs.onUpdated.addListener(done);
    setTimeout(res, 15000);
  });
  return tab.id;
}

// Corre EN la pestaña de IG (mismo origen). Por cada creadora: resuelve id + lee historia
// (+ friendship si vacío). Devuelve los items recortados a lo que Maven necesita.
async function scanInPage(targets) {
  const APP = "936619743392459";
  const rest = (ms) => new Promise((r) => setTimeout(r, ms));
  async function j(url) {
    try {
      const r = await fetch(url, { headers: { "x-ig-app-id": APP }, credentials: "include" });
      return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) };
    } catch (e) { return { ok: false, status: 0, json: { message: String(e) } }; }
  }
  const trim = (it) => ({
    media_type: it?.media_type,
    image_versions2: { candidates: [{ url: it?.image_versions2?.candidates?.[0]?.url ?? null }] },
    video_versions: it?.video_versions?.[0]?.url ? [{ url: it.video_versions[0].url }] : [],
    caption: it?.caption?.text ? { text: it.caption.text } : null,
    story_link_stickers: it?.story_link_stickers?.[0]?.story_link?.url ? [{ story_link: { url: it.story_link_stickers[0].story_link.url } }] : undefined,
    taken_at: it?.taken_at,
    // pk = id ESTABLE de la historia en IG → el backend deduplica re-runs (no duplica
    // fila ni imagen) y conserva el "Sí" ya detectado ese día.
    pk: it?.pk != null ? String(it.pk) : (it?.id != null ? String(it.id) : null),
  });
  const out = [];
  for (const t of targets) {
    let id = t.ig_user_id;
    if (!id) {
      const p = await j(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(t.handle)}`);
      id = p.json?.data?.user?.id ?? null;
    }
    if (!id) { out.push({ creator_id: t.creator_id, handle: t.handle, error: "no_ig_id" }); continue; }
    const st = await j(`/api/v1/feed/user/${id}/story/`);
    if (!st.ok) { out.push({ creator_id: t.creator_id, handle: t.handle, error: `http_${st.status}` }); continue; }
    const items = st.json?.reel?.items ?? [];
    let is_private = null, following = null;
    if (items.length === 0) {
      const fr = await j(`/api/v1/friendships/show/${id}/`);
      is_private = fr.json?.is_private ?? null; following = fr.json?.following ?? null;
    }
    out.push({ creator_id: t.creator_id, handle: t.handle, reel_items: items.slice(0, 15).map(trim), is_private, following });
    // Pacing lento: IG limita la sesión (soft-block) si lee muchas historias muy seguido.
    // 1.5–3.5s por lectura reparte el scan en varios minutos y demora/evita el bloqueo.
    await rest(1500 + Math.floor(Math.random() * 2000));
  }
  return out;
}

async function runScan(trigger = "manual") {
  const { mavenUrl, extToken } = await cfg();
  if (!extToken) { await setStatus("⚠ Falta el token — configuralo en Opciones."); return; }
  // Keepalive MV3: sin esto Chrome mata el service worker a los ~30s de "idle" a mitad
  // del loop (el scan dura ~3 min) y el scan queda congelado en "Escaneando… N/56". Un
  // chrome.* barato cada 20s resetea el timer de idle. clearInterval SIEMPRE (finally).
  const keepAlive = setInterval(() => { try { chrome.runtime.getPlatformInfo(() => {}); } catch (_) {} }, 20000);
  await setStatus(`Preparando… (${trigger})`);
  try {
    const igTab = await ensureIgTab();
    const tRes = await fetch(`${mavenUrl}/functions/v1/promolog-scan-targets`, { headers: { "x-ext-token": extToken } });
    if (!tRes.ok) { await setStatus(`⚠ targets HTTP ${tRes.status} (¿token/URL?)`); return; }
    const { targets = [] } = await tRes.json();
    if (!targets.length) { await setStatus("Sin creadoras que escanear."); return; }

    const post = (creators) => fetch(`${mavenUrl}/functions/v1/promolog-ingest-stories`, {
      method: "POST", headers: { "x-ext-token": extToken, "Content-Type": "application/json" },
      body: JSON.stringify({ creators }),
    });

    let done = 0, si = 0, no = 0, pending = 0;
    // Detección de soft-block de IG: si tras leer bien empiezan a venir chunks TODO
    // vacíos, la sesión está limitada — una lectura vacía ahí NO es "no tiene historias",
    // es bloqueo. La marcamos read_failed (→ "No verificado", re-intentable), NUNCA "No".
    let gotStoriesEver = false, emptyStreak = 0;
    for (let i = 0; i < targets.length; i += CHUNK) {
      const chunk = targets.slice(i, i + CHUNK);
      let out = [];
      try {
        const r = await chrome.scripting.executeScript({ target: { tabId: igTab }, func: scanInPage, args: [chunk] });
        out = r?.[0]?.result || [];
      } catch (e) {
        await setStatus(`⚠ No pude leer en la pestaña de IG: ${String(e).slice(0, 80)}`); return;
      }
      const chunkStories = out.reduce((n, c) => n + ((c.reel_items && c.reel_items.length) || 0), 0);
      if (chunkStories > 0) { gotStoriesEver = true; emptyStreak = 0; }
      else if (gotStoriesEver) { emptyStreak += 1; }

      // Ya sospechamos bloqueo → las lecturas vacías de este chunk van como throttled
      // (read_failed), no como "No". Las que SÍ trajeron historias se respetan.
      const suspect = gotStoriesEver && emptyStreak >= 2;
      const payload = out.map((c) => (suspect && !(c.reel_items && c.reel_items.length) && !c.error)
        ? { creator_id: c.creator_id, handle: c.handle, error: "throttled" }
        : c);
      const res = await post(payload);
      if (res.ok) { const j = await res.json().catch(() => ({})); si += j.si || 0; no += j.no || 0; pending += j.pending || 0; }
      done += chunk.length;

      // 3 chunks vacíos seguidos tras haber leído bien = bloqueo casi seguro. Paramos de
      // martillar la sesión y marcamos el RESTO como read_failed (se retoma en otro scan),
      // en vez de escribir decenas de "No" falsos.
      if (gotStoriesEver && emptyStreak >= 3) {
        const rest = targets.slice(i + CHUNK).map((t) => ({ creator_id: t.creator_id, handle: t.handle, error: "throttled" }));
        if (rest.length) { await post(rest); pending += rest.length; done += rest.length; }
        await setStatus(`⚠ IG limitó la sesión — frené para no marcar falsos "No". ${done}/${targets.length} · ✅${si} ❌${no} ⏳${pending}. Reintentá en un rato.`);
        return;
      }
      await setStatus(`Escaneando… ${done}/${targets.length} · ✅${si} ❌${no} ⏳${pending}`);
      await sleep(2500);
    }
    await setStatus(`✔ Listo ${new Date().toLocaleString()} · ${done} creadoras · ✅${si} ❌${no} ⏳${pending}`);
  } catch (e) {
    await setStatus(`⚠ Error: ${String(e).slice(0, 120)}`);
  } finally {
    clearInterval(keepAlive);
  }
}

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg?.type === "scan-now") { runScan("manual").then(() => sendResponse({ ok: true })); return true; }
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("daily-scan", { periodInMinutes: 24 * 60, delayInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "daily-scan") runScan("cron"); });

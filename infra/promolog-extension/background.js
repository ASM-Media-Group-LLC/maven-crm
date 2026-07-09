// Maven Promolog Scanner — service worker.
// Flujo: pide la lista de creadoras a Maven → por cada una, DESDE ESTE NAVEGADOR
// (tu IP + tu sesión de IG) resuelve el user-id y lee sus historias → manda los
// resultados a Maven en lotes (Maven analiza con IA + guarda). Nada de scraping sale
// del server → no hay flag de datacenter.

const IG_APP_ID = "936619743392459";
const CHUNK = 6;          // creadoras por POST a Maven (acota el tiempo de análisis por request)
const MIN_DELAY = 700, MAX_DELAY = 1800;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => MIN_DELAY + Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY));

async function cfg() {
  const { mavenUrl, extToken } = await chrome.storage.sync.get(["mavenUrl", "extToken"]);
  return { mavenUrl: (mavenUrl || "https://lsagslbkliprespbyhts.supabase.co").replace(/\/+$/, ""), extToken: extToken || "" };
}
async function setStatus(s) { await chrome.storage.local.set({ status: s, statusAt: Date.now() }); }

// GET a la API móvil de IG con la sesión del navegador (cookies auto por host_permissions).
async function igGet(path) {
  try {
    const r = await fetch(`https://i.instagram.com/api/v1/${path}`, {
      headers: { "x-ig-app-id": IG_APP_ID }, credentials: "include",
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, json: j };
  } catch (e) { return { ok: false, status: 0, json: { message: String(e) } }; }
}

// Resuelve el user-id numérico desde el handle (web_profile_info, sesión del navegador).
async function resolveId(handle) {
  try {
    const r = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`, {
      headers: { "x-ig-app-id": IG_APP_ID }, credentials: "include",
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => ({}));
    return j?.data?.user?.id ?? null;
  } catch { return null; }
}

// Recorta cada item de historia a lo que Maven necesita (paths que lee mapReelItem).
function trimItem(it) {
  return {
    media_type: it?.media_type,
    image_versions2: { candidates: [{ url: it?.image_versions2?.candidates?.[0]?.url ?? null }] },
    video_versions: it?.video_versions?.[0]?.url ? [{ url: it.video_versions[0].url }] : [],
    caption: it?.caption?.text ? { text: it.caption.text } : null,
    story_link_stickers: it?.story_link_stickers?.[0]?.story_link?.url
      ? [{ story_link: { url: it.story_link_stickers[0].story_link.url } }] : undefined,
    taken_at: it?.taken_at,
  };
}

async function scanOne(t) {
  let id = t.ig_user_id;
  if (!id) id = await resolveId(t.handle);
  if (!id) return { creator_id: t.creator_id, handle: t.handle, error: "no_ig_id" };

  const st = await igGet(`feed/user/${id}/story/`);
  if (!st.ok) return { creator_id: t.creator_id, handle: t.handle, error: `http_${st.status}` };
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
  await setStatus(`Escaneando… (${trigger})`);
  try {
    const tRes = await fetch(`${mavenUrl}/functions/v1/promolog-scan-targets`, { headers: { "x-ext-token": extToken } });
    if (!tRes.ok) { await setStatus(`⚠ targets HTTP ${tRes.status} (¿token/URL?)`); return; }
    const { targets = [] } = await tRes.json();
    if (!targets.length) { await setStatus("Sin creadoras que escanear."); return; }

    let done = 0, si = 0, no = 0, pending = 0;
    for (let i = 0; i < targets.length; i += CHUNK) {
      const chunk = targets.slice(i, i + CHUNK);
      const out = [];
      for (const t of chunk) { out.push(await scanOne(t)); await sleep(jitter()); }
      const res = await fetch(`${mavenUrl}/functions/v1/promolog-ingest-stories`, {
        method: "POST", headers: { "x-ext-token": extToken, "Content-Type": "application/json" },
        body: JSON.stringify({ creators: out }),
      });
      if (res.ok) { const j = await res.json().catch(() => ({})); si += j.si || 0; no += j.no || 0; pending += j.pending || 0; }
      done += chunk.length;
      await setStatus(`Escaneando… ${done}/${targets.length} · ✅${si} ❌${no} ⏳${pending}`);
    }
    await setStatus(`✔ Listo ${new Date().toLocaleString()} · ${done} creadoras · ✅${si} ❌${no} ⏳${pending}`);
  } catch (e) {
    await setStatus(`⚠ Error: ${String(e).slice(0, 120)}`);
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

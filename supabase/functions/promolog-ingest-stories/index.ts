// promolog-ingest-stories — recibe historias de IG LEÍDAS POR LA EXTENSIÓN (desde el
// navegador del usuario: su IP residencial + su sesión real) y las corre por el MISMO
// análisis de IA + evidencia que el resto de Promolog (_shared/promolog-analyze). El
// scraping lo hace la extensión; este endpoint solo analiza + guarda. Así no sale
// ninguna lectura desde el server (evita el flag de datacenter).
//
// Auth: header `x-ext-token` == secret PROMOLOG_EXT_TOKEN (lo pega el usuario en la
// extensión; nunca en el repo). Deploy --no-verify-jwt.
//
// Body: { creators: [ {
//   creator_id, handle, reel_items?: [...],   // items crudos de feed/user/<id>/story
//   is_private?: bool, following?: bool,       // de friendships/show (para clasificar el "vacío")
//   error?: string                             // si la extensión no pudo leer
// } ] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  analyzeStoryItems, insertEmptyEntry, insertNoDataEntry, ofNickFromUrl, funnelHost,
  TENANT_ID, type StoryItem, type CreatorCtx, type RunCtx,
} from "../_shared/promolog-analyze.ts";
import { telegramHandleFromLink } from "../_shared/link-classifier.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ext-token",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// item crudo de IG (feed/user/<id>/story) → StoryItem normalizado (igual que story-read).
function mapReelItem(it: any): StoryItem {
  const isVideo = Number(it?.media_type) === 2;
  const candidates = it?.image_versions2?.candidates ?? [];
  return {
    type: isVideo ? "video" : "image",
    mediaUrl: candidates[0]?.url ?? null,
    videoUrl: isVideo ? (it?.video_versions?.[0]?.url ?? null) : null,
    caption: it?.caption?.text ?? null,
    linkUrl: it?.story_link_stickers?.[0]?.story_link?.url ?? it?.story_cta?.[0]?.links?.[0]?.webUri ?? null,
    timestamp: Number.isFinite(Number(it?.taken_at)) && Number(it?.taken_at) > 0 ? new Date(Number(it.taken_at) * 1000).toISOString() : null,
    pk: it?.pk != null ? String(it.pk) : (it?.id != null ? String(it.id) : null),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const EXT_TOKEN = Deno.env.get("PROMOLOG_EXT_TOKEN");
  if (!EXT_TOKEN || req.headers.get("x-ext-token") !== EXT_TOKEN) return json({ error: "unauthorized" }, 401);
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
  if (!OPENROUTER_API_KEY) return json({ error: "OPENROUTER_API_KEY no configurado" }, 500);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({})) as { creators?: any[] };
  const incoming = Array.isArray(body.creators) ? body.creators : [];
  if (!incoming.length) return json({ ok: true, note: "sin creadoras" });

  // dispatch_run (source=extension) para correlacionar entries + evidencia.
  const { data: run } = await (sb as any).from("promolog_dispatch_runs").insert({
    tenant_id: TENANT_ID, apify_actor_id: "browser-extension", status: "running",
    creators_count: incoming.length, payload: { source: "extension" },
  }).select("id, created_at").single();
  const runId = run?.id as string;
  const scanDate = run?.created_at ?? new Date().toISOString();
  const runCtx: RunCtx = { dispatchRunId: runId, apifyRunId: `ext:${runId}`, scanDate, openrouterKey: OPENROUTER_API_KEY };

  // metadata de las creadoras (para el análisis: nicks OF, funnel, plataforma).
  const ids = incoming.map((c) => c.creator_id).filter(Boolean);
  const metaById = new Map<string, any>();
  if (ids.length) {
    const { data: crows } = await (sb as any).from("creators").select("id, instagram_handle, onlyfans_url, piclink_url, name, artistic_name, telegram_handle").in("id", ids);
    for (const r of (crows ?? [])) metaById.set(r.id, r);
  }

  let si = 0, no = 0, pending = 0, entries = 0;
  const results: any[] = [];
  const tgDiscovered = new Map<string, string>(); // creator_id → @handle de Telegram visto en su IG
  for (const c of incoming) {
    const cid = c.creator_id;
    if (!cid || !metaById.has(cid)) { results.push({ handle: c.handle, outcome: "skip_no_creator" }); continue; }
    const meta = metaById.get(cid);
    // La cuenta REALMENTE escaneada. Antes esto priorizaba meta.instagram_handle (la
    // PRINCIPAL) sobre c.handle, así que cuando la extensión escaneaba una 2ª cuenta de IG
    // (creator_social_accounts) la fila quedaba atribuida al handle principal → imposible
    // saber de qué cuenta salió la promo o el error. Ahora manda el handle que se leyó.
    const handle = String(c.handle ?? meta.instagram_handle ?? "").toLowerCase();

    if (c.error) {
      // Etiqueta REAL de la extensión (throttled | http_0 | no_ig_id | http_XXX) → queda
      // en error_reason/notas. Antes todo se aplanaba a "read_failed" y era IMPOSIBLE
      // distinguir throttle de IG vs red vs handle roto al diagnosticar los ⏳.
      const errLabel = String(c.error).toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 24) || "read_failed";
      await insertNoDataEntry(sb, { creator_id: cid, dispatch_run_id: runId, apify_run_id: `ext:${runId}`, scan_date: scanDate, reason: errLabel, source_handle: handle });
      pending++; results.push({ handle, outcome: "pending", reason: String(c.error).slice(0, 60) }); continue;
    }
    const rawItems: any[] = Array.isArray(c.reel_items) ? c.reel_items : [];
    // Puente IG→Telegram: si alguna historia apunta a t.me/<handle>, es la SEÑAL para ir a
    // VERIFICAR ese Telegram. El link en IG NO cuenta como promo de OF (la entry de IG sigue
    // su curso normal → "No"); sólo cuenta si el scan de TG encuentra promo. Guardamos el
    // handle; el registro + disparo van después del loop.
    for (const it of rawItems) {
      const lk = it?.story_link_stickers?.[0]?.story_link?.url ?? it?.story_cta?.[0]?.links?.[0]?.webUri ?? null;
      const tg = telegramHandleFromLink(lk);
      if (tg) { tgDiscovered.set(cid, tg); break; }
    }
    if (rawItems.length === 0) {
      // Reel vacío. Solo afirmamos "No" (sin historias) si CONFIRMAMOS que la cuenta es
      // legible para la sesión: pública, o privada que SÍ seguimos. Si no pudimos
      // confirmar (el friendship check falló → is_private/following nulos), NO afirmamos
      // "No" — sería un falso negativo tipo javibelen. Va a read_failed (re-intentable,
      // se muestra como "No · no verificado").
      const isReadable = c.is_private === false || (c.is_private === true && c.following === true);
      if (c.is_private === true && c.following !== true) {
        await insertNoDataEntry(sb, { creator_id: cid, dispatch_run_id: runId, apify_run_id: `ext:${runId}`, scan_date: scanDate, reason: "follow_pending", source_handle: handle });
        pending++; results.push({ handle, outcome: "pending", reason: "follow_pending" });
      } else if (isReadable) {
        await insertEmptyEntry(sb, { creator_id: cid, dispatch_run_id: runId, apify_run_id: `ext:${runId}`, scan_date: scanDate, source_handle: handle });
        no++; results.push({ handle, outcome: "no", story_items: 0 });
      } else {
        await insertNoDataEntry(sb, { creator_id: cid, dispatch_run_id: runId, apify_run_id: `ext:${runId}`, scan_date: scanDate, reason: "read_failed", source_handle: handle });
        pending++; results.push({ handle, outcome: "pending", reason: "unconfirmed_empty" });
      }
      continue;
    }
    const items = rawItems.map(mapReelItem).filter((s) => s.mediaUrl);
    if (items.length === 0) {
      await insertEmptyEntry(sb, { creator_id: cid, dispatch_run_id: runId, apify_run_id: `ext:${runId}`, scan_date: scanDate, source_handle: handle });
      no++; results.push({ handle, outcome: "no", note: "items sin media" }); continue;
    }
    const nick = ofNickFromUrl(meta.onlyfans_url ?? "");
    const knownPlatform = (String(meta.onlyfans_url ?? "").trim() || String(meta.piclink_url ?? "").trim()) ? "onlyfans" : null;
    const creatorCtx: CreatorCtx = {
      creatorId: cid, sourceHandle: handle, ofNicks: nick ? [nick] : [],
      knownPlatform, knownFunnelHosts: [funnelHost(meta.onlyfans_url), funnelHost(meta.piclink_url)].filter(Boolean),
      name: meta.artistic_name || meta.name || null,
    };
    const r = await analyzeStoryItems(sb, creatorCtx, items, runCtx);
    entries += r.entriesCreated;
    if (r.promotedAny) si++; else no++;
    results.push({ handle, outcome: r.promotedAny ? "si" : "no", story_items: items.length, entries: r.entriesCreated });
  }

  // ── Puente IG→Telegram: verificar el TG que la creadora promociona en su IG ──────
  // Regla del owner: el story a TG NO cuenta por sí solo; se VERIFICA el Telegram y sólo
  // cuenta si TG tiene promo. Acá: (auto)registramos el handle si está vacío (nunca
  // pisamos uno existente) y disparamos telegram-scan (best-effort). Backstop de
  // correctitud: el cron de telegram-scan (2×/día) igual cubre a la creadora una vez
  // registrada, aunque este disparo se corte.
  if (tgDiscovered.size) {
    const CRON = Deno.env.get("CRON_INTERNAL_TOKEN");
    const SB_URL = Deno.env.get("SUPABASE_URL")!;
    const toScan: string[] = [];
    for (const [cid, tgHandle] of tgDiscovered) {
      const meta = metaById.get(cid);
      if (!meta) continue;
      if (!String(meta.telegram_handle ?? "").trim()) {
        // registrar sólo si estaba vacío (el guard JS ya lo confirma; no pisamos nada)
        await (sb as any).from("creators").update({ telegram_handle: tgHandle }).eq("id", cid);
      }
      // no re-disparar si ya hay una lectura de TG reciente (ventana 20h) → no martillar el gateway
      const { data: tgRecent } = await (sb as any).from("promolog_entries").select("id")
        .eq("creator_id", cid).ilike("network", "telegram")
        .gte("created_at", new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()).limit(1);
      if (!tgRecent || !tgRecent.length) toScan.push(cid);
    }
    if (toScan.length && CRON) {
      // best-effort, sin bloquear la respuesta a la extensión; el cron es el backstop.
      fetch(`${SB_URL}/functions/v1/telegram-scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-token": CRON },
        body: JSON.stringify({ only_creator_ids: toScan }),
      }).catch((e) => console.warn("ig→tg verify:", e?.message));
    }
    results.push({ ig_to_tg: [...tgDiscovered.entries()].map(([id, h]) => ({ creator_id: id, tg: h })) });
  }

  await (sb as any).from("promolog_dispatch_runs").update({
    status: "succeeded", creators_succeeded: incoming.length, entries_created: entries, finished_at: new Date().toISOString(),
  }).eq("id", runId);

  return json({ ok: true, run_id: runId, si, no, pending, entries, results: results.slice(0, 80) });
});

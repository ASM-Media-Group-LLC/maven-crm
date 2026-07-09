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
    const { data: crows } = await (sb as any).from("creators").select("id, instagram_handle, onlyfans_url, piclink_url").in("id", ids);
    for (const r of (crows ?? [])) metaById.set(r.id, r);
  }

  let si = 0, no = 0, pending = 0, entries = 0;
  const results: any[] = [];
  for (const c of incoming) {
    const cid = c.creator_id;
    if (!cid || !metaById.has(cid)) { results.push({ handle: c.handle, outcome: "skip_no_creator" }); continue; }
    const meta = metaById.get(cid);
    const handle = String(meta.instagram_handle ?? c.handle ?? "").toLowerCase();

    if (c.error) {
      await insertNoDataEntry(sb, { creator_id: cid, dispatch_run_id: runId, apify_run_id: `ext:${runId}`, scan_date: scanDate, reason: "read_failed" });
      pending++; results.push({ handle, outcome: "pending", reason: String(c.error).slice(0, 60) }); continue;
    }
    const rawItems: any[] = Array.isArray(c.reel_items) ? c.reel_items : [];
    if (rawItems.length === 0) {
      // Reel vacío. Solo afirmamos "No" (sin historias) si CONFIRMAMOS que la cuenta es
      // legible para la sesión: pública, o privada que SÍ seguimos. Si no pudimos
      // confirmar (el friendship check falló → is_private/following nulos), NO afirmamos
      // "No" — sería un falso negativo tipo javibelen. Va a read_failed (re-intentable,
      // se muestra como "No · no verificado").
      const isReadable = c.is_private === false || (c.is_private === true && c.following === true);
      if (c.is_private === true && c.following !== true) {
        await insertNoDataEntry(sb, { creator_id: cid, dispatch_run_id: runId, apify_run_id: `ext:${runId}`, scan_date: scanDate, reason: "follow_pending" });
        pending++; results.push({ handle, outcome: "pending", reason: "follow_pending" });
      } else if (isReadable) {
        await insertEmptyEntry(sb, { creator_id: cid, dispatch_run_id: runId, apify_run_id: `ext:${runId}`, scan_date: scanDate });
        no++; results.push({ handle, outcome: "no", story_items: 0 });
      } else {
        await insertNoDataEntry(sb, { creator_id: cid, dispatch_run_id: runId, apify_run_id: `ext:${runId}`, scan_date: scanDate, reason: "read_failed" });
        pending++; results.push({ handle, outcome: "pending", reason: "unconfirmed_empty" });
      }
      continue;
    }
    const items = rawItems.map(mapReelItem).filter((s) => s.mediaUrl);
    if (items.length === 0) {
      await insertEmptyEntry(sb, { creator_id: cid, dispatch_run_id: runId, apify_run_id: `ext:${runId}`, scan_date: scanDate });
      no++; results.push({ handle, outcome: "no", note: "items sin media" }); continue;
    }
    const nick = ofNickFromUrl(meta.onlyfans_url ?? "");
    const knownPlatform = (String(meta.onlyfans_url ?? "").trim() || String(meta.piclink_url ?? "").trim()) ? "onlyfans" : null;
    const creatorCtx: CreatorCtx = {
      creatorId: cid, sourceHandle: handle, ofNicks: nick ? [nick] : [],
      knownPlatform, knownFunnelHosts: [funnelHost(meta.onlyfans_url), funnelHost(meta.piclink_url)].filter(Boolean),
    };
    const r = await analyzeStoryItems(sb, creatorCtx, items, runCtx);
    entries += r.entriesCreated;
    if (r.promotedAny) si++; else no++;
    results.push({ handle, outcome: r.promotedAny ? "si" : "no", story_items: items.length, entries: r.entriesCreated });
  }

  await (sb as any).from("promolog_dispatch_runs").update({
    status: "succeeded", creators_succeeded: incoming.length, entries_created: entries, finished_at: new Date().toISOString(),
  }).eq("id", runId);

  return json({ ok: true, run_id: runId, si, no, pending, entries, results: results.slice(0, 80) });
});

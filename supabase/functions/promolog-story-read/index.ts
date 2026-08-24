import { corsFor } from "../_shared/cors.ts";
// promolog-story-read — LEE las historias de Instagram DIRECTO de la API móvil de
// IG con la sesión (i.instagram.com/api/v1/feed/user/<id>/story/), en vez del actor
// de Apify (`automation-lab/instagram-stories-scraper`) que devolvía datasets vacíos
// (marcaba todo "pendiente/sin datos" aunque la creadora SÍ tuviera historias).
//
// Cada historia leída pasa por el MISMO análisis de IA que el webhook (módulo
// compartido _shared/promolog-analyze.ts) → escribe promolog_entries con un
// veredicto LIMPIO:
//   • historia con promo   → promoted='true'  (Sí)
//   • lectura OK, sin promo / sin historia → promoted='false' (No)   ← lo que faltaba
//   • lectura FALLÓ (sesión/red) o follow pendiente en cuenta privada → 'pending'
//
// Ban-safety (prioridad del owner): lectura PAUSADA (jitter entre creadoras), una
// sola sesión, API móvil oficial con headers de la app. Se escalona por cron en
// lotes chicos (one_chunk) para no ráfaga.
//
// Body: { only_handles?:[...] (test, sin skip), limit?, force?, one_chunk? }.
// Deploy --no-verify-jwt (auth por X-Cron-Token o JWT admin/manager).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  analyzeStoryItems, insertEmptyEntry, insertNoDataEntry, normalizeHandle,
  ofNickFromUrl, funnelHost, TENANT_ID, type StoryItem, type CreatorCtx, type RunCtx,
} from "../_shared/promolog-analyze.ts";

const corsHeaders = (req: Request) => corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token" });

const PROFILE_ACTOR = "apify~instagram-profile-scraper";
const IG_APP_ID = "936619743392459";
const IG_UA = "Instagram 269.0.0.18.75 Android";
const DEFAULT_LIMIT = 10;          // creadoras por invocación (fuera de only_handles)
const STAGGER_LIMIT = 6;           // one_chunk: lote más chico
const MAX_READ_ATTEMPTS = 3;       // tope de reintentos/día de una lectura fallida (evita re-elegirla sin fin)
const MIN_DELAY_MS = 700;          // pausa base entre creadoras (ban-safety)
const MAX_DELAY_MS = 1800;

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}
// jitter sin Math.random (no disponible acá): deriva de la hora + índice.
function jitter(i: number): number {
  const base = MIN_DELAY_MS + ((Date.now() >> 3) + i * 137) % (MAX_DELAY_MS - MIN_DELAY_MS);
  return base;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// igFetch — GET a la API móvil de IG con la sesión, ruteado por `client` (proxy
// residencial) si está disponible.
async function igFetch(path: string, cookie: string, client?: unknown): Promise<{ ok: boolean; status: number; json: any }> {
  try {
    const opts: any = { headers: { "Cookie": `sessionid=${cookie}`, "x-ig-app-id": IG_APP_ID, "User-Agent": IG_UA } };
    if (client) opts.client = client;
    const resp = await fetch(`https://i.instagram.com/api/v1/${path}`, opts);
    const j = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, json: j };
  } catch (e) {
    return { ok: false, status: 0, json: { message: (e as Error).message } };
  }
}

// buildIgProxyClient — cliente HTTP que sale por el proxy RESIDENCIAL de Apify:
// país fijo (PROMOLOG_IG_PROXY_COUNTRY, default CO) + sesión STICKY por día → misma
// IP residencial durante todo el día (sin "viaje imposible" que flaguea la sesión).
// La proxy-password se saca en runtime (users/me) — nunca se expone ni se guarda.
// Si algo falla devuelve null y la lectura cae a directo (datacenter) para no frenar
// el scan; el response marca `proxied` para saber por dónde salió.
async function buildIgProxyClient(apifyToken: string | undefined, countryOverride?: string): Promise<unknown | null> {
  if (!apifyToken) return null;
  try {
    const me = await fetch(`https://api.apify.com/v2/users/me?token=${apifyToken}`);
    const pass = ((await me.json().catch(() => ({}))) as any)?.data?.proxy?.password;
    if (!pass) return null;
    const country = countryOverride || Deno.env.get("PROMOLOG_IG_PROXY_COUNTRY") || "CO";
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const url = `http://groups-RESIDENTIAL,country-${country},session-mvn${day}:${pass}@proxy.apify.com:8000`;
    return (Deno as any).createHttpClient?.({ proxy: { url } }) ?? null;
  } catch { return null; }
}

// mapReelItem — item crudo del feed de historias de IG → StoryItem normalizado.
function mapReelItem(it: any): StoryItem {
  const isVideo = Number(it?.media_type) === 2;
  const candidates = it?.image_versions2?.candidates ?? [];
  const imageUrl = candidates[0]?.url ?? null;
  const videoUrl = isVideo ? (it?.video_versions?.[0]?.url ?? null) : null;
  const linkUrl = it?.story_link_stickers?.[0]?.story_link?.url
    ?? it?.story_cta?.[0]?.links?.[0]?.webUri ?? null;
  const takenAt = Number(it?.taken_at);
  return {
    type: isVideo ? "video" : "image",
    mediaUrl: imageUrl,   // poster/thumbnail (imagen o frame del video) para Vision
    videoUrl,
    caption: it?.caption?.text ?? null,
    linkUrl,
    timestamp: Number.isFinite(takenAt) && takenAt > 0 ? new Date(takenAt * 1000).toISOString() : null,
    pk: it?.pk != null ? String(it.pk) : (it?.id != null ? String(it.id) : null),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
  const IG_SESSION = Deno.env.get("IG_SESSION_COOKIE");
  const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN");

  if (!OPENROUTER_API_KEY) return json(req, { error: "OPENROUTER_API_KEY no configurado" }, 500);
  if (!IG_SESSION) return json(req, { error: "IG_SESSION_COOKIE no configurado" }, 500);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // ── Auth: cron token o JWT admin/manager ────────────────────────────────
  const cronHeader = req.headers.get("x-cron-token");
  const isCron = cronHeader && CRON_TOKEN && cronHeader === CRON_TOKEN;
  let dispatchedBy: string | null = null;
  if (!isCron) {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json(req, { error: "Missing auth" }, 401);
    const { data: userData, error: uErr } = await sb.auth.getUser(token);
    if (uErr || !userData?.user) return json(req, { error: "Invalid token" }, 401);
    const { data: roleRow } = await (sb as any).from("user_roles").select("role").eq("user_id", userData.user.id).maybeSingle();
    if (!(roleRow?.role && ["admin", "manager", "owner"].includes(roleRow.role))) return json(req, { error: "Forbidden" }, 403);
    dispatchedBy = userData.user.id;
  }

  let body: { only_handles?: string[]; limit?: number; force?: boolean; one_chunk?: boolean; proxy_country?: string; use_proxy?: boolean } = {};
  try { if (req.headers.get("content-type")?.includes("application/json")) body = await req.json(); } catch (_) { /* */ }
  const oneChunk = body.one_chunk === true;

  // ── Elegibles ────────────────────────────────────────────────────────────
  let q = (sb as any).from("v_promolog_eligible_creators").select("id, instagram_handle, name, artistic_name, onlyfans_url").order("id");
  if (body.only_handles?.length) q = q.in("instagram_handle", body.only_handles);
  const { data: creators, error: cErr } = await q;
  if (cErr) return json(req, { error: `Query failed: ${cErr.message}` }, 500);
  if (!creators?.length) return json(req, { skipped: true, reason: "No eligible creators" });

  // Fuera de only_handles: saltar las que HOY ya tienen veredicto definitivo (true/false).
  // Las 'pending' de hoy SÍ se re-leen (son justo las que hay que resolver).
  let eligible = creators as any[];
  if (!body.only_handles?.length) {
    const todayBogota = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
    const { data: done } = await (sb as any)
      .from("promolog_entries").select("creator_id, promoted, error_reason")
      .eq("network", "Instagram")
      .gte("date", `${todayBogota}T00:00:00-05:00`).lte("date", `${todayBogota}T23:59:59-05:00`);
    // Resueltas del día = ya tienen veredicto (true/false) O una razón TERMINAL para
    // hoy (handle roto / follow pendiente → no cambia re-intentando). Las 'read_failed'
    // (fallo transitorio de sesión/red) se reintentan, pero con TOPE de MAX_READ_ATTEMPTS
    // por día — si no, una que falla siempre se re-elige eternamente y tapa la cola.
    const settled = new Set<string>();
    const attempts = new Map<string, number>();
    for (const r of (done ?? []) as any[]) {
      if (r.promoted === "true" || r.promoted === "false") settled.add(r.creator_id);
      else if (r.error_reason === "no_ig_id" || r.error_reason === "follow_pending") settled.add(r.creator_id);
      else attempts.set(r.creator_id, (attempts.get(r.creator_id) ?? 0) + 1); // read_failed / json_parse / etc.
    }
    for (const [cid, n] of attempts) if (n >= MAX_READ_ATTEMPTS) settled.add(cid);
    eligible = eligible.filter((c) => !settled.has(c.id));
  }
  const limit = body.only_handles?.length ? eligible.length : (body.limit ?? (oneChunk ? STAGGER_LIMIT : DEFAULT_LIMIT));
  const batch = eligible.slice(0, limit);
  if (!batch.length) return json(req, { done: true, reason: "Nada por leer (todas resueltas hoy)" });

  // URLs de funnel (onlyfans/piclink) desde `creators` — la vista no trae piclink_url.
  const funnelByCreator = new Map<string, { onlyfans_url: string | null; piclink_url: string | null }>();
  {
    const { data: crows } = await (sb as any).from("creators").select("id, onlyfans_url, piclink_url").in("id", batch.map((c) => c.id));
    for (const r of (crows ?? []) as any[]) funnelByCreator.set(r.id, { onlyfans_url: r.onlyfans_url, piclink_url: r.piclink_url });
  }

  // ── Resolver ig_user_id (caché promolog_ig_identity; unknowns via actor de perfil) ──
  const idByCreator = new Map<string, string>();
  const { data: cached } = await (sb as any)
    .from("promolog_ig_identity").select("creator_id, ig_user_id")
    .in("creator_id", batch.map((c) => c.id));
  for (const r of (cached ?? []) as any[]) idByCreator.set(r.creator_id, r.ig_user_id);

  const unresolved = batch.filter((c) => !idByCreator.has(c.id));
  if (unresolved.length && APIFY_TOKEN) {
    const wanted = unresolved.map((c) => normalizeHandle(c.instagram_handle)).filter(Boolean);
    try {
      const resp = await fetch(`https://api.apify.com/v2/acts/${PROFILE_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: wanted, resultsType: "details", resultsLimit: 1, proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] } }),
      });
      if (resp.ok) {
        const items = await resp.json().catch(() => []) as any[];
        const idByU = new Map<string, string>();
        for (const it of (Array.isArray(items) ? items : [])) {
          const u = normalizeHandle(it?.username ?? it?.inputUrl ?? it?.url ?? "");
          if (u && it?.id != null) idByU.set(u, String(it.id));
        }
        for (const c of unresolved) {
          const id = idByU.get(normalizeHandle(c.instagram_handle));
          if (id) {
            idByCreator.set(c.id, id);
            // PK compuesta desde 20260730013000 (una fila por creadora+cuenta).
            await (sb as any).from("promolog_ig_identity").upsert(
              { creator_id: c.id, handle: normalizeHandle(c.instagram_handle), ig_user_id: id, resolved_at: new Date().toISOString() },
              { onConflict: "creator_id,handle" });
          }
        }
      }
    } catch (_) { /* los que queden sin id → 'pending' abajo */ }
  }

  // ── Crear dispatch_run (correlación de entries + evidencia) ───────────────
  const { data: run } = await (sb as any).from("promolog_dispatch_runs").insert({
    tenant_id: TENANT_ID, apify_actor_id: "direct-ig-read", status: "running",
    creators_count: batch.length, dispatched_by: dispatchedBy, retry_count: 0,
    payload: { source: "direct-ig-read", creator_ids: batch.map((c) => c.id) },
  }).select("id, created_at").single();
  const runId = run?.id as string;
  const scanDate = run?.created_at ?? new Date().toISOString();
  // apify_run_id sintético: la galería del frontend (collectDayStories) agrupa las
  // historias del bot por apify_run_id. Un valor no-null y estable por run agrupa
  // bien las stories de UNA creadora en este scan (dedup por story_index).
  const synthRunId = `direct:${runId}`;
  const runCtx: RunCtx = { dispatchRunId: runId, apifyRunId: synthRunId, scanDate, openrouterKey: OPENROUTER_API_KEY };

  // IMPORTANTE: por DEFAULT sale DIRECTO (IP de datacenter). El proxy residencial de
  // Apify se probó y NO sirve: IG devuelve HTTP 400 a cualquier request que salga por
  // él (CO y US), mientras que directo da 200. La API móvil de IG rechaza el tunneling
  // del proxy residencial de Apify. Queda solo como opción MANUAL de test (use_proxy)
  // por si en el futuro probamos otro proveedor (proxy móvil). NUNCA lo prende el cron.
  const igClient = body.use_proxy ? await buildIgProxyClient(APIFY_TOKEN, body.proxy_country) : null;

  // ── Leer + analizar cada creadora, PAUSADO ────────────────────────────────
  const results: any[] = [];
  let entriesTotal = 0, promotedCount = 0, noCount = 0, pendingCount = 0;
  for (let i = 0; i < batch.length; i++) {
    const c = batch[i];
    const handle = normalizeHandle(c.instagram_handle);
    const igId = idByCreator.get(c.id);
    if (i > 0) await sleep(jitter(i));

    if (!igId) {
      await insertNoDataEntry(sb, { creator_id: c.id, dispatch_run_id: runId, apify_run_id: synthRunId, scan_date: scanDate, reason: "no_ig_id" });
      pendingCount++; results.push({ handle, outcome: "pending", reason: "no_ig_id" }); continue;
    }

    // metadata para el análisis (nicks OF + funnel + plataforma conocida)
    const fu = funnelByCreator.get(c.id) ?? { onlyfans_url: c.onlyfans_url ?? null, piclink_url: null };
    const nick = ofNickFromUrl(fu.onlyfans_url ?? "");
    // piclink se relaciona con OF (pedido del owner): una creadora cuyo funnel es piclink
    // se considera promoción de OnlyFans.
    const knownPlatform = (String(fu.onlyfans_url ?? "").trim() || String(fu.piclink_url ?? "").trim()) ? "onlyfans" : null;
    const creatorCtx: CreatorCtx = {
      creatorId: c.id, sourceHandle: handle, ofNicks: nick ? [nick] : [],
      knownPlatform, knownFunnelHosts: [funnelHost(fu.onlyfans_url), funnelHost(fu.piclink_url)].filter(Boolean),
      name: c.artistic_name || c.name || null,
    };

    const st = await igFetch(`feed/user/${igId}/story/`, IG_SESSION, igClient);
    if (!st.ok) {
      await insertNoDataEntry(sb, { creator_id: c.id, dispatch_run_id: runId, apify_run_id: synthRunId, scan_date: scanDate, reason: "read_failed" });
      pendingCount++; results.push({ handle, outcome: "pending", reason: `http_${st.status}` }); continue;
    }
    const items: any[] = st.json?.reel?.items ?? [];

    if (items.length === 0) {
      // Sin historia. ¿Es "No" real o no la podemos ver (privada + follow pendiente)?
      const fr = await igFetch(`friendships/show/${igId}/`, IG_SESSION, igClient);
      const isPrivate = fr.json?.is_private === true;
      const following = fr.json?.following === true;
      if (isPrivate && !following) {
        await insertNoDataEntry(sb, { creator_id: c.id, dispatch_run_id: runId, apify_run_id: synthRunId, scan_date: scanDate, reason: "follow_pending" });
        pendingCount++; results.push({ handle, outcome: "pending", reason: "follow_pending" });
      } else {
        await insertEmptyEntry(sb, { creator_id: c.id, dispatch_run_id: runId, apify_run_id: synthRunId, scan_date: scanDate });
        noCount++; results.push({ handle, outcome: "no", story_items: 0 });
      }
      continue;
    }

    const storyItems = items.map(mapReelItem).filter((s) => s.mediaUrl);
    if (storyItems.length === 0) {
      await insertEmptyEntry(sb, { creator_id: c.id, dispatch_run_id: runId, apify_run_id: synthRunId, scan_date: scanDate });
      noCount++; results.push({ handle, outcome: "no", story_items: 0, note: "items sin media" }); continue;
    }
    const r = await analyzeStoryItems(sb, creatorCtx, storyItems, runCtx);
    entriesTotal += r.entriesCreated;
    if (r.promotedAny) promotedCount++; else noCount++;
    results.push({ handle, outcome: r.promotedAny ? "si" : "no", story_items: storyItems.length, entries: r.entriesCreated, errors: r.errors.slice(0, 3) });
  }

  await (sb as any).from("promolog_dispatch_runs").update({
    status: "succeeded", creators_succeeded: batch.length, entries_created: entriesTotal,
    finished_at: new Date().toISOString(),
  }).eq("id", runId);

  return json(req, {
    ok: true, run_id: runId, creators: batch.length, proxied: !!igClient,
    si: promotedCount, no: noCount, pending: pendingCount, entries: entriesTotal, results,
  });
});

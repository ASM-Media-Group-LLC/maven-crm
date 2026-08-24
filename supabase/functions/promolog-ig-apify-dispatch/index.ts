import { corsFor } from "../_shared/cors.ts";
// promolog-ig-apify-dispatch — escaneo de historias de IG SERVER-SIDE por Apify,
// sin navegador ni cuenta scanner (Plan B a la extensión, que depende de una sesión
// de IG que IG puede soft-bloquear). Usa el MISMO actor que analyze_profile_deep
// (apify~instagram-scraper, resultsType=stories) con proxy RESIDENCIAL de Apify —
// la lectura sale de la infra de Apify, NO de nuestra IP/cuenta, así que no hay
// cuenta propia que se pueda quemar. El costo es plata (Apify), no riesgo de ban.
//
// Flujo async (el scrape tarda ~min y el cron/edge no espera):
//   1. Junta TODOS los targets IG elegibles (principal + creator_social_accounts).
//   2. Lanza UN run de Apify con todos los directUrls + webhook a
//      promolog-ig-apify-callback. Guarda un promolog_dispatch_runs con el mapa
//      username→creator_id (para que el callback atribuya cada story).
//   3. El callback baja el dataset, mapea al shape crudo de IG y lo reenvía a
//      promolog-ingest-stories → reusa TODA la clasificación (Sí/No binario,
//      dedup por story_pk, guardas de watermark/nick de OF). Cero lógica duplicada.
//
// Modo measure: { measure:true, handles:[...] } corre SÍNCRONO un lote chico y
// devuelve los items CRUDOS de Apify (para calibrar el mapeo) + usageTotalUsd
// (costo real) — para medir antes de fijar cadencia. No escribe promolog_entries.
//
// Auth: x-cron-token (lo dispara el cron) o measure con el mismo token.
// Deploy --no-verify-jwt (entry en config.toml).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = (req: Request) => corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token" });
const json = (req: Request, b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors(req), "Content-Type": "application/json" } });

const APIFY_ACTOR = "apify~instagram-scraper";
const RESULTS_LIMIT = 20;          // historias por perfil (la mayoría sube 5-15/día)
const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d";
const norm = (s: unknown) =>
  String(s ?? "").toLowerCase().replace(/.*instagram\.com\//i, "").replace(/[@/\s]/g, "").replace(/[/?#].*$/, "").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  const CRON = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
  const cronHeader = req.headers.get("x-cron-token") ?? "";
  if (!CRON || cronHeader !== CRON) return json(req, { ok: false, error: "unauthorized" }, 401);

  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
  if (!APIFY_TOKEN) return json(req, { ok: false, error: "APIFY_TOKEN no configurado" }, 500);
  const SB_URL = Deno.env.get("SUPABASE_URL")!;
  const sb = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const body = await req.json().catch(() => ({})) as { measure?: boolean; handles?: string[]; resolve_ids?: boolean };

  // ── MODO resolve_ids: pre-resolver y sembrar los ig_user_id que faltan ────
  // No es scraping de historias: usa el actor de PERFIL de Apify (el mismo que
  // check_ig_handles, que anda) para traer el user-id numérico de los targets IG
  // sin id cacheado, y los siembra en promolog_ig_identity. Efecto: la extensión
  // deja de llamar a web_profile_info (el endpoint que IG estrangula primero) para
  // esas cuentas → la sesión aguanta más lecturas antes de que IG la rate-limitee.
  if (body.resolve_ids) {
    const PROFILE_ACTOR = "apify~instagram-profile-scraper";
    const { data: princ } = await sb.from("v_promolog_eligible_creators").select("id, instagram_handle");
    const targets = new Map<string, string>(); // handle → creator_id
    for (const c of (princ ?? []) as any[]) { const u = norm(c.instagram_handle); if (u) targets.set(u, c.id); }
    const ids = (princ ?? []).map((c: any) => c.id);
    if (ids.length) {
      const { data: extra } = await sb.from("creator_social_accounts").select("creator_id, username")
        .eq("active", true).eq("network", "instagram").in("creator_id", ids);
      for (const s of (extra ?? []) as any[]) { const u = norm(s.username); if (u && !targets.has(u)) targets.set(u, s.creator_id); }
    }
    // handles sin id cacheado
    const { data: cached } = await sb.from("promolog_ig_identity").select("creator_id, handle").in("creator_id", ids);
    const cachedKey = new Set((cached ?? []).map((r: any) => `${r.creator_id}:${norm(r.handle)}`));
    const faltan = [...targets.entries()].filter(([h, cid]) => !cachedKey.has(`${cid}:${h}`));
    if (!faltan.length) return json(req, { ok: true, resolve_ids: true, faltan: 0 });
    const wanted = faltan.map(([h]) => h);
    let items: any[] = [];
    try {
      const resp = await fetch(`https://api.apify.com/v2/acts/${PROFILE_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: wanted, resultsType: "details", resultsLimit: 1, proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] } }),
      });
      if (resp.ok) items = await resp.json().catch(() => []);
    } catch (e) { return json(req, { ok: false, error: `apify_resolve: ${(e as Error).message}` }, 502); }
    const idByU = new Map<string, string>();
    for (const it of (Array.isArray(items) ? items : [])) {
      const u = norm(it?.username ?? it?.inputUrl ?? it?.url ?? "");
      if (u && it?.id != null && /^\d{1,32}$/.test(String(it.id))) idByU.set(u, String(it.id));
    }
    const upserts = faltan
      .filter(([h]) => idByU.has(h))
      .map(([h, cid]) => ({ creator_id: cid, handle: h, ig_user_id: idByU.get(h), resolved_at: new Date().toISOString() }));
    let seeded = 0;
    if (upserts.length) {
      const { error: upErr } = await sb.from("promolog_ig_identity").upsert(upserts, { onConflict: "creator_id,handle" });
      if (upErr) return json(req, { ok: false, error: `upsert: ${upErr.message}`, resueltos: upserts.length }, 500);
      seeded = upserts.length;
    }
    return json(req, { ok: true, resolve_ids: true, faltaban: faltan.length, resueltos_apify: idByU.size, sembrados: seeded, no_resueltos: wanted.filter((h) => !idByU.has(h)) });
  }

  // ── Resolver targets: username → creator_id (principal + extras) ──────────
  const targetByUser = new Map<string, string>(); // username → creator_id
  if (body.measure && Array.isArray(body.handles) && body.handles.length) {
    // measure: los handles se resuelven a creator_id sólo para reportar (no persiste)
    for (const h of body.handles) { const u = norm(h); if (u) targetByUser.set(u, "measure"); }
  } else {
    const { data: princ, error } = await sb
      .from("v_promolog_eligible_creators").select("id, instagram_handle");
    if (error) return json(req, { ok: false, error: error.message }, 500);
    for (const c of (princ ?? []) as any[]) { const u = norm(c.instagram_handle); if (u) targetByUser.set(u, c.id); }
    const ids = (princ ?? []).map((c: any) => c.id);
    if (ids.length) {
      const { data: extra } = await sb
        .from("creator_social_accounts").select("creator_id, username")
        .eq("active", true).eq("network", "instagram").in("creator_id", ids);
      for (const s of (extra ?? []) as any[]) { const u = norm(s.username); if (u && !targetByUser.has(u)) targetByUser.set(u, s.creator_id); }
    }
  }
  const usernames = [...targetByUser.keys()];
  if (!usernames.length) return json(req, { ok: false, error: "sin_targets" }, 400);

  const directUrls = usernames.map((u) => `https://www.instagram.com/${u}/`);

  const apifyInput = {
    directUrls,
    resultsType: "stories",
    resultsLimit: RESULTS_LIMIT,
    addParentData: true,                 // ownerData (followers/bio) + ownerUsername para atribuir
    searchType: "user",
    searchLimit: 1,
    // Proxy RESIDENCIAL: es la medida anti-ban del lado del scrape (la infra de Apify
    // sale por IPs residenciales, no datacenter, que es lo que IG flaggea).
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
  };

  // ── MODO MEDICIÓN: síncrono, devuelve items crudos + costo real ──────────
  if (body.measure) {
    const t0 = Date.now();
    let runId: string | null = null;
    try {
      const runResp = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&clean=true&format=json`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(apifyInput),
      });
      const runIdHeader = runResp.headers.get("x-apify-run-id");
      runId = runIdHeader ?? null;
      if (!runResp.ok) return json(req, { ok: false, error: `apify_${runResp.status}: ${(await runResp.text()).slice(0, 300)}` }, 502);
      const items = await runResp.json().catch(() => []) as any[];
      // usageTotalUsd: consultar el run object (run-sync-get-dataset-items no lo trae)
      let usageUsd: number | null = null;
      if (runId) {
        try {
          const r = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
          const rj = await r.json().catch(() => ({}));
          usageUsd = rj?.data?.usageTotalUsd ?? null;
        } catch { /* costo best-effort */ }
      }
      const byU = new Map<string, number>();
      for (const it of (Array.isArray(items) ? items : [])) {
        const u = norm(it?.ownerUsername ?? it?.username ?? it?.inputUrl ?? "");
        if (u) byU.set(u, (byU.get(u) ?? 0) + 1);
      }
      return json(req, {
        ok: true, measure: true, run_id: runId,
        handles_pedidos: usernames.length, items_totales: Array.isArray(items) ? items.length : 0,
        stories_por_handle: Object.fromEntries(byU),
        costo_usd: usageUsd, duracion_s: Math.round((Date.now() - t0) / 1000),
        muestra_item_crudo: (Array.isArray(items) ? items : []).slice(0, 2),
      });
    } catch (e) {
      return json(req, { ok: false, error: `measure_falló: ${(e as Error).message}`, run_id: runId }, 502);
    }
  }

  // ── MODO NORMAL: async con webhook al callback ───────────────────────────
  const { data: run } = await sb.from("promolog_dispatch_runs").insert({
    tenant_id: TENANT_ID, apify_actor_id: APIFY_ACTOR, status: "running",
    creators_count: usernames.length,
    payload: { source: "apify-stories", target_by_user: Object.fromEntries(targetByUser) },
  }).select("id").single();
  const jobId = run?.id as string;

  const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const webhooks = [{
    eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"],
    requestUrl: `${SB_URL}/functions/v1/promolog-ig-apify-callback?job_id=${jobId}`,
    headersTemplate: JSON.stringify({ Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" }),
    payloadTemplate: JSON.stringify({ runId: "{{resource.id}}", status: "{{resource.status}}", defaultDatasetId: "{{resource.defaultDatasetId}}", job_id: jobId }),
  }];
  // base64url (NO base64 estándar — Apify lo rechaza en silencio).
  const webhooksB64 = btoa(JSON.stringify(webhooks)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  let apifyRunId: string | null = null, launchErr: string | null = null;
  try {
    const resp = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${APIFY_TOKEN}&webhooks=${webhooksB64}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(apifyInput),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) launchErr = `apify_${resp.status}: ${JSON.stringify(data).slice(0, 200)}`;
    else { apifyRunId = data?.data?.id ?? null; if (!apifyRunId) launchErr = "apify_run_sin_id"; }
  } catch (e) { launchErr = (e as Error).message; }

  if (launchErr) {
    await sb.from("promolog_dispatch_runs").update({ status: "failed", error: launchErr, finished_at: new Date().toISOString() }).eq("id", jobId);
    return json(req, { ok: false, error: launchErr, job_id: jobId }, 502);
  }
  await sb.from("promolog_dispatch_runs").update({ apify_run_id: apifyRunId }).eq("id", jobId);
  return json(req, { ok: true, job_id: jobId, apify_run_id: apifyRunId, targets: usernames.length });
});
